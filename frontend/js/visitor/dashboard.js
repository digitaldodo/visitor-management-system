import { request } from "../shared/httpClient.js";
import { initAppErrorBoundary, runSafely } from "../shared/appErrorBoundary.js";
import { bootstrapApplication } from "../shared/appRuntime.js";
import { formatDate, formatDurationMinutes, getDefaultTimezone, minutesBetween, timezoneLabel, toIsoInstant } from "../shared/formatters.js";
import { requireRole } from "../shared/roleGuard.js";
import { initPortalShell, renderMetrics, renderWorkList, escapeHtml } from "../shared/portalShell.js";
import { initOrganizationSelectors } from "../shared/organizationSelector.js";
import { getAccountProfile, getVisitorPass, getVisitorHistory, listVisitorInvites, requestVisitReschedule, updateAccountPassword, updateAccountProfile, uploadAccountProfilePhoto, uploadVisitPhoto } from "../shared/accessService.js";
import { canonicalVisitorInviteStage, enterpriseStatusLabel, statusBadgeClass, visitorInviteStatusLabel } from "../shared/workflowEnums.js";
import { initHostPicker } from "../shared/hostPicker.js";
import { badgeDialogMarkup, downloadBadge, hydrateBadgePreview, printBadge } from "../shared/badgeStudio.js";
import { showToast } from "../shared/toast.js";
import { initPhoneInput, phonePayload, validatePhonePayload } from "../shared/phoneInput.js";
import { LOGIN_FROM_PORTAL } from "../shared/config.js";
import { setText } from "../shared/dom.js";
import { clearSession } from "../shared/session.js";
import { promptAction } from "../shared/actionModal.js";

const ROUTES = ["visits", "history", "invites", "request", "settings"];
let activeBadge = null;
let visitorProfileLoaded = false;

document.addEventListener("DOMContentLoaded", () => {
  void bootstrapApplication("visitor-portal", () => bootVisitorPortal(), {
    redirectToLogin: true,
    failureMessage: "AccessFlow had trouble restoring the visitor portal. Refreshing workspace...",
  });
});

async function bootVisitorPortal() {
  initAppErrorBoundary();

  const session = requireRole("VISITOR");
  if (!session) {
    return;
  }

  initPortalShell(session, {
    allowedRoutes: ROUTES,
    onRefresh: () => loadVisitorPortal(),
  });
  await runSafely("visitor organizations", () => initOrganizations(session), {
    toastTitle: "Organizations unavailable",
  });
  await runSafely("visitor host picker", () => initHostPicker(document.querySelector("#visitor-request-form"), { basePath: "/visitor" }), {
    toastTitle: "Host search unavailable",
  });
  initRequestForm();
  initScheduleHints();
  initVisitActions();
  initBadgeActions();
  initVisitorSettingsForm();
  initVisitorPasswordForm();
  initVisitorPhotoForm();
  await loadVisitorPortal();
}

async function loadVisitorPortal() {
  const [overview, visits, history, invites] = await Promise.allSettled([
    request("/visitor/overview"),
    request("/visitor/visits"),
    getVisitorHistory("/visitor"),
    listVisitorInvites(),
  ]);

  if (overview.status === "fulfilled") {
    const overviewData = overview.value?.data || {};
    renderMetrics([
      { label: "Pending", value: overviewData.pending || 0, note: "Pending host approval" },
      { label: "Active passes", value: overviewData.activePasses || 0, note: "Approved or checked in" },
      { label: "Total requests", value: overviewData.totalRequests || 0, note: "Saved in your access history" },
    ]);
    setOrganizationContext(overviewData);
  } else {
    renderMetrics([]);
  }

  if (visits.status === "fulfilled") {
    renderVisits(visits.value?.data || []);
  } else {
    renderVisits([]);
    showToast("Visits unavailable", visits.reason?.message || "Visit requests could not be loaded.");
  }

  if (history.status === "fulfilled") {
    renderHistory(history.value?.data || null);
  } else {
    renderHistory(null);
  }

  if (invites.status === "fulfilled") {
    renderInvites(invites.value?.data || []);
  } else {
    renderWorkList("#visitor-invite-list", [], (item) => item, "Invites unavailable", invites.reason?.message || "Invite inbox could not be loaded.");
  }

  await loadVisitorProfile();
}

