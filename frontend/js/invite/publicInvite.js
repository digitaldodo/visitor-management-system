import { bootstrapApplication } from "../shared/appRuntime.js";
import { formatDate, formatDurationMinutes, setDefaultTimezone, timezoneLabel, toDatetimeLocal, toIsoInstant } from "../shared/formatters.js";
import {
  completeVisitorInviteRegistration,
  getPublicVisitorInvite,
  uploadVisitorInvitePhoto,
} from "../shared/accessService.js";
import { showToast } from "../shared/toast.js";
import { canonicalVisitorInviteStage, visitorInviteStatusLabel } from "../shared/workflowEnums.js";

const state = {
  invite: null,
  token: "",
  photoFile: null,
  photoPreviewUrl: "",
};

document.addEventListener("DOMContentLoaded", () => {
  void bootstrapApplication("public-invite", async () => {
    document.querySelector("[data-invite-year]")?.replaceChildren(document.createTextNode(String(new Date().getFullYear())));
    await initInvitePage();
  }, {
    failureMessage: "AccessFlow had trouble restoring this invite. Refreshing...",
  });
});

async function initInvitePage() {
  state.token = readInviteToken();
  if (!state.token) {
    renderError("Invalid invite link", "This pre-registration link is incomplete. Ask your host to send a fresh AccessFlow invite.");
    return;
  }

  renderLoading();
  try {
    const response = await getPublicVisitorInvite(state.token);
    state.invite = response.data || null;
    if (!state.invite) {
      throw new Error("Invite details were not returned.");
    }
    setDefaultTimezone(state.invite.timezone || state.invite.organizationTimezone || "");
    renderInvite(state.invite);
  } catch (error) {
    renderError("Invite unavailable", error.message || "AccessFlow could not load this visitor invite.");
  }
}

function renderLoading() {
  updateHeaderStatus("Secure invite loading", "neutral");
  renderSummary(null);
  stage().innerHTML = `
    <article class="invite-panel">
      <span class="invite-chip invite-chip--neutral">Loading</span>
      <h2>Preparing invite</h2>
      <p class="muted">AccessFlow is checking the invite record and loading your pre-registration workspace.</p>
    </article>
  `;
}

function renderInvite(invite) {
  const completed = Boolean(invite.pass?.qrImageDataUri || invite.registrationCompletedAt);
  const blocked = isBlocked(invite);
  updateHeaderStatus(completed ? lifecycleHeader(invite) : blocked ? "Invite needs attention" : "Secure invite ready", completed ? "success" : blocked ? "danger" : "success");
  renderSummary(invite);
  document.title = `${invite.visitorName || "Visitor Invite"} | AccessFlow`;

  if (completed) {
    renderCompleted(invite);
    return;
  }

  if (blocked) {
    renderError("Invite no longer active", `This invite is ${statusLabel(invite).toLowerCase()}. Ask your host to send a fresh AccessFlow invite.`);
    renderSummary(invite);
    return;
  }

  const startValue = toDatetimeLocal(futureDate(invite.scheduledStartTime), invite.timezone || invite.organizationTimezone);
  stage().innerHTML = `
    <article class="invite-panel invite-panel--split">
      <form class="invite-form" id="invite-form" novalidate>
        <div class="invite-panel__header">
          <span class="invite-chip invite-chip--success">${escapeHtml(statusLabel(invite))}</span>
          <h2>Confirm visitor details</h2>
          <p class="muted">Your host has prepared the invite. Complete these details so security can verify your arrival cleanly.</p>
        </div>

        <div class="invite-form__grid">
          ${field("Full name", "fullName", invite.visitorName || "", "Full name", "text", true)}
          <label class="form-field">
            <span>Phone country code</span>
            <input name="phoneCountryCode" type="text" autocomplete="tel-country-code" value="${escapeHtml(invite.phoneCountryCode || "+1")}" required />
          </label>
          ${field("Phone", "phone", invite.visitorPhone || "", "Phone number", "tel", true)}
          ${field("Email", "email", invite.visitorEmail || "", "visitor@company.com", "email", false)}
          ${field("Company", "companyName", invite.companyName || "", "Company name", "text", false)}
          ${field("Purpose", "purposeOfVisit", invite.purposeOfVisit || "", "Purpose of visit", "text", true)}
          <label class="form-field">
            <span>Arrival time</span>
            <input name="scheduledStartTime" type="datetime-local" value="${escapeHtml(startValue)}" required />
          </label>
          <label class="form-field">
            <span>Expected duration</span>
            <select name="expectedDurationMinutes">
              ${durationOption(30, invite.expectedDurationMinutes)}
              ${durationOption(60, invite.expectedDurationMinutes)}
              ${durationOption(90, invite.expectedDurationMinutes)}
              ${durationOption(120, invite.expectedDurationMinutes)}
              ${durationOption(240, invite.expectedDurationMinutes)}
              ${durationOption(480, invite.expectedDurationMinutes)}
            </select>
          </label>
          <div class="form-field form-field--wide">
            <span>Visitor photo</span>
            <div class="invite-photo-row">
              <div class="invite-photo-preview" id="photo-preview">Photo required</div>
              <label class="form-field">
                <span>Capture or upload photo</span>
                <input name="photoFile" type="file" accept="image/*" capture="user" required />
              </label>
            </div>
          </div>
        </div>

        <p class="invite-hint">Access window uses ${escapeHtml(timezoneLabel(invite.timezone || invite.organizationTimezone))}. The final QR badge is issued only after this pre-registration is reviewed and approved.</p>
        <div class="invite-actions">
          <button class="button button--primary" type="submit">Complete pre-registration</button>
          <button class="button button--ghost" type="button" data-refresh-invite>Refresh invite</button>
        </div>
      </form>

      <aside class="invite-pass">
        <span class="invite-chip invite-chip--neutral">QR pending</span>
        <h3>Approved badge delivery</h3>
        <p class="muted">This invite is not an access pass. AccessFlow sends the approved QR badge by email after host or workplace approval.</p>
        <div class="invite-detail-grid">
          ${detail("Host", invite.hostEmployeeName || "Assigned host")}
          ${detail("Organization", invite.organizationName || invite.organizationCode || "AccessFlow site")}
          ${detail("Schedule", accessWindow(invite))}
          ${detail("Duration", formatDurationMinutes(invite.expectedDurationMinutes || 60))}
        </div>
      </aside>
    </article>
  `;

  bindInviteForm();
}

