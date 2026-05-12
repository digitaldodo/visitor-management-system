import { request } from "../shared/httpClient.js";
import { initAppErrorBoundary } from "../shared/appErrorBoundary.js";
import { formatDate, formatDurationMinutes, formatStatus, minutesBetween } from "../shared/formatters.js";
import { requireRole } from "../shared/roleGuard.js";
import { initPortalShell, renderLoadingList, renderMetrics, renderWorkList, workCard, escapeHtml } from "../shared/portalShell.js";
import { initVisitorModule } from "../shared/visitorModule.js";
import { badgeDialogMarkup, downloadBadge, printBadge } from "../shared/badgeStudio.js";
import { checkInVisitor, checkOutVisitor, getSecurityMonitoring, getVisitorPass, markBadgePrinted, updateVisitor, uploadVisitorPhoto, verifyQrPayload } from "../shared/visitorApi.js";
import { showToast } from "../shared/toast.js";

const ROUTES = ["queue", "monitoring", "check-in", "photo", "qr", "badges"];
const state = {
  monitoringQuery: "",
  monitoringDebounce: 0,
  activeBadge: null,
  activeVerification: null,
};

document.addEventListener("DOMContentLoaded", async () => {
  initAppErrorBoundary();

  const session = requireRole("SECURITY_GUARD");
  if (!session) {
    return;
  }

  initPortalShell(session, {
    allowedRoutes: ROUTES,
    onRefresh: () => loadSecurityPortal(false),
  });
  initVisitorModule("[data-security-visitors]", {
    basePath: "/security",
    title: "Front Desk Registration",
    eyebrow: "Reception Operations",
    canDelete: false,
  });
  initQrVerification();
  initBadgeActions();
  initMonitoringSearch();
  renderVerificationIdle();
  await loadSecurityPortal();
  window.setInterval(() => loadSecurityPortal(false), 15000);
});

async function loadSecurityPortal(showErrors = true) {
  if (showErrors) {
    renderMetrics([]);
    renderLoadingList("#queue-list");
    renderLoadingList("#checkins-list");
    renderLoadingList("#photo-list");
    renderLoadingList("#badge-list");
    renderLoadingList("#monitor-inside-list");
    renderLoadingList("#monitor-overdue-list");
    renderLoadingList("#monitor-checkedout-list");
    renderLoadingList("#monitor-rejected-list");
  }

  try {
    const [overview, queue, photo, monitoring] = await Promise.all([
      request("/security/overview"),
      request("/security/queue"),
      request("/security/photo-capture"),
      getSecurityMonitoring(state.monitoringQuery),
    ]);

    renderMetrics(overview.data.metrics);
    renderWorkList("#queue-list", queue.data.items || [], queueCard, "No approved arrivals", "Approved visitors waiting for arrival will appear here.");
    renderWorkList("#checkins-list", monitoring.data.currentlyInside || [], checkedInCard, "No active check-ins", "Checked-in visitors will appear here.");
    renderPhotoCapturePanel(photo.data || {});
    renderMonitoring(monitoring.data);
    await renderBadgeList(monitoring.data.approvedVisitors || []);
  } catch (error) {
    if (showErrors) {
      renderWorkList("#queue-list", [], (item) => item, "Queue unavailable", error.message);
      renderWorkList("#checkins-list", [], (item) => item, "Check-ins unavailable", error.message);
      renderWorkList("#photo-list", [], (item) => item, "Camera status unavailable", error.message);
      setCameraFrameStatus(error.message);
      renderWorkList("#badge-list", [], (item) => item, "Badges unavailable", error.message);
      renderWorkList("#monitor-inside-list", [], (item) => item, "Monitoring unavailable", error.message);
      renderWorkList("#monitor-overdue-list", [], (item) => item, "Monitoring unavailable", error.message);
      renderWorkList("#monitor-checkedout-list", [], (item) => item, "Monitoring unavailable", error.message);
      renderWorkList("#monitor-rejected-list", [], (item) => item, "Monitoring unavailable", error.message);
      showToast("Security access blocked", error.message);
    }
  }
}

function initMonitoringSearch() {
  const input = document.querySelector("#monitoring-search");
  input?.addEventListener("input", () => {
    window.clearTimeout(state.monitoringDebounce);
    state.monitoringDebounce = window.setTimeout(async () => {
      state.monitoringQuery = input.value.trim();
      await loadSecurityPortal(false);
    }, 240);
  });
}