function initRequestForm() {
  const form = document.querySelector("#visitor-request-form");
  if (!form) {
    return;
  }
  initPhoneInput(form);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const phone = phonePayload(data);
    const photoFile = form.querySelector("[name='photoFile']")?.files?.[0] || null;
    const payload = {
      phoneCountryCode: phone.phoneCountryCode,
      phone: phone.phone,
      companyCode: trim(data.companyCode),
      hostEmployee: trim(data.hostEmployee),
      hostEmployeeId: trim(data.hostEmployeeId),
      purposeOfVisit: trim(data.purposeOfVisit),
      scheduledStartTime: toIsoInstant(data.scheduledStartTime, getDefaultTimezone()),
      expectedDurationMinutes: Number(data.expectedDurationMinutes || 60),
      timezone: getDefaultTimezone(),
    };
    const error = validateVisitRequest(payload, photoFile);
    if (error) {
      showToast("Check request", error);
      return;
    }

    setFormLoading(form, true);
    try {
      const upload = await uploadVisitPhoto(photoFile);
      const uploadData = upload?.data || {};
      if (!uploadData.url) {
        throw new Error("Photo upload response was empty.");
      }
      payload.photoUrl = uploadData.url;
      payload.photoPublicId = uploadData.publicId;
      await request("/visitor/visits", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      form.reset();
      resetHostPicker(form);
      showToast("Request submitted", "Your host will review the visit request.");
      await loadVisitorPortal();
    } catch (error) {
      showToast("Request failed", error.message);
    } finally {
      setFormLoading(form, false);
    }
  });
}

function initVisitActions() {
  const handler = async (event) => {
    const button = event.target.closest("[data-visit-action]");
    if (!button) {
      return;
    }
    const visitorId = button.dataset.visitorId;
    if (button.dataset.visitAction === "reschedule") {
      await handleRescheduleRequest(visitorId);
      return;
    }
    if (button.dataset.visitAction !== "badge") {
      return;
    }
    try {
      const response = await getVisitorPass("/visitor", visitorId);
      activeBadge = response?.data || null;
      if (!activeBadge) {
        throw new Error("Badge response was empty.");
      }
      openBadgeModal(activeBadge);
    } catch (error) {
      showToast("Badge unavailable", error.message);
    }
  };
  document.querySelector("#visitor-visits-list")?.addEventListener("click", handler);
  document.querySelector("#visitor-invite-list")?.addEventListener("click", handler);
}

function initBadgeActions() {
  const modal = document.querySelector("#visitor-badge-modal");
  modal?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-badge-action]");
    if (!button || !activeBadge) {
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
        await printBadge(activeBadge);
      }
      if (action === "png" || action === "pdf") {
        await downloadBadge(activeBadge, action);
        showToast("Badge downloaded", `Saved ${action.toUpperCase()} badge export.`);
      }
    } catch (error) {
      showToast("Badge action failed", error.message);
    }
  });
}

function openBadgeModal(pass) {
  const modal = document.querySelector("#visitor-badge-modal");
  if (!modal) {
    return;
  }
  modal.classList.remove("is-hidden");
  modal.innerHTML = badgeDialogMarkup(pass);
  void hydrateBadgePreview(modal, pass);
}

function closeBadgeModal() {
  const modal = document.querySelector("#visitor-badge-modal");
  modal?.classList.add("is-hidden");
  if (modal) {
    modal.innerHTML = "";
  }
}

function renderVisits(items) {
  const list = document.querySelector("#visitor-visits-list");
  if (!list) {
    return;
  }

  list.innerHTML = items.length ? items.map(visitCard).join("") : `
    <article class="empty-state empty-state--inline">
      <h3>No visit requests</h3>
      <p>Submit a request when you plan to visit an AccessFlow-managed location.</p>
    </article>
  `;
}

function renderInvites(items) {
  const sorted = [...items].sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0));
  renderWorkList("#visitor-invite-list", sorted, inviteCard, "No visitor invites", "Employee pre-registration invites for this account will appear here.");
}