function bindInviteForm() {
  const form = document.querySelector("#invite-form");
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitInviteRegistration(form);
  });
  form?.querySelector("[data-refresh-invite]")?.addEventListener("click", () => {
    void initInvitePage();
  });
  form?.elements.photoFile?.addEventListener("change", (event) => {
    const [file] = event.target.files || [];
    state.photoFile = file || null;
    renderPhotoPreview(file || null);
  });
}

async function submitInviteRegistration(form) {
  if (!state.invite || !state.token) {
    renderError("Invite unavailable", "Refresh this link and try again.");
    return;
  }
  if (!state.photoFile) {
    showToast("Photo required", "Capture or upload a visitor photo before submitting.");
    form.elements.photoFile?.focus();
    return;
  }
  if (!form.reportValidity()) {
    showToast("Check the form", "Complete the required invite fields before submitting.");
    return;
  }

  const submitButton = form.querySelector("button[type='submit']");
  setSubmitting(submitButton, true);
  try {
    const data = new FormData(form);
    const duration = Number(data.get("expectedDurationMinutes")) || state.invite.expectedDurationMinutes || 60;
    const timezone = state.invite.timezone || state.invite.organizationTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const scheduledStartTime = toIsoInstant(data.get("scheduledStartTime"), timezone);
    if (!scheduledStartTime) {
      throw new Error("Choose a valid arrival date and time.");
    }
    const scheduledEndTime = new Date(new Date(scheduledStartTime).getTime() + duration * 60_000).toISOString();
    const photoResponse = await uploadVisitorInvitePhoto(state.token, state.photoFile);
    const photo = photoResponse.data || {};
    const completedResponse = await completeVisitorInviteRegistration(state.token, {
      fullName: normalize(data.get("fullName")),
      phoneCountryCode: normalize(data.get("phoneCountryCode")),
      phone: normalize(data.get("phone")),
      email: normalize(data.get("email")) || null,
      companyName: normalize(data.get("companyName")) || null,
      purposeOfVisit: normalize(data.get("purposeOfVisit")),
      scheduledStartTime,
      scheduledEndTime,
      expectedDurationMinutes: duration,
      timezone,
      photoUrl: photo.url,
      photoPublicId: photo.publicId,
    });
    state.invite = completedResponse.data || state.invite;
    showToast("Pre-registration complete", state.invite.pass?.qrImageDataUri ? "Your approved badge is ready." : "Your host has been notified for approval.");
    renderInvite(state.invite);
  } catch (error) {
    if (isCompletionConflict(error)) {
      showToast("Pre-registration already complete", "This invite is already waiting on the next approval step.");
      await initInvitePage();
      return;
    }
    showToast("Registration failed", error.message || "Unable to complete this invite.");
  } finally {
    setSubmitting(submitButton, false);
  }
}