function renderMonitoring(data = {}) {
  const counts = data.counts || {};
  setCount("#monitor-count-inside", counts.currentlyInside || 0);
  setCount("#monitor-count-overdue", counts.overdueVisitors || 0);
  setCount("#monitor-count-checkedout", counts.checkedOutVisitors || 0);
  setCount("#monitor-count-rejected", counts.rejectedVisitors || 0);

  renderWorkList("#monitor-inside-list", data.currentlyInside || [], monitorCard, "No visitors inside", "Checked-in visitors will appear here.");
  renderWorkList("#monitor-overdue-list", data.overdueVisitors || [], overdueCard, "No overdue visitors", "Visitors who exceed the approved window will appear here.");
  renderWorkList("#monitor-checkedout-list", data.checkedOutVisitors || [], monitorCard, "No recent check-outs", "Completed departures will appear here.");
  renderWorkList("#monitor-rejected-list", data.rejectedVisitors || [], rejectedCard, "No rejected visitors", "Denied requests will appear here.");
}

function renderPhotoCapturePanel(data = {}) {
  const browserSupport = navigator.mediaDevices?.getUserMedia ? "Available in this browser" : "Use secure file upload";
  const uploadsConfigured = String(data.photoUploads || "Unavailable");
  setCameraFrameStatus(
    uploadsConfigured === "Configured"
      ? "Photo capture is ready. Use queue actions or QR verification to attach identity photos."
      : "Photo uploads are not configured yet. Security can still review passes, but badge photo updates are unavailable."
  );
  renderWorkList("#photo-list", [
    ["Capture mode", data.captureMode || "Browser camera or secure file capture"],
    ["Browser support", browserSupport],
    ["Photo uploads", uploadsConfigured],
    ["Accepted input", data.acceptedInput || "image/*"],
    ["Storage policy", data.storagePolicy || "Visitor photos stay attached to scoped visitor records."],
  ], ([label, value]) => workCard(label, value), "Camera status unavailable", "Device readiness will appear after the API responds.");
}

async function renderBadgeList(visitors) {
  const list = document.querySelector("#badge-list");
  if (!list) {
    return;
  }
  if (!visitors.length) {
    list.innerHTML = `
      <article class="badge-empty">
        <h3>No approved passes</h3>
        <p>Approved visitor badges will appear here automatically.</p>
      </article>
    `;
    return;
  }

  const passes = await Promise.all(visitors.slice(0, 8).map(async (visitor) => {
    try {
      const response = await getVisitorPass("/security", visitor.id);
      return response.data;
    } catch {
      return null;
    }
  }));

  const validPasses = passes.filter(Boolean);
  list.innerHTML = validPasses.length ? validPasses.map(passCard).join("") : `
    <article class="badge-empty">
      <h3>Badges unavailable</h3>
      <p>Approved passes could not be loaded. Refresh and try again.</p>
    </article>
  `;
}

function passCard(pass) {
  const tone = passBadgeTone(pass);
  return `
    <article class="visitor-pass-card">
      <div class="visitor-pass-card__summary">
        <div>
          <h3>${escapeHtml(pass.fullName)}</h3>
          <p>${escapeHtml(pass.companyName || "Unlisted organization")} · ${escapeHtml(pass.hostEmployee || "Unassigned")}</p>
          <small>${escapeHtml(pass.badgeId || pass.passCode || "Badge pending")} · ${escapeHtml(pass.checkInState || pass.statusLabel || pass.validityStatus)}</small>
        </div>
        <span class="status-badge status-badge--${tone}">${escapeHtml(pass.validityStatus || pass.statusLabel)}</span>
      </div>
      <div class="visitor-pass-card__actions">
        <button class="button button--ghost" type="button" data-badge-open="${escapeHtml(pass.visitorId)}">Open badge</button>
      </div>
    </article>
  `;
}

function initBadgeActions() {
  document.querySelector("#badge-list")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-badge-open]");
    if (!button) {
      return;
    }
    try {
      const response = await getVisitorPass("/security", button.dataset.badgeOpen);
      state.activeBadge = response.data;
      openBadgeModal(state.activeBadge);
    } catch (error) {
      showToast("Badge unavailable", error.message);
    }
  });

  const modal = document.querySelector("#security-badge-modal");
  modal?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-badge-action]");
    if (!button || !state.activeBadge) {
      if (event.target === modal) {
        closeBadgeModal();
      }
      return;
    }

    const action = button.dataset.badgeAction;
    try {
      if (action === "close") {
        closeBadgeModal();
      }
      if (action === "print") {
        await printBadge(state.activeBadge);
      }
      if (action === "png" || action === "pdf") {
        await downloadBadge(state.activeBadge, action);
        showToast("Badge downloaded", `Saved ${action.toUpperCase()} badge export.`);
      }
      if (action === "record-print") {
        await markBadgePrinted("/security", state.activeBadge.visitorId);
        showToast("Badge recorded", "Print timestamp saved.");
        await loadSecurityPortal(false);
      }
    } catch (error) {
      showToast("Badge action failed", error.message);
    }
  });
}

