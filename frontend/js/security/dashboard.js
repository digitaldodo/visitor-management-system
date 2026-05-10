import { request } from "../shared/httpClient.js";
import { initAppErrorBoundary } from "../shared/appErrorBoundary.js";
import { formatDate } from "../shared/formatters.js";
import { requireRole } from "../shared/roleGuard.js";
import { initPortalShell, renderLoadingList, renderMetrics, renderWorkList, workCard, escapeHtml } from "../shared/portalShell.js";
import { initVisitorModule } from "../shared/visitorModule.js";
import { getVisitorPass, markBadgePrinted, verifyQrPayload } from "../shared/visitorApi.js";
import { showToast } from "../shared/toast.js";

const ROUTES = ["queue", "check-in", "photo", "qr", "badges"];

document.addEventListener("DOMContentLoaded", async () => {
  initAppErrorBoundary();

  const session = requireRole("SECURITY_GUARD");
  if (!session) {
    return;
  }

  initPortalShell(session, { allowedRoutes: ROUTES });
  initVisitorModule("[data-security-visitors]", {
    basePath: "/security",
    title: "Visitor Check-in and Records",
    eyebrow: "Front Desk Registration",
    canDelete: false,
  });
  initQrVerification();
  initBadgeActions();
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
  }

  try {
    const [overview, queue, checkins, photo, badges] = await Promise.all([
      request("/security/overview"),
      request("/security/queue"),
      request("/security/checkins"),
      request("/security/photo-capture"),
      request("/security/badges"),
    ]);

    renderMetrics(overview.data.metrics);
    renderWorkList("#queue-list", queue.data.items || [], (visitor) => workCard(visitor.fullName, visitor.purposeOfVisit, visitor.status), "No visitors in queue", "Approved visitors waiting for arrival will appear here.");
    renderWorkList("#checkins-list", checkins.data.items || [], (checkin) => workCard(checkin.fullName, checkin.hostEmployee, checkin.status), "No active check-ins", "Checked-in visitors will appear here.");
    await renderBadgeList(badges.data.items || []);
    renderWorkList("#photo-list", Object.entries(photo.data), ([label, value]) => workCard(label, value), "Camera status unavailable", "Device readiness will appear after the API responds.");
  } catch (error) {
    if (showErrors) {
      renderWorkList("#queue-list", [], (item) => item, "Queue unavailable", error.message);
      renderWorkList("#checkins-list", [], (item) => item, "Check-ins unavailable", error.message);
      renderWorkList("#photo-list", [], (item) => item, "Camera status unavailable", error.message);
      renderWorkList("#badge-list", [], (item) => item, "Badges unavailable", error.message);
    }
    if (showErrors) {
      showToast("Security access blocked", error.message);
    }
  }
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
  return `
    <article class="visitor-pass-card" data-pass-card data-visitor-id="${escapeHtml(pass.visitorId)}">
      <div class="visitor-pass">
        <div class="visitor-pass__brand">
          <img class="visitor-pass__logo" src="../../assets/branding/logo-icon.png" alt="AccessFlow" />
          <div>
            <strong>AccessFlow Visitor Pass</strong>
            <small>${escapeHtml(pass.passCode)}</small>
          </div>
        </div>
        <div class="visitor-pass__body">
          <img class="visitor-pass__photo" src="${escapeHtml(pass.photoUrl)}" alt="${escapeHtml(pass.fullName)} photo" />
          <div>
            <h3>${escapeHtml(pass.fullName)}</h3>
            <p>${escapeHtml(pass.companyName || "Unlisted company")}</p>
            <dl>
              <div><dt>Host</dt><dd>${escapeHtml(pass.hostEmployee || "Unassigned")}</dd></div>
              <div><dt>Purpose</dt><dd>${escapeHtml(pass.purposeOfVisit)}</dd></div>
              <div><dt>Expires</dt><dd>${formatDate(pass.expiresAt)}</dd></div>
            </dl>
          </div>
          <img class="visitor-pass__qr" src="${escapeHtml(pass.qrImageDataUri)}" alt="Visitor QR code" />
        </div>
      </div>
      <div class="visitor-pass-card__actions">
        <button class="button button--ghost" type="button" data-badge-action="print" data-visitor-id="${escapeHtml(pass.visitorId)}">Print</button>
        <button class="button button--primary" type="button" data-badge-action="record-print" data-visitor-id="${escapeHtml(pass.visitorId)}">Mark Printed</button>
      </div>
    </article>
  `;
}

function initBadgeActions() {
  document.querySelector("#badge-list")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-badge-action]");
    if (!button) {
      return;
    }
    const card = button.closest("[data-pass-card]");
    const id = button.dataset.visitorId;
    if (button.dataset.badgeAction === "print") {
      card?.classList.add("is-print-target");
      window.print();
      window.setTimeout(() => card?.classList.remove("is-print-target"), 300);
      return;
    }
    try {
      await markBadgePrinted("/security", id);
      showToast("Badge recorded", "Print timestamp saved.");
      await loadSecurityPortal(false);
    } catch (error) {
      showToast("Badge update failed", error.message);
    }
  });
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
    renderVerification(response.data);
    showToast(response.data.valid ? "Pass valid" : "Pass rejected", response.data.message);
  } catch (error) {
    showToast("Verification failed", error.message);
  } finally {
    submit?.toggleAttribute("disabled", false);
    submit?.classList.remove("is-loading");
    submit?.removeAttribute("aria-busy");
  }
}

function renderVerification(result) {
  const target = document.querySelector("#qr-result");
  if (!target) {
    return;
  }
  target.innerHTML = `
    <article class="qr-result ${result.valid ? "is-valid" : "is-invalid"}">
      <strong>${result.valid ? "Valid pass" : "Invalid pass"}</strong>
      <p>${escapeHtml(result.message)}</p>
      ${result.visitorId ? `
        <dl>
          <div><dt>Visitor</dt><dd>${escapeHtml(result.fullName)}</dd></div>
          <div><dt>Company</dt><dd>${escapeHtml(result.companyName || "Unlisted")}</dd></div>
          <div><dt>Host</dt><dd>${escapeHtml(result.hostEmployee || "Unassigned")}</dd></div>
          <div><dt>Status</dt><dd>${escapeHtml(result.status)}</dd></div>
          <div><dt>Pass</dt><dd>${escapeHtml(result.passCode)}</dd></div>
          <div><dt>Expires</dt><dd>${formatDate(result.expiresAt)}</dd></div>
        </dl>
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
      const value = codes[0].rawValue;
      input.value = value;
      stream.getTracks().forEach((track) => track.stop());
      video.classList.add("is-hidden");
      await verifyScannedValue(value);
      return;
    }
    window.requestAnimationFrame(scan);
  };
  window.requestAnimationFrame(scan);
}