function renderCompleted(invite) {
  const approved = isBadgeIssued(invite);
  stage().innerHTML = `
    <article class="invite-panel invite-panel--split">
      <section class="invite-panel__header">
        <span class="invite-chip invite-chip--success">Registration complete</span>
        <h2>Pre-registration completed successfully</h2>
        <p class="muted">${escapeHtml(approved ? "Your visit is approved and the operational QR badge has been issued by email." : "Your details are locked in. Your host or workplace team will review the visit before AccessFlow issues the final QR badge.")}</p>
        <div class="invite-timeline" aria-label="Visitor approval progress">
          ${lifecycleTimeline(invite)}
        </div>
        <div class="invite-detail-grid">
          ${detail("Visitor", invite.visitorName || "Visitor")}
          ${detail("Host", invite.hostEmployeeName || "Assigned host")}
          ${detail("Organization", invite.organizationName || invite.organizationCode || "AccessFlow site")}
          ${detail("Arrival", accessWindow(invite))}
          ${detail("Status", statusLabel(invite))}
          ${detail("Timezone", timezoneLabel(invite.timezone || invite.organizationTimezone))}
        </div>
        <div class="invite-actions">
          <button class="button button--ghost" type="button" data-refresh-invite>Refresh status</button>
          <a class="button button--ghost" href="/">AccessFlow home</a>
        </div>
      </section>
      <aside class="invite-pass">
        <span class="invite-chip invite-chip--${approved ? "success" : "warning"}">${escapeHtml(approved ? "QR issued" : "Approval pending")}</span>
        <h3>${escapeHtml(approved ? "Badge delivered by email" : "Badge pending")}</h3>
        <p class="muted">${escapeHtml(approved ? "Use the approved badge email when you arrive. Security will scan that QR against the live AccessFlow record." : "No further action is needed on this page. Keep an eye on your inbox for the approved QR badge after review.")}</p>
        <div class="invite-detail-grid">
          ${detail("Current step", approved ? "QR issued" : "Pending approval")}
          ${detail("Next step", approved ? "Present badge at reception" : "Host approval")}
          ${detail("Delivery", "Approved badge email")}
        </div>
      </aside>
    </article>
  `;

  stage().querySelector("[data-refresh-invite]")?.addEventListener("click", () => {
    void initInvitePage();
  });
}

function renderError(title, message) {
  updateHeaderStatus(title, "danger");
  stage().innerHTML = `
    <article class="invite-panel">
      <span class="invite-chip invite-chip--danger">Attention</span>
      <h2>${escapeHtml(title)}</h2>
      <p class="muted">${escapeHtml(message)}</p>
      <div class="invite-actions">
        <button class="button button--primary" type="button" data-refresh-invite>Try again</button>
        <a class="button button--ghost" href="/">AccessFlow home</a>
      </div>
    </article>
  `;
  stage().querySelector("[data-refresh-invite]")?.addEventListener("click", () => {
    void initInvitePage();
  });
}

function renderSummary(invite) {
  const summary = document.querySelector("#invite-summary");
  if (!summary) {
    return;
  }
  if (!invite) {
    summary.innerHTML = `
      <span class="invite-chip invite-chip--neutral">Loading invite</span>
      <strong>Secure visitor workflow</strong>
      <p>AccessFlow is checking this invite against the live workplace record.</p>
    `;
    return;
  }

  summary.innerHTML = `
    <span class="invite-chip invite-chip--${chipTone(invite)}">${escapeHtml(statusLabel(invite))}</span>
    <strong>${escapeHtml(invite.organizationName || invite.organizationCode || "AccessFlow workplace")}</strong>
    <p>${escapeHtml(invite.purposeOfVisit || "Visitor pre-registration")}</p>
    <div class="invite-summary-grid">
      ${detail("Visitor", invite.visitorName || "Visitor")}
      ${detail("Host", invite.hostEmployeeName || "Assigned host")}
      ${detail("Arrival", accessWindow(invite))}
      ${detail("Invite expires", formatDate(invite.expiresAt))}
    </div>
  `;
}

function renderPhotoPreview(file) {
  const preview = document.querySelector("#photo-preview");
  if (!preview) {
    return;
  }
  if (state.photoPreviewUrl) {
    URL.revokeObjectURL(state.photoPreviewUrl);
    state.photoPreviewUrl = "";
  }
  if (!file) {
    preview.textContent = "Photo required";
    return;
  }
  state.photoPreviewUrl = URL.createObjectURL(file);
  preview.innerHTML = `<img src="${escapeHtml(state.photoPreviewUrl)}" alt="Selected visitor photo preview" />`;
}

function updateHeaderStatus(label, tone) {
  const text = document.querySelector("#api-status-text");
  const dot = document.querySelector("#api-status-dot");
  text?.replaceChildren(document.createTextNode(label));
  dot?.classList.toggle("is-online", tone === "success");
  dot?.classList.toggle("is-offline", tone === "danger");
}

