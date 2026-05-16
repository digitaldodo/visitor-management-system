import { bootstrapApplication } from "../shared/appRuntime.js";
import { formatDate, setDefaultTimezone, timezoneLabel } from "../shared/formatters.js";
import { getPublicPassVerification } from "../shared/accessService.js";

const FALLBACK_PHOTO = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 600">
    <defs>
      <linearGradient id="bg" x1="0%" x2="100%" y1="0%" y2="100%">
        <stop offset="0%" stop-color="#dce7f7"/>
        <stop offset="100%" stop-color="#eef2f8"/>
      </linearGradient>
    </defs>
    <rect width="480" height="600" rx="48" fill="url(#bg)"/>
    <circle cx="240" cy="200" r="92" fill="#9fb5d1"/>
    <path d="M120 474c24-78 72-122 120-122s96 44 120 122" fill="#9fb5d1"/>
  </svg>
`);

document.addEventListener("DOMContentLoaded", () => {
  void bootstrapApplication("pass-verification", async () => {
    document.querySelector("[data-pass-year]")?.replaceChildren(document.createTextNode(String(new Date().getFullYear())));
    initVerificationPage();
  }, {
    failureMessage: "AccessFlow had trouble restoring badge verification. Refreshing...",
  });
});

async function initVerificationPage() {
  renderLoadingState();
  const token = readPassToken();
  if (!token) {
    renderErrorState("Invalid verification link", "This badge link is incomplete or malformed.");
    return;
  }

  try {
    const response = await getPublicPassVerification(token);
    renderVerification(response.data || {});
  } catch (error) {
    renderErrorState("Verification unavailable", error.message || "The badge verification service could not be reached.");
  }
}

function renderLoadingState() {
  const stage = document.querySelector("#pass-verify-stage");
  if (!stage) {
    return;
  }
  stage.innerHTML = `
    <article class="pass-verify-card pass-verify-card--loading">
      <div class="pass-verify-status pass-verify-status--neutral">Loading</div>
      <h1>Verifying badge</h1>
      <p>AccessFlow is checking this visitor pass against the live approval record.</p>
    </article>
  `;
}

function renderVerification(result) {
  const stage = document.querySelector("#pass-verify-stage");
  if (!stage) {
    return;
  }

  setDefaultTimezone(result.organizationTimezone || result.scheduledTimezone || "UTC");
  const tone = statusTone(result);
  const badgeLabel = statusLabel(result);
  document.title = `${badgeLabel} | AccessFlow`;

  stage.innerHTML = `
    <article class="pass-verify-card">
      <div class="pass-verify-status pass-verify-status--${tone}">${escapeHtml(badgeLabel)}</div>
      <div class="pass-verify-hero">
        <div class="pass-verify-photo">
          <img src="${escapeHtml(result.photoUrl || FALLBACK_PHOTO)}" alt="${escapeHtml(result.fullName || "Visitor")} photo" />
        </div>
        <div class="pass-verify-summary">
          <div class="pass-verify-headline">
            <span class="pass-verify-eyebrow">AccessFlow Verification</span>
            <h1>${escapeHtml(result.headline || "Badge status unavailable")}</h1>
            <p>${escapeHtml(result.fullName || "Visitor record unavailable")}</p>
          </div>
          <p class="pass-verify-message">${escapeHtml(result.message || "This badge could not be validated.")}</p>
          ${result.recommendedAction ? `<div class="pass-verify-guidance">${escapeHtml(result.recommendedAction)}</div>` : ""}
        </div>
      </div>
      <div class="pass-verify-grid">
        ${detailCard("Organization", result.organizationName || result.organizationCode || "Not recorded")}
        ${detailCard("Visitor type", visitorTypeLabel(result.visitorType))}
        ${detailCard("Vendor", result.vendorCompanyName || "Not recorded")}
        ${detailCard("Host employee", result.hostEmployee || "Not recorded")}
        ${detailCard("Host team", result.hostEmployeeDepartment || "Not recorded")}
        ${detailCard("Badge ID", result.badgeId || "Not issued")}
        ${detailCard("Pass code", result.passCode || "Not issued")}
        ${detailCard("Workflow status", result.statusLabel || "Not recorded")}
        ${detailCard("Access window", accessWindow(result))}
        ${detailCard("Timezone", timezoneLabel(result.organizationTimezone || result.scheduledTimezone || "UTC"))}
        ${detailCard("Issued", formatDate(result.issuedAt))}
        ${detailCard("Expires", formatDate(result.expiresAt))}
        ${detailCard("Check-in state", checkInState(result))}
      </div>
      <div class="pass-verify-toolbar">
        <button class="pass-verify-button" type="button" data-pass-refresh>Refresh status</button>
        <a class="pass-verify-button pass-verify-button--ghost" href="/">AccessFlow home</a>
      </div>
      <p class="pass-verify-note">Badge verification is organization-scoped and reflects the current approval record in AccessFlow.</p>
    </article>
  `;

  stage.querySelector("[data-pass-refresh]")?.addEventListener("click", () => {
    initVerificationPage();
  });
}

function renderErrorState(title, message) {
  const stage = document.querySelector("#pass-verify-stage");
  if (!stage) {
    return;
  }

  document.title = `${title} | AccessFlow`;
  stage.innerHTML = `
    <article class="pass-verify-card pass-verify-card--error">
      <div class="pass-verify-status pass-verify-status--danger">${escapeHtml(title)}</div>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      <div class="pass-verify-toolbar">
        <button class="pass-verify-button" type="button" data-pass-refresh>Try again</button>
        <a class="pass-verify-button pass-verify-button--ghost" href="/">AccessFlow home</a>
      </div>
    </article>
  `;

  stage.querySelector("[data-pass-refresh]")?.addEventListener("click", () => {
    initVerificationPage();
  });
}

function readPassToken() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const routeIndex = segments.findIndex((segment) => segment === "pass" || segment === "verify");
  if (routeIndex === -1) {
    return "";
  }
  return decodeURIComponent(segments[routeIndex + 1] || "").trim();
}

function detailCard(label, value) {
  return `
    <div class="pass-verify-detail">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "Not recorded")}</strong>
    </div>
  `;
}

function statusTone(result) {
  if (result.valid) {
    return "valid";
  }
  if (["PENDING_APPROVAL", "NOT_ACTIVE_YET", "ALREADY_USED", "OVERDUE_VISIT"].includes(result.resultCode)) {
    return "warning";
  }
  if (result.resultCode === "SUSPENDED_VISITOR") {
    return "danger";
  }
  if (result.resultCode === "EXPIRED_PASS") {
    return "neutral";
  }
  return "danger";
}

function visitorTypeLabel(type) {
  if (type === "RECURRING") {
    return "Recurring visitor";
  }
  if (type === "CONTRACTOR_VENDOR") {
    return "Contractor / vendor";
  }
  if (type === "WALK_IN") {
    return "Walk-in visitor";
  }
  if (type === "EMERGENCY") {
    return "Emergency access";
  }
  return "One-time visitor";
}

function accessWindow(result) {
  if (result.visitorType === "RECURRING" || result.visitorType === "CONTRACTOR_VENDOR") {
    const validity = formatWindow(result.validityStartDate, result.validityEndDate);
    const entry = result.allowedEntryStartTime && result.allowedEntryEndTime
      ? `, ${result.allowedEntryStartTime}-${result.allowedEntryEndTime}`
      : "";
    return `${validity}${entry}`;
  }
  return formatWindow(result.accessWindowStartTime || result.scheduledStartTime, result.accessWindowEndTime || result.scheduledEndTime);
}

function statusLabel(result) {
  if (result.validityStatus) {
    return result.validityStatus;
  }
  if (result.statusLabel) {
    return result.statusLabel;
  }
  return result.valid ? "Valid" : "Invalid";
}

function formatWindow(start, end) {
  if (!start && !end) {
    return "Open schedule";
  }
  if (start && end) {
    return `${formatDate(start)} to ${formatDate(end)}`;
  }
  return formatDate(start || end);
}

function checkInState(result) {
  if (result.checkOutTime) {
    return `Checked out at ${formatDate(result.checkOutTime)}`;
  }
  if (result.checkInTime) {
    return `Checked in at ${formatDate(result.checkInTime)}`;
  }
  if (result.valid) {
    return "Ready for entry validation";
  }
  return "Security review required";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