function inviteCard(invite) {
  const stage = canonicalVisitorInviteStage(invite);
  const actionable = ["INVITED", "PRE_REGISTRATION_PENDING"].includes(stage);
  const passReady = invite.pass?.qrImageDataUri || ["BADGE_ISSUED", "CHECKED_IN", "CHECKED_OUT"].includes(stage);
  return `
    <article class="visitor-visit-card">
      <div class="visitor-visit-card__header">
        <div>
          <h3>${escapeHtml(invite.hostEmployeeName || "Host invitation")}</h3>
          <p>${escapeHtml([invite.organizationName, invite.purposeOfVisit].filter(Boolean).join(" · ") || "Visitor pre-registration")}</p>
        </div>
        <span class="status-badge ${escapeHtml(statusBadgeClass(stage))}">${escapeHtml(visitorInviteStatusLabel(invite))}</span>
      </div>
      <dl>
        <div><dt>Arrival</dt><dd>${escapeHtml(formatDate(invite.scheduledStartTime))}</dd></div>
        <div><dt>Access review</dt><dd>${escapeHtml(invite.lifecycleLabel || visitorInviteStatusLabel(invite))}</dd></div>
        <div><dt>Next step</dt><dd>${escapeHtml(invite.nextAction || (actionable ? "Complete pre-registration" : "Track approval status"))}</dd></div>
        <div><dt>Expires</dt><dd>${escapeHtml(formatDate(invite.expiresAt))}</dd></div>
        <div><dt>Pre-registration</dt><dd>${escapeHtml(invite.registrationCompletedAt ? `Submitted ${formatDate(invite.registrationCompletedAt)}` : "Pending")}</dd></div>
        <div><dt>Badge</dt><dd>${escapeHtml(passReady ? "Visible after approval" : "Pending approval")}</dd></div>
      </dl>
      <div class="visitor-visit-card__footer">
        <span>${escapeHtml(invite.revocationReason || invite.note || "Your QR badge appears after host or workplace approval.")}</span>
        ${actionable && invite.inviteUrl ? `<a class="button button--primary" href="${escapeHtml(invite.inviteUrl)}">Complete pre-registration</a>` : ""}
        ${invite.pass?.qrImageDataUri ? `<button class="button button--ghost" type="button" data-visit-action="badge" data-visitor-id="${escapeHtml(invite.visitorId || "")}">Open badge</button>` : ""}
      </div>
    </article>
  `;
}

async function loadVisitorProfile(force = false) {
  if (visitorProfileLoaded && !force) {
    return;
  }
  try {
    const response = await getAccountProfile();
    renderVisitorProfile(response?.data || null);
    visitorProfileLoaded = Boolean(response?.data);
  } catch (error) {
    showToast("Settings unavailable", error.message);
  }
}

function renderVisitorProfile(profile) {
  const form = document.querySelector("#visitor-settings-form");
  if (!profile || !form) {
    return;
  }
  initPhoneInput(form);
  setFieldValue(form, "username", profile.username || "");
  const phoneInput = form.querySelector("input[name='phone']");
  const phoneCode = form.querySelector("select[name='phoneCountryCode']");
  if (phoneInput) {
    phoneInput.value = stripDialCode(profile.phone, profile.phoneCountryCode);
  }
  if (phoneCode && profile.phoneCountryCode) {
    phoneCode.value = profile.phoneCountryCode;
  }
  setFieldValue(form, "emergencyContact", profile.emergencyContact || "");
  setFieldValue(form, "preferredLanguage", profile.preferredLanguage || "");
  const inApp = form.querySelector("input[name='notificationInAppEnabled']");
  const email = form.querySelector("input[name='notificationEmailEnabled']");
  if (inApp) {
    inApp.checked = profile.notificationInAppEnabled !== false;
  }
  if (email) {
    email.checked = profile.notificationEmailEnabled !== false;
  }
}

function initVisitorSettingsForm() {
  const form = document.querySelector("#visitor-settings-form");
  if (!form) {
    return;
  }
  initPhoneInput(form);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const phone = phonePayload(data);
    const phoneError = validatePhonePayload(phone, { required: false });
    if (phoneError) {
      showToast("Check phone", phoneError);
      return;
    }
    if (!/^[a-z0-9_]{3,32}$/.test(String(data.username || "").trim().toLowerCase())) {
      showToast("Check username", "Use 3-32 lowercase letters, numbers, or underscores.");
      return;
    }
    setFormLoading(form, true);
    try {
      const response = await updateAccountProfile({
        username: String(data.username || "").trim().toLowerCase(),
        phoneCountryCode: phone.phoneCountryCode,
        phone: phone.phone,
        emergencyContact: trim(data.emergencyContact),
        preferredLanguage: trim(data.preferredLanguage),
        notificationInAppEnabled: Boolean(data.notificationInAppEnabled),
        notificationEmailEnabled: Boolean(data.notificationEmailEnabled),
      });
      renderVisitorProfile(response?.data || null);
      showToast("Settings saved", "Your visitor profile preferences were updated.");
    } catch (error) {
      showToast("Settings update failed", error.message);
    } finally {
      setFormLoading(form, false);
    }
  });
}

