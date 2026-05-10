import { request } from "../shared/httpClient.js";
import { requireRole } from "../shared/roleGuard.js";
import { initPortalShell, renderMetrics, renderWorkList, workCard, escapeHtml } from "../shared/portalShell.js";
import { initVisitorModule } from "../shared/visitorModule.js";
import { getVisitorPass, markBadgePrinted, verifyQrPayload } from "../shared/visitorApi.js";
import { showToast } from "../shared/toast.js";

const ROUTES = ["queue", "check-in", "photo", "qr", "badges"];

document.addEventListener("DOMContentLoaded", async () => {
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
  try {
    const [overview, queue, checkins, photo, badges] = await Promise.all([
      request("/security/overview"),
      request("/security/queue"),
      request("/security/checkins"),
      request("/security/photo-capture"),
      request("/security/badges"),
    ]);

    renderMetrics(overview.data.metrics);
    renderWorkList("#queue-list", queue.data.items || [], (visitor) => workCard(visitor.fullName, visitor.purposeOfVisit, visitor.status));
    renderWorkList("#checkins-list", checkins.data.items || [], (checkin) => workCard(checkin.fullName, checkin.hostEmployee, checkin.status));
    await renderBadgeList(badges.data.items || []);
    renderWorkList("#photo-list", Object.entries(photo.data), ([label, value]) => workCard(label, value));
  } catch (error) {
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

  list.innerHTML = passes.filter(Boolean).map(passCard).join("");
}

function passCard(pass) {
  return `
    <article class="visitor-pass-card" data-pass-card data-visitor-id="${escapeHtml(pass.visitorId)}">
      <div class="visitor-pass">
        <div class="visitor-pass__brand">
          <span class="brand__mark">AF</span>
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
  try {
    const response = await verifyQrPayload("/security", trimmed);
    renderVerification(response.data);
    showToast(response.data.valid ? "Pass valid" : "Pass rejected", response.data.message);
  } catch (error) {
    showToast("Verification failed", error.message);
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
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
  video.srcObject = stream;
  video.classList.remove("is-hidden");

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

function formatDate(value) {
  if (!value) {
    return "Not recorded";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