function openBadgeModal(pass) {
  const modal = document.querySelector("#security-badge-modal");
  if (!modal) {
    return;
  }
  modal.classList.remove("is-hidden");
  modal.innerHTML = badgeDialogMarkup(pass, { includeRecordPrint: true });
}

function closeBadgeModal() {
  const modal = document.querySelector("#security-badge-modal");
  modal?.classList.add("is-hidden");
  if (modal) {
    modal.innerHTML = "";
  }
}

function initQrVerification() {
  const form = document.querySelector("#qr-verify-form");
  const input = document.querySelector("#qr-payload-input");
  const scanButton = document.querySelector("#qr-camera-button");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await verifyScannedValue(input?.value || "");
  });
  scanButton?.addEventListener("click", startCameraScan);
  document.querySelector("#qr-result")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-qr-action]");
    if (!button || !state.activeVerification?.visitorId) {
      return;
    }
    try {
      if (button.dataset.qrAction === "capture-photo") {
        await capturePhotoForVisitor(state.activeVerification.visitorId);
      }
      if (button.dataset.qrAction === "check-in" && state.activeVerification.canCheckIn) {
        await checkInVisitor("/security", state.activeVerification.visitorId);
        showToast("Visitor checked in", "Physical entry approved and recorded.");
      }
      if (button.dataset.qrAction === "check-out" && state.activeVerification.canCheckOut) {
        await checkOutVisitor("/security", state.activeVerification.visitorId);
        showToast("Visitor checked out", "Departure recorded.");
      }
      await loadSecurityPortal(false);
      await verifyScannedValue(document.querySelector("#qr-payload-input")?.value || "");
    } catch (error) {
      showToast("Checkpoint action failed", error.message);
    }
  });
}

async function verifyScannedValue(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    showToast("Scan needed", "Scan or paste a visitor QR payload.");
    return;
  }
  const submit = document.querySelector("#qr-verify-form button[type='submit']");
  submit?.toggleAttribute("disabled", true);
  submit?.classList.add("is-loading");
  submit?.setAttribute("aria-busy", "true");
  try {
    const response = await verifyQrPayload("/security", trimmed);
    state.activeVerification = response.data;
    renderVerification(response.data);
    showToast(response.data.headline || (response.data.valid ? "Pass verified" : "Pass review required"), response.data.message);
  } catch (error) {
    renderVerificationFailure(error.message);
    showToast("Verification failed", error.message);
  } finally {
    submit?.toggleAttribute("disabled", false);
    submit?.classList.remove("is-loading");
    submit?.removeAttribute("aria-busy");
  }
}

function renderVerificationIdle() {
  const target = document.querySelector("#qr-result");
  if (!target) {
    return;
  }
  target.innerHTML = `
    <article class="qr-result qr-result--idle">
      <strong>Ready to scan</strong>
      <p>Scan a visitor badge or paste a QR payload to validate the live approval record, photo, and access window.</p>
    </article>
  `;
}

function renderVerificationFailure(message) {
  const target = document.querySelector("#qr-result");
  if (!target) {
    return;
  }
  target.innerHTML = `
    <article class="qr-result qr-result--danger">
      <strong>Verification unavailable</strong>
      <p>${escapeHtml(message)}</p>
    </article>
  `;
}