function initVisitorPasswordForm() {
  const form = document.querySelector("#visitor-password-form");
  if (!form) {
    return;
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    if (!isStrongPassword(data.newPassword)) {
      showToast("Weak password", "Use uppercase, lowercase, number, symbol, and at least 12 characters.");
      return;
    }
    if (data.newPassword !== data.confirmPassword) {
      showToast("Passwords differ", "Confirm password must match.");
      return;
    }
    setFormLoading(form, true);
    try {
      await updateAccountPassword({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      showToast("Password updated", "Sign in again with your new password.");
      clearSession();
      window.setTimeout(() => {
        window.location.href = LOGIN_FROM_PORTAL;
      }, 900);
    } catch (error) {
      showToast("Password update failed", error.message);
      setFormLoading(form, false);
    }
  });
}

function initVisitorPhotoForm() {
  const form = document.querySelector("#visitor-photo-form");
  const input = form?.querySelector("input[name='profilePhoto']");
  if (!form || !input) {
    return;
  }
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      showToast("Photo rejected", "Choose a JPEG, PNG, or WebP image.");
      input.value = "";
      return;
    }
    setText("#visitor-photo-status", "Uploading photo...");
    try {
      const upload = await uploadAccountProfilePhoto(file);
      const photoUrl = upload?.data?.url;
      if (!photoUrl) {
        throw new Error("Photo upload completed without a usable URL.");
      }
      await updateAccountProfile({ employeePhotoUrl: photoUrl });
      visitorProfileLoaded = false;
      await loadVisitorProfile(true);
      setText("#visitor-photo-status", "Profile photo updated.");
      showToast("Photo updated", "Your account photo was refreshed.");
    } catch (error) {
      setText("#visitor-photo-status", "Photo update failed.");
      showToast("Photo update failed", error.message);
    } finally {
      input.value = "";
    }
  });
}

function initScheduleHints() {
  const hint = document.querySelector("#visitor-schedule-hint");
  if (hint) {
    hint.textContent = `Access opens 1 hour before arrival and closes 1 hour after expected end in ${timezoneLabel(getDefaultTimezone())}.`;
  }
}

async function handleRescheduleRequest(visitorId) {
  const dateTime = await promptAction({
    title: "Request new visit time",
    message: "Suggest a new visit date and arrival time in local workspace time.",
    label: "New arrival time",
    placeholder: "YYYY-MM-DD HH:mm",
    confirmLabel: "Request reschedule",
    minLength: 10,
  });
  if (!dateTime) {
    return;
  }
  const scheduledStartTime = toIsoInstant(dateTime.trim().replace(" ", "T"), getDefaultTimezone());
  if (!scheduledStartTime || new Date(scheduledStartTime) <= new Date()) {
    showToast("Invalid timing", "Enter a future date and time.");
    return;
  }
  const note = await promptAction({
    title: "Add host note",
    message: "Optional context for the host reviewing this timing change.",
    label: "Host note",
    placeholder: "Optional note",
    confirmLabel: "Continue",
    required: false,
    minLength: 0,
    multiline: true,
  }) || "";
  try {
    await requestVisitReschedule(visitorId, {
      scheduledStartTime,
      expectedDurationMinutes: 60,
      timezone: getDefaultTimezone(),
      note: note.trim(),
    });
    showToast("Reschedule requested", "Your host will approve or deny the new timing.");
    await loadVisitorPortal();
  } catch (error) {
    showToast("Reschedule failed", error.message);
  }
}