function readInviteToken() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const routeIndex = segments.findIndex((segment) => ["visitor-invite", "pre-registration", "invite"].includes(segment));
  if (routeIndex !== -1 && segments[routeIndex + 1]) {
    return decodeURIComponent(segments[routeIndex + 1]).trim();
  }
  return new URLSearchParams(window.location.search).get("token")?.trim() || "";
}

function isBlocked(invite) {
  return ["EXPIRED", "REVOKED", "REJECTED", "CHECKED_IN", "CHECKED_OUT"].includes(canonicalVisitorInviteStage(invite));
}

function statusLabel(invite) {
  return visitorInviteStatusLabel(invite);
}

function chipTone(invite) {
  const normalized = canonicalVisitorInviteStage(invite);
  if (["BADGE_ISSUED", "CHECKED_IN", "CHECKED_OUT"].includes(normalized)) {
    return "success";
  }
  if (["EXPIRED", "REVOKED", "REJECTED"].includes(normalized)) {
    return "danger";
  }
  if (["INVITED", "PRE_REGISTRATION_PENDING"].includes(normalized)) {
    return "neutral";
  }
  return "warning";
}

function lifecycleHeader(invite) {
  const stage = canonicalVisitorInviteStage(invite);
  if (stage === "CHECKED_OUT") {
    return "Visit completed";
  }
  if (stage === "CHECKED_IN") {
    return "Visitor checked in";
  }
  if (isBadgeIssued(invite)) {
    return "QR badge issued";
  }
  return "Awaiting approval";
}

function lifecycleTimeline(invite) {
  const issued = isBadgeIssued(invite);
  const stage = canonicalVisitorInviteStage(invite);
  const arrived = stage === "CHECKED_IN" || stage === "CHECKED_OUT";
  const steps = [
    { label: "Invited", state: "done", detail: "Invite sent by host" },
    { label: "Pre-registered", state: "done", detail: invite.registrationCompletedAt ? formatDate(invite.registrationCompletedAt) : "Completed" },
    { label: "Pending approval", state: issued || arrived ? "done" : "current", detail: issued || arrived ? "Approved" : "Host review in progress" },
    { label: "QR issued", state: issued || arrived ? "done" : "pending", detail: issued ? "Badge delivered by email" : "Sent after approval" },
    { label: "Check-in", state: arrived ? "done" : "pending", detail: arrived ? "Checked at reception" : "Present approved badge" },
  ];
  return steps.map((step) => `
    <div class="invite-timeline__step invite-timeline__step--${step.state}">
      <span aria-hidden="true"></span>
      <strong>${escapeHtml(step.label)}</strong>
      <small>${escapeHtml(step.detail)}</small>
    </div>
  `).join("");
}

function isBadgeIssued(invite) {
  return ["BADGE_ISSUED", "CHECKED_IN", "CHECKED_OUT"].includes(canonicalVisitorInviteStage(invite));
}

function isCompletionConflict(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("already") || message.includes("completed") || message.includes("registered");
}

function accessWindow(invite) {
  if (!invite.scheduledStartTime && !invite.scheduledEndTime) {
    return "Schedule pending";
  }
  if (invite.scheduledStartTime && invite.scheduledEndTime) {
    return `${formatDate(invite.scheduledStartTime)} to ${formatDate(invite.scheduledEndTime)}`;
  }
  return formatDate(invite.scheduledStartTime || invite.scheduledEndTime);
}

function futureDate(value) {
  const parsed = value ? new Date(value) : null;
  if (parsed && !Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now()) {
    return parsed;
  }
  const next = new Date();
  next.setMinutes(next.getMinutes() + 30);
  next.setSeconds(0, 0);
  return next;
}

function field(label, name, value, placeholder, type, required) {
  return `
    <label class="form-field">
      <span>${escapeHtml(label)}</span>
      <input name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}"${required ? " required" : ""} />
    </label>
  `;
}

function durationOption(minutes, selectedMinutes) {
  const selected = Number(selectedMinutes || 60) === minutes ? " selected" : "";
  return `<option value="${minutes}"${selected}>${escapeHtml(formatDurationMinutes(minutes))}</option>`;
}

function detail(label, value) {
  return `
    <div class="invite-detail">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "Not recorded")}</strong>
    </div>
  `;
}

function stage() {
  return document.querySelector("#invite-stage");
}

function normalize(value) {
  return String(value || "").trim();
}

function setSubmitting(button, loading) {
  if (!button) {
    return;
  }
  button.disabled = loading;
  button.classList.toggle("is-loading", loading);
  button.textContent = loading ? "Submitting..." : "Complete pre-registration";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