function renderVerification(result) {
  const target = document.querySelector("#qr-result");
  if (!target) {
    return;
  }
  const tone = resultTone(result);
  const statusTone = verificationStatusTone(result);
  target.innerHTML = `
    <article class="qr-result qr-result--${tone}">
      <div class="qr-result__header">
        <div>
          <strong>${escapeHtml(result.headline || (result.valid ? "Pass verified" : "Pass review required"))}</strong>
          <p>${escapeHtml(result.message)}</p>
        </div>
        <span class="status-badge status-badge--${statusTone}">${escapeHtml(result.validityStatus || result.statusLabel || result.resultCode || "Review")}</span>
      </div>
      ${result.recommendedAction ? `<div class="qr-result__guidance">${escapeHtml(result.recommendedAction)}</div>` : ""}
      ${result.recognized ? `
        <div class="qr-result__identity">
          <div class="qr-result__photo-wrap">
            ${result.photoUrl ? `<img src="${escapeHtml(result.photoUrl)}" alt="${escapeHtml(result.fullName)} photo" />` : `<div class="qr-result__photo-placeholder">No photo on file</div>`}
          </div>
          <dl>
            <div><dt>Visitor</dt><dd>${escapeHtml(result.fullName || "Unknown visitor")}</dd></div>
            <div><dt>Company</dt><dd>${escapeHtml(result.companyName || "Unlisted")}</dd></div>
            <div><dt>Host</dt><dd>${escapeHtml(result.hostEmployee || "Unassigned")}</dd></div>
            <div><dt>Host team</dt><dd>${escapeHtml(result.hostEmployeeDepartment || "Not recorded")}</dd></div>
            <div><dt>Badge ID</dt><dd>${escapeHtml(result.badgeId || "Not issued")}</dd></div>
            <div><dt>Pass code</dt><dd>${escapeHtml(result.passCode || "Not issued")}</dd></div>
            <div><dt>Workflow status</dt><dd>${escapeHtml(result.statusLabel || result.status || "Not recorded")}</dd></div>
            <div><dt>Validity</dt><dd>${escapeHtml(result.validityStatus || "Not recorded")}</dd></div>
            <div><dt>Issued</dt><dd>${escapeHtml(formatDate(result.issuedAt))}</dd></div>
            <div><dt>Expires</dt><dd>${escapeHtml(formatDate(result.expiresAt))}</dd></div>
            <div><dt>Visit window</dt><dd>${escapeHtml(formatWindow(result.scheduledStartTime, result.scheduledEndTime))}</dd></div>
            <div><dt>Check-in state</dt><dd>${escapeHtml(checkpointStateText(result))}</dd></div>
          </dl>
        </div>
        <div class="qr-result__actions">
          ${!result.photoUrl ? `<button class="button button--ghost" type="button" data-qr-action="capture-photo">Capture or upload photo</button>` : ""}
          ${result.canCheckIn ? `<button class="button button--primary" type="button" data-qr-action="check-in">Approve entry and check in</button>` : ""}
          ${result.canCheckOut ? `<button class="button button--ghost" type="button" data-qr-action="check-out">Check out visitor</button>` : ""}
        </div>
      ` : ""}
    </article>
  `;
}

async function startCameraScan() {
  if (!("BarcodeDetector" in window) || !navigator.mediaDevices?.getUserMedia) {
    showToast("Camera scan unavailable", "Use a hardware scanner or paste the QR payload.");
    return;
  }

  const video = document.querySelector("#qr-scan-video");
  const input = document.querySelector("#qr-payload-input");
  if (!video) {
    return;
  }

  const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    video.srcObject = stream;
    video.classList.remove("is-hidden");
  } catch {
    showToast("Camera unavailable", "Allow camera access or paste the QR payload manually.");
    return;
  }

  const scan = async () => {
    const codes = await detector.detect(video).catch(() => []);
    if (codes.length) {
      const scanned = codes[0].rawValue;
      input.value = scanned;
      stream.getTracks().forEach((track) => track.stop());
      video.classList.add("is-hidden");
      await verifyScannedValue(scanned);
      return;
    }
    window.requestAnimationFrame(scan);
  };
  window.requestAnimationFrame(scan);
}

function queueCard(visitor) {
  return `
    <article class="work-card">
      <h3>${escapeHtml(visitor.fullName)}</h3>
      <p>${escapeHtml(visitor.companyName || "Unlisted organization")} · ${escapeHtml(visitor.hostEmployee || "Unassigned")}</p>
      <small>${escapeHtml(visitor.badgeId || visitor.qrCode || "Badge pending")} · ${escapeHtml(formatDate(visitor.qrExpiresAt || visitor.scheduledStartTime || visitor.createdAt))}</small>
      ${!visitor.photoUrl ? `<button class="button button--ghost" type="button" data-queue-photo="${escapeHtml(visitor.id)}">Capture photo</button>` : ""}
    </article>
  `;
}

function checkedInCard(visitor) {
  return `
    <article class="work-card">
      <h3>${escapeHtml(visitor.fullName)}</h3>
      <p>${escapeHtml(visitor.hostEmployee || "Unassigned")}</p>
      <small>${escapeHtml(formatDurationMinutes(minutesBetween(visitor.checkInTime, visitor.checkOutTime || new Date())))}</small>
    </article>
  `;
}