function visitCard(visit) {
  const status = enterpriseStatusLabel(visit.status, "visitor");
  const passReady = ["APPROVED", "CHECKED_IN"].includes(visit.status) && visit.qrCode;
  const duration = visit.checkInTime ? formatDurationMinutes(minutesBetween(visit.checkInTime, visit.checkOutTime || new Date())) : "Pending";
  const passMessage = visit.rejectionReason
    || (visit.status === "CHECKED_IN"
      ? "Security has checked you in. Keep this badge available until departure."
      : passReady
        ? "Badge ready. Present it at the security checkpoint."
        : "We will update this status after review.");
  return `
    <article class="visitor-visit-card">
      <div class="visitor-visit-card__header">
        <div>
          <h3>${escapeHtml(visit.hostEmployee || "Host pending")}</h3>
          <p>${escapeHtml(visit.hostEmployeeDepartment || "Department pending")} · ${escapeHtml(visit.purposeOfVisit || "Visit request")}</p>
        </div>
        <span class="status-badge ${escapeHtml(statusBadgeClass(visit.status))}">${escapeHtml(status)}</span>
      </div>
      <dl>
        <div><dt>Requested</dt><dd>${escapeHtml(formatDate(visit.createdAt))}</dd></div>
        <div><dt>Organization</dt><dd>${escapeHtml(visit.organizationName || visit.organizationCode || "Not provided")}</dd></div>
        <div><dt>Visitor company</dt><dd>${escapeHtml(visit.companyName || "Not provided")}</dd></div>
        <div><dt>Arrival</dt><dd>${escapeHtml(formatDate(visit.scheduledStartTime))}</dd></div>
        <div><dt>Access window</dt><dd>${escapeHtml(formatWindow(visit.accessWindowStartTime, visit.accessWindowEndTime, visit.organizationTimezone))}</dd></div>
        <div><dt>Badge ID</dt><dd>${escapeHtml(visit.badgeId || "Issued after approval")}</dd></div>
        <div><dt>Pass code</dt><dd>${escapeHtml(visit.qrCode || "Available after approval")}</dd></div>
        <div><dt>Visit duration</dt><dd>${escapeHtml(duration)}</dd></div>
        <div><dt>Reschedule</dt><dd>${escapeHtml(visit.rescheduleStatus || "None")}</dd></div>
      </dl>
      <div class="visitor-visit-card__footer">
        <span>${escapeHtml(passMessage)}</span>
        ${["PENDING", "APPROVED"].includes(visit.status) ? `<button class="button button--ghost" type="button" data-visit-action="reschedule" data-visitor-id="${escapeHtml(visit.id)}">Request reschedule</button>` : ""}
        ${passReady ? `<button class="button button--primary" type="button" data-visit-action="badge" data-visitor-id="${escapeHtml(visit.id)}">Open badge</button>` : ""}
      </div>
    </article>
  `;
}

function renderHistory(history) {
  const summary = document.querySelector("#visitor-history-summary");
  const timeline = document.querySelector("#visitor-history-timeline");
  if (!summary || !timeline || !history) {
    if (summary) {
      summary.innerHTML = "";
    }
    if (timeline) {
      timeline.innerHTML = `
        <article class="empty-state empty-state--inline">
          <h3>No visitor history yet</h3>
          <p>Your visit record will start building after your first request.</p>
        </article>
      `;
    }
    return;
  }

  summary.innerHTML = `
    <article class="visitor-history-stat">
      <span>Total visits</span>
      <strong>${escapeHtml(history.totalVisits)}</strong>
      <small>${escapeHtml(history.repeatVisits)} repeat visit${history.repeatVisits === 1 ? "" : "s"}</small>
    </article>
    <article class="visitor-history-stat">
      <span>Approved</span>
      <strong>${escapeHtml(history.approvedVisits)}</strong>
      <small>Includes current active passes</small>
    </article>
    <article class="visitor-history-stat">
      <span>Checked out</span>
      <strong>${escapeHtml(history.checkedOutVisits)}</strong>
      <small>Completed visits</small>
    </article>
    <article class="visitor-history-stat">
      <span>Previous hosts</span>
      <strong>${escapeHtml(history.previousHosts.length)}</strong>
      <small>${escapeHtml((history.previousHosts || []).slice(0, 2).join(", ") || "None yet")}</small>
    </article>
  `;

  const records = history.records || [];
  timeline.innerHTML = records.length ? records.map(historyCard).join("") : `
    <article class="empty-state empty-state--inline">
      <h3>No visitor history yet</h3>
      <p>Your visit record will start building after your first request.</p>
    </article>
  `;
}

function historyCard(record) {
  return `
    <article class="visitor-history-card">
      <div class="visitor-history-card__header">
        <div>
          <h3>${escapeHtml(record.hostEmployee || "Host pending")}</h3>
          <p>${escapeHtml(record.purposeOfVisit || "Visit")} · ${escapeHtml(record.organizationName || record.organizationCode || "Organization pending")}</p>
        </div>
        <span class="status-badge ${escapeHtml(statusBadgeClass(record.status))}">${escapeHtml(enterpriseStatusLabel(record.status, "visitor"))}</span>
      </div>
      <ol class="visitor-history-card__timeline">
        ${(record.statusHistory || []).map((entry) => `
          <li>
            <strong>${escapeHtml(enterpriseStatusLabel(entry.status, "visitor"))}</strong>
            <span>${escapeHtml(formatDate(entry.timestamp))}</span>
            ${entry.note ? `<small>${escapeHtml(entry.note)}</small>` : ""}
          </li>
        `).join("")}
      </ol>
    </article>
  `;
}

function validateVisitRequest(payload, photoFile) {
  const phoneError = validatePhonePayload(payload);
  if (phoneError) {
    return phoneError;
  }
  if (!payload.companyCode) {
    return "Choose the organization you are visiting.";
  }
  if (!payload.hostEmployeeId) {
    return "Select your host from the employee directory.";
  }
  if (!payload.purposeOfVisit || payload.purposeOfVisit.length < 2) {
    return "Enter the purpose of your visit.";
  }
  if (!payload.scheduledStartTime || new Date(payload.scheduledStartTime) <= new Date()) {
    return "Choose a future visit date and arrival time.";
  }
  if (!payload.expectedDurationMinutes || payload.expectedDurationMinutes < 15 || payload.expectedDurationMinutes > 1440) {
    return "Choose a valid expected duration.";
  }
  if (!photoFile) {
    return "Attach a visitor photo for badge generation.";
  }
  return "";
}

async function initOrganizations(session) {
  const control = document.querySelector("[data-organization-selector], [data-organization-select]");
  if (!control) {
    return;
  }

  if (session.organizationCode) {
    control.value = session.organizationCode;
  }
  initOrganizationSelectors(document, { prefetch: true });
}

function setOrganizationContext(data = {}) {
  const element = document.querySelector("#organization-context");
  if (!element) {
    return;
  }
  const organization = data.organizationName || data.organizationCode;
  element.textContent = organization
    ? `Request access, open your badge, and track history for ${organization}.`
    : "Track approvals, badge access, and visitor history.";
}

function setFormLoading(form, loading) {
  const button = form.querySelector("button[type='submit']");
  button?.toggleAttribute("disabled", loading);
  button?.classList.toggle("is-loading", loading);
  button?.toggleAttribute("aria-busy", loading);
}

function setFieldValue(form, name, value) {
  const field = form.querySelector(`[name='${name}']`);
  if (field) {
    field.value = value || "";
  }
}

function isStrongPassword(value) {
  const password = String(value || "");
  return password.length >= 12
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}

function resetHostPicker(form) {
  form.querySelector("[data-host-search-input]")?.setAttribute("value", "");
  const input = form.querySelector("[data-host-search-input]");
  if (input) {
    input.value = "";
  }
  form.querySelector("[data-host-id]")?.setAttribute("value", "");
  form.querySelector("[data-host-name]")?.setAttribute("value", "");
  const hostId = form.querySelector("[data-host-id]");
  const hostName = form.querySelector("[data-host-name]");
  if (hostId) {
    hostId.value = "";
  }
  if (hostName) {
    hostName.value = "";
  }
  form.querySelector("[data-host-meta]")?.replaceChildren(document.createTextNode("Search by employee name, email, or username."));
  form.querySelector("[data-host-results]")?.classList.add("is-hidden");
}

function trim(value) {
  const next = String(value || "").trim();
  return next || null;
}

function stripDialCode(value, code) {
  const text = String(value || "").trim();
  const dialCode = String(code || "").trim();
  return dialCode && text.startsWith(dialCode) ? text.slice(dialCode.length).trim() : text;
}

function formatWindow(start, end, timezone) {
  if (!start || !end) {
    return "Pending schedule";
  }
  const zone = timezone || getDefaultTimezone();
  return `${formatDate(start, { dateStyle: "medium", timeStyle: "short", timeZone: zone })} - ${formatDate(end, { timeStyle: "short", timeZone: zone })} ${timezoneLabel(zone)}`;
}