function monitorCard(visitor) {
  return `
    <article class="work-card">
      <h3>${escapeHtml(visitor.fullName)}</h3>
      <p>${escapeHtml(visitor.companyName || "Unlisted organization")} · ${escapeHtml(visitor.hostEmployee || "Unassigned")}</p>
      <small>${escapeHtml(visitor.badgeId || visitor.qrCode || "Badge reference pending")} · ${escapeHtml(formatDate(visitor.checkInTime || visitor.checkOutTime || visitor.createdAt))}</small>
    </article>
  `;
}

function overdueCard(visitor) {
  return `
    <article class="work-card work-card--alert">
      <h3>${escapeHtml(visitor.fullName)}</h3>
      <p>${escapeHtml(visitor.hostEmployee || "Unassigned")} · ${escapeHtml(formatDurationMinutes(minutesBetween(visitor.checkInTime, new Date())))}</p>
      <small>${escapeHtml(formatDate(visitor.scheduledEndTime || visitor.qrExpiresAt))}</small>
    </article>
  `;
}

function rejectedCard(visitor) {
  return `
    <article class="work-card">
      <h3>${escapeHtml(visitor.fullName)}</h3>
      <p>${escapeHtml(visitor.rejectionReason || "Rejected by host")}</p>
      <small>${escapeHtml(formatDate(visitor.rejectedAt || visitor.updatedAt || visitor.createdAt))}</small>
    </article>
  `;
}

function passBadgeTone(pass) {
  const value = String(pass.validityStatus || pass.status || "").toLowerCase();
  if (value.includes("checked in")) {
    return "checked-in";
  }
  if (value.includes("checked out")) {
    return "checked-out";
  }
  if (value.includes("expired") || value.includes("denied") || value.includes("rejected")) {
    return "expired";
  }
  if (value.includes("overdue") || value.includes("scheduled") || value.includes("pending")) {
    return "pending";
  }
  return "approved";
}

function resultTone(result) {
  if (result.valid) {
    return "success";
  }
  if (["ALREADY_USED", "OVERDUE_VISIT", "PENDING_APPROVAL", "NOT_ACTIVE_YET"].includes(result.resultCode)) {
    return "warning";
  }
  return "danger";
}

function verificationStatusTone(result) {
  if (result.valid) {
    return "approved";
  }
  if (result.canCheckOut || ["ALREADY_USED", "OVERDUE_VISIT"].includes(result.resultCode)) {
    return "checked-in";
  }
  if (result.resultCode === "PENDING_APPROVAL" || result.resultCode === "NOT_ACTIVE_YET") {
    return "pending";
  }
  return "expired";
}

function checkpointStateText(result) {
  if (result.checkOutTime) {
    return `Checked out ${formatDate(result.checkOutTime)}`;
  }
  if (result.checkInTime) {
    return `Checked in ${formatDate(result.checkInTime)}`;
  }
  return "Awaiting check-in";
}

function formatWindow(start, end) {
  if (start && end) {
    return `${formatDate(start)} to ${formatDate(end)}`;
  }
  if (end) {
    return `Until ${formatDate(end)}`;
  }
  return "Open until expiry";
}

function setCount(selector, value) {
  const element = document.querySelector(selector);
  if (element) {
    element.textContent = String(value);
  }
}

function setCameraFrameStatus(message) {
  const frame = document.querySelector("#camera-frame-status");
  if (frame) {
    frame.textContent = message;
  }
}

document.querySelector("#queue-list")?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-queue-photo]");
  if (!button) {
    return;
  }
  try {
    await capturePhotoForVisitor(button.dataset.queuePhoto);
  } catch (error) {
    showToast("Photo update failed", error.message);
  }
});

async function capturePhotoForVisitor(visitorId) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.capture = "user";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    try {
      const upload = await uploadVisitorPhoto("/security", file);
      await updateVisitor("/security", visitorId, {
        photoUrl: upload.data.url,
        photoPublicId: upload.data.publicId,
      });
      showToast("Photo saved", "Visitor photo is now attached to the badge.");
      await loadSecurityPortal(false);
      if (state.activeVerification?.visitorId === visitorId) {
        state.activeVerification.photoUrl = upload.data.url;
        renderVerification(state.activeVerification);
      }
    } catch (error) {
      showToast("Photo update failed", error.message);
    }
  }, { once: true });
  input.click();
}
