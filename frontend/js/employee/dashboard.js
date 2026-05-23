import { request } from "../shared/httpClient.js";
import { initAppErrorBoundary, runSafely } from "../shared/appErrorBoundary.js";
import { bootstrapApplication } from "../shared/appRuntime.js";
import { formatDate, formatStatus, formatTime, getDefaultTimezone, timezoneLabel, toDatetimeLocal, toIsoInstant } from "../shared/formatters.js";
import { requireRole } from "../shared/roleGuard.js";
import { initPortalShell, renderLoadingList, renderMetrics, renderWorkList, workCard, escapeHtml } from "../shared/portalShell.js";
import { initVisitorModule } from "../shared/visitorModule.js";
import { approveRescheduleRequest, approveVisitor, createEmployeeVisitorInvite, getEmployeeBadge, getEmployeeProfile, getOwnEmployeeAttendance, hostRescheduleVisitor, listEmployeeVisitorInvites, preApproveVisitor, rejectRescheduleRequest, rejectVisitor, resendEmployeeVisitorInvite, revokeEmployeeVisitorInvite, updateEmployeePassword, updateEmployeeProfile, uploadEmployeeProfilePhoto } from "../shared/accessService.js";
import { canonicalVisitorInviteStage, enterpriseStatusLabel, statusBadgeClass, visitorInviteStatusLabel } from "../shared/workflowEnums.js";
import { downloadEmployeeBadge, employeeBadgeMarkup, printEmployeeBadge } from "../shared/employeeBadgeStudio.js";
import { LOGIN_FROM_PORTAL } from "../shared/config.js";
import { setText } from "../shared/dom.js";
import { clearSession } from "../shared/session.js";
import { showToast } from "../shared/toast.js";
import { initPhoneInput, phonePayload, validatePhonePayload } from "../shared/phoneInput.js";

const ROUTES = ["dashboard", "credential", "attendance", "visitor-requests", "notifications", "settings"];
let approvalPollTimer;
let activeEmployeeBadge = null;
let activeEmployeeProfile = null;
let credentialLoaded = false;
let settingsLoaded = false;

document.addEventListener("DOMContentLoaded", () => {
  void bootstrapApplication("employee-portal", () => bootEmployeePortal(), {
    redirectToLogin: true,
    failureMessage: "AccessFlow had trouble restoring the employee workspace. Refreshing workspace...",
  });
});

async function bootEmployeePortal() {
  initAppErrorBoundary();

  const session = requireRole("EMPLOYEE");
  if (!session) {
    return;
  }

  initPortalShell(session, {
    allowedRoutes: ROUTES,
    onRefresh: () => loadEmployeePortal(),
  });
  await runSafely("employee visitor module", () => initVisitorModule("[data-employee-visitors]", {
    basePath: "/employee",
    title: "Visitor Registration and History",
    eyebrow: "Personal Records",
    showHostFields: false,
    showCompanyField: false,
    canDelete: false,
  }), { toastTitle: "Visitor history unavailable" });
  initApprovalActions();
  initScheduledActions();
  initPreApprovalForm();
  initVisitorInviteForm();
  initVisitorInviteActions();
  initEmployeeBadgeActions();
  initCredentialPhotoForm();
  initEmployeeSettingsForm();
  initEmployeePasswordForm();
  initEmployeeRouteLoading();
  await loadEmployeePortal();
  await loadRouteData();
  approvalPollTimer = window.setInterval(() => loadApprovals(false), 15000);
  window.addEventListener("beforeunload", () => window.clearInterval(approvalPollTimer));
}

async function loadEmployeePortal() {
  renderMetrics([]);
  renderLoadingList("#approvals-list");
  renderLoadingList("#notifications-list");
  renderLoadingList("#dashboard-notifications-list", 2);
  renderLoadingList("#scheduled-list");
  renderLoadingList("#visitor-invite-list");
  renderLoadingList("#dashboard-upcoming-list", 2);
  renderLoadingList("#employee-attendance-list");
  renderLoadingList("#recent-activity-list", 2);
  renderPresenceSummary([]);
  renderAttendanceSummary([]);

  const [overview, notifications, scheduled, attendance, invites] = await Promise.allSettled([
    request("/employee/overview"),
    request("/employee/notifications"),
    request("/employee/scheduled-visitors"),
    getOwnEmployeeAttendance(),
    listEmployeeVisitorInvites(),
  ]);

  if (overview.status === "fulfilled") {
    renderMetrics(overview.value?.data?.metrics || []);
  } else {
    renderMetrics([]);
  }

  await loadApprovals(false);

  if (notifications.status === "fulfilled") {
    renderNotificationLists(notifications.value?.data || []);
  } else {
    renderWorkList("#notifications-list", [], (item) => item, "Notifications unavailable", notifications.reason?.message || "Notifications could not be loaded.");
    renderWorkList("#dashboard-notifications-list", [], (item) => item, "Notifications unavailable", notifications.reason?.message || "Notifications could not be loaded.");
  }

  if (scheduled.status === "fulfilled") {
    const scheduledItems = scheduled.value?.data || [];
    renderScheduledVisitors(scheduledItems);
    renderUpcomingVisitors(scheduledItems);
  } else {
    renderWorkList("#scheduled-list", [], (item) => item, "Schedule unavailable", scheduled.reason?.message || "Schedule could not be loaded.");
    renderWorkList("#dashboard-upcoming-list", [], (item) => item, "Schedule unavailable", scheduled.reason?.message || "Schedule could not be loaded.");
  }

  if (invites.status === "fulfilled") {
    renderVisitorInvites(invites.value?.data || []);
  } else {
    renderWorkList("#visitor-invite-list", [], (item) => item, "Invites unavailable", invites.reason?.message || "Visitor invites could not be loaded.");
  }

  if (attendance.status === "fulfilled") {
    const attendanceItems = attendance.value?.data || [];
    renderOwnAttendance(attendanceItems);
    renderPresenceSummary(attendanceItems);
    renderAttendanceSummary(attendanceItems);
    renderRecentActivity(attendanceItems, notifications.status === "fulfilled" ? notifications.value?.data || [] : []);
  } else {
    renderWorkList("#employee-attendance-list", [], (item) => item, "Presence unavailable", attendance.reason?.message || "Presence history could not be loaded.");
    renderWorkList("#recent-activity-list", [], (item) => item, "Activity unavailable", attendance.reason?.message || "Activity could not be loaded.");
  }
}

function renderNotificationLists(items) {
  const mapper = (notification) => workCard(notification.title, notification.message, formatDate(notification.createdAt));
  renderWorkList("#notifications-list", items, mapper, "No employee notices", "Visitor updates and reminders will appear here.");
  renderWorkList("#dashboard-notifications-list", items.slice(0, 3), mapper, "No recent notices", "New visitor updates will appear here.");
}

function renderUpcomingVisitors(items) {
  renderWorkList("#dashboard-upcoming-list", items.slice(0, 3), (visitor) => {
    const windowText = `${formatDate(visitor.accessWindowStartTime || visitor.scheduledStartTime)} - ${formatTime(visitor.accessWindowEndTime || visitor.scheduledEndTime)}`;
    return workCard(visitor.fullName, visitor.purposeOfVisit || visitor.companyName || "Visitor request", windowText);
  }, "No upcoming visitors", "Scheduled or pre-approved visitors will appear here.");
}

function renderPresenceSummary(items) {
  const panel = document.querySelector("#presence-summary");
  if (!panel) {
    return;
  }
  const latest = items[0];
  const currentlyIn = latest?.state === "IN" || latest?.status === "INSIDE" || (latest?.checkInTime && !latest?.checkOutTime);
  panel.innerHTML = `
    <span class="presence-indicator ${currentlyIn ? "is-present" : ""}" aria-hidden="true"></span>
    <div>
      <strong>${currentlyIn ? "Checked in" : "Not checked in"}</strong>
      <p>${escapeHtml(latest ? presenceDetail(latest) : "Your next badge scan will update presence.")}</p>
    </div>
  `;
}

function renderAttendanceSummary(items) {
  const panel = document.querySelector("#attendance-summary");
  if (!panel) {
    return;
  }
  const today = new Date().toDateString();
  const todayItems = items.filter((item) => {
    const date = item.attendanceDate || item.checkInTime || item.createdAt;
    return date && new Date(date).toDateString() === today;
  });
  const latest = items[0];
  panel.innerHTML = `
    ${summaryTile("Today events", todayItems.length)}
    ${summaryTile("Latest state", formatStatusLabel(latest?.state || latest?.status))}
    ${summaryTile("Last scan", latest ? formatDate(latest.checkOutTime || latest.checkInTime || latest.createdAt) : "Pending")}
  `;
}

function renderRecentActivity(attendanceItems, notificationItems) {
  const activity = [
    ...attendanceItems.slice(0, 3).map((item) => ({
      title: formatStatusLabel(item.state || item.status),
      detail: presenceDetail(item),
      at: item.checkOutTime || item.checkInTime || item.createdAt,
    })),
    ...notificationItems.slice(0, 3).map((item) => ({
      title: item.title,
      detail: item.message,
      at: item.createdAt,
    })),
  ].sort((left, right) => new Date(right.at || 0) - new Date(left.at || 0)).slice(0, 4);

  renderWorkList("#recent-activity-list", activity, (item) => workCard(item.title, item.detail, formatDate(item.at)), "No recent activity", "Approvals, scans, and notices will appear here.");
}

function summaryTile(label, value) {
  return `
    <div class="employee-summary-tile">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function presenceDetail(log) {
  if (!log) {
    return "Presence pending";
  }
  if (log.checkOutTime) {
    return `Checked out ${formatDate(log.checkOutTime)}`;
  }
  if (log.checkInTime) {
    return `${log.late ? "Late arrival" : "Checked in"} ${formatDate(log.checkInTime)}`;
  }
  return log.shiftName || "Presence recorded";
}

function renderOwnAttendance(items) {
  renderWorkList("#employee-attendance-list", items, (log) => `
    <article class="work-card">
      <h3>${escapeHtml(formatStatusLabel(log.status))}</h3>
      <p>${escapeHtml(log.shiftName || "Shift")} · ${escapeHtml(log.late ? "Late arrival" : "Presence recorded")}</p>
      <small>In ${escapeHtml(formatDate(log.checkInTime))} · Out ${escapeHtml(formatDate(log.checkOutTime))}</small>
    </article>
  `, "No presence history", "Your check-ins and check-outs will appear after security scans your employee badge.");
}

function renderOwnBadge(badge, error = "") {
  const panel = document.querySelector("#employee-badge-panel");
  if (!panel) {
    return;
  }
  if (!badge) {
    panel.innerHTML = `<article class="approval-empty"><h3>Badge unavailable</h3><p>${escapeHtml(error || "Your employee badge is not ready yet.")}</p></article>`;
    renderCredentialCompanions(null);
    return;
  }
  panel.innerHTML = employeeBadgeMarkup(badge);
  renderCredentialCompanions(badge);
}

function renderCredentialCompanions(badge) {
  const qrPanel = document.querySelector("#credential-qr-panel");
  const mobilePanel = document.querySelector("#credential-mobile-preview");
  if (qrPanel) {
    qrPanel.innerHTML = badge ? `
      <div>
        <p class="eyebrow">Static QR Code</p>
        <h3>Reusable Identity QR</h3>
      </div>
      <img src="${escapeHtml(badge.qrImageDataUri)}" alt="Static employee QR" />
      <code>${escapeHtml(badge.qrPayload || "QR identity pending")}</code>
    ` : `
      <div>
        <p class="eyebrow">Static QR Code</p>
        <h3>QR pending</h3>
      </div>
      <p>Your reusable QR identity will appear here once available.</p>
    `;
  }
  if (mobilePanel) {
    mobilePanel.innerHTML = badge ? `
      <div>
        <p class="eyebrow">Mobile Preview</p>
        <h3>${escapeHtml(badge.fullName || "Employee")}</h3>
      </div>
      <div class="mobile-badge-preview">
        <img src="${escapeHtml(badge.employeePhotoUrl || "")}" alt="" data-mobile-photo />
        <div>
          <strong>${escapeHtml(badge.employeeId || "Employee ID pending")}</strong>
          <span>${escapeHtml(joinSoft([badge.department, badge.designation]))}</span>
        </div>
        <img src="${escapeHtml(badge.qrImageDataUri)}" alt="Static QR" />
      </div>
    ` : `
      <div>
        <p class="eyebrow">Mobile Preview</p>
        <h3>Preview pending</h3>
      </div>
      <p>Your compact credential preview will appear here.</p>
    `;
    const photo = mobilePanel.querySelector("[data-mobile-photo]");
    if (photo && !badge?.employeePhotoUrl) {
      photo.remove();
    }
  }
}

function initEmployeeBadgeActions() {
  document.querySelector("#credential")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-own-badge-action]");
    if (!button || !activeEmployeeBadge) {
      return;
    }
    try {
      const action = button.dataset.ownBadgeAction;
      if (action === "print") {
        await printEmployeeBadge(activeEmployeeBadge);
      }
      if (action === "png" || action === "pdf") {
        await downloadEmployeeBadge(activeEmployeeBadge, action);
        showToast("Badge downloaded", `Saved ${action.toUpperCase()} employee badge.`);
      }
    } catch (error) {
      showToast("Badge action failed", error.message);
    }
  });
}

function initEmployeeRouteLoading() {
  syncEmployeeRouteVisibility();
  window.addEventListener("hashchange", () => {
    syncEmployeeRouteVisibility();
    void loadRouteData();
  });
}

async function loadRouteData() {
  const route = window.location.hash.replace("#", "") || "dashboard";
  if (route === "credential") {
    await loadCredentialPage();
  }
  if (route === "settings") {
    await loadEmployeeSettings();
  }
}

function syncEmployeeRouteVisibility() {
  const route = ROUTES.includes(window.location.hash.replace("#", ""))
    ? window.location.hash.replace("#", "")
    : "dashboard";
  document.querySelectorAll(".employee-route").forEach((section) => {
    section.hidden = section.id !== route;
  });
}

async function loadCredentialPage(force = false) {
  if (credentialLoaded && !force) {
    return;
  }
  const panel = document.querySelector("#employee-badge-panel");
  if (panel) {
    panel.innerHTML = `<article class="approval-empty"><h3>Loading credential</h3><p>Preparing your badge preview and static QR.</p></article>`;
  }
  try {
    const response = await getEmployeeBadge("/employee");
    activeEmployeeBadge = response?.data || null;
    renderOwnBadge(activeEmployeeBadge);
    credentialLoaded = Boolean(activeEmployeeBadge);
  } catch (error) {
    activeEmployeeBadge = null;
    credentialLoaded = false;
    renderOwnBadge(null, error.message);
  }
}

function initCredentialPhotoForm() {
  const form = document.querySelector("#credential-photo-form");
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
    setText("#credential-photo-status", "Uploading photo...");
    const localPreviewUrl = URL.createObjectURL(file);
    if (activeEmployeeBadge) {
      activeEmployeeBadge = { ...activeEmployeeBadge, employeePhotoUrl: localPreviewUrl };
      renderOwnBadge(activeEmployeeBadge);
    }
    try {
      const upload = await uploadEmployeeProfilePhoto(file);
      const photoUrl = upload?.data?.url;
      if (!photoUrl) {
        throw new Error("Photo upload completed without a usable URL.");
      }
      await updateEmployeeProfile({ employeePhotoUrl: photoUrl });
      credentialLoaded = false;
      settingsLoaded = false;
      await loadCredentialPage(true);
      showToast("Photo updated", "Badge preview refreshed. Your static QR identity did not change.");
      setText("#credential-photo-status", "Photo updated on your employee credential.");
    } catch (error) {
      showToast("Photo update failed", error.message);
      setText("#credential-photo-status", "Photo update failed. Your credential QR was not changed.");
      await loadCredentialPage(true);
    } finally {
      URL.revokeObjectURL(localPreviewUrl);
      input.value = "";
    }
  });
}

function initEmployeeSettingsForm() {
  const form = document.querySelector("#employee-settings-form");
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
    setFormLoading(form, true);
    try {
      const response = await updateEmployeeProfile({
        phoneCountryCode: phone.phoneCountryCode,
        phone: phone.phone,
        emergencyContact: trim(data.emergencyContact),
        preferredLanguage: trim(data.preferredLanguage),
        notificationInAppEnabled: Boolean(data.notificationInAppEnabled),
        notificationEmailEnabled: Boolean(data.notificationEmailEnabled),
      });
      activeEmployeeProfile = response?.data || null;
      renderSettingsProfile(activeEmployeeProfile);
      showToast("Settings saved", "Your self-managed profile preferences were updated.");
    } catch (error) {
      showToast("Settings update failed", error.message);
    } finally {
      setFormLoading(form, false);
    }
  });
}

function initEmployeePasswordForm() {
  const form = document.querySelector("#employee-password-form");
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
      await updateEmployeePassword({
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

async function loadEmployeeSettings(force = false) {
  if (settingsLoaded && !force) {
    return;
  }
  try {
    const response = await getEmployeeProfile();
    activeEmployeeProfile = response?.data || null;
    renderSettingsProfile(activeEmployeeProfile);
    settingsLoaded = Boolean(activeEmployeeProfile);
  } catch (error) {
    showToast("Settings unavailable", error.message);
  }
}

function renderSettingsProfile(profile) {
  const form = document.querySelector("#employee-settings-form");
  if (!profile || !form) {
    return;
  }
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
  renderRestrictedProfile(profile);
}

function renderRestrictedProfile(profile) {
  const card = document.querySelector("#restricted-profile-card");
  if (!card) {
    return;
  }
  card.innerHTML = `
    <div>
      <p class="eyebrow">Admin-Controlled</p>
      <h3>Identity Fields</h3>
    </div>
    <dl>
      ${profileDetail("Full name", profile.fullName)}
      ${profileDetail("Employee ID", profile.employeeId)}
      ${profileDetail("Department", profile.department, "Department pending")}
      ${profileDetail("Designation", profile.designation, "Designation pending")}
      ${profileDetail("Role", formatStatus(profile.roles?.[0] || "EMPLOYEE"))}
      ${profileDetail("Shift", formatShiftLabel(profile), "Shift pending")}
      ${profileDetail("Organization", profile.organizationName || profile.organizationCode)}
      ${profileDetail("Workforce status", formatStatus(profile.accountStatus || "ACTIVE"))}
    </dl>
  `;
}

function profileDetail(label, value, fallback = "Pending") {
  const text = value || fallback;
  if (!text) {
    return "";
  }
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(text)}</dd></div>`;
}

function formatShiftLabel(profile) {
  if (!profile?.shiftName && !profile?.shiftStartTime && !profile?.shiftEndTime) {
    return "";
  }
  const timing = profile.shiftStartTime && profile.shiftEndTime ? `${profile.shiftStartTime} to ${profile.shiftEndTime}` : "Timing pending";
  return `${profile.shiftName || "Shift pending"} · ${timing}`;
}

function initPreApprovalForm() {
  const form = document.querySelector("#preapproval-form");
  if (!form) {
    return;
  }

  initPhoneInput(form);
  const timezone = getDefaultTimezone();
  const timezoneLabel = document.querySelector("#preapproval-timezone");
  if (timezoneLabel) {
    timezoneLabel.textContent = `Times use ${timezoneLabelText(timezone)}`;
  }
  setScheduleMinimums(form);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = preApprovalPayload(form, timezone);
    const error = validatePreApproval(payload);
    if (error) {
      showToast("Check schedule", error);
      return;
    }

    setFormLoading(form, true);
    try {
      await preApproveVisitor(payload);
      form.reset();
      setScheduleMinimums(form);
      showToast("Visitor pre-approved", "Security can verify the visitor during the scheduled window.");
      await loadEmployeePortal();
    } catch (error) {
      showToast("Pre-approval failed", error.message);
    } finally {
      setFormLoading(form, false);
    }
  });
}

function initVisitorInviteForm() {
  const form = document.querySelector("#visitor-invite-form");
  if (!form) {
    return;
  }

  initPhoneInput(form);
  const timezone = getDefaultTimezone();
  const timezoneLabel = document.querySelector("#visitor-invite-timezone");
  if (timezoneLabel) {
    timezoneLabel.textContent = `Times use ${timezoneLabelText(timezone)}`;
  }
  setInviteMinimums(form);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = visitorInvitePayload(form, timezone);
    const error = validateVisitorInvite(payload);
    if (error) {
      showToast("Check invite", error);
      return;
    }

    setFormLoading(form, true);
    try {
      const response = await createEmployeeVisitorInvite(payload);
      const invite = response?.data || {};
      form.reset();
      setInviteMinimums(form);
      showToast("Invite created", invite.visitorEmail ? "Email delivery is queued and the secure link is ready." : "Secure invite link is ready to share.");
      if (invite.inviteUrl && !invite.visitorEmail) {
        await shareInvite(invite);
      }
      await loadEmployeePortal();
    } catch (error) {
      showToast("Invite failed", error.message);
    } finally {
      setFormLoading(form, false);
    }
  });
}

function initVisitorInviteActions() {
  document.querySelector("#visitor-invite-list")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-invite-action]");
    if (!button) {
      return;
    }
    const action = button.dataset.inviteAction;
    const inviteId = button.dataset.inviteId;
    const card = button.closest("[data-invite-card]");
    try {
      setInviteLoading(card, true);
      if (action === "share") {
        await shareInvite({
          inviteUrl: button.dataset.inviteUrl,
          visitorName: button.dataset.visitorName,
        });
        return;
      }
      if (action === "resend") {
        await resendEmployeeVisitorInvite(inviteId);
        showToast("Invite resent", "Email delivery has been queued again.");
      }
      if (action === "revoke") {
        const reason = window.prompt("Reason for revoking this visitor invite.");
        if (!reason?.trim()) {
          return;
        }
        await revokeEmployeeVisitorInvite(inviteId, reason.trim());
        showToast("Invite revoked", "The visitor invite lifecycle was closed.");
      }
      await loadEmployeePortal();
    } catch (error) {
      showToast("Invite action failed", error.message);
    } finally {
      setInviteLoading(card, false);
    }
  });
}

async function loadApprovals(showToastOnSuccess) {
  const list = document.querySelector("#approvals-list");
  if (!list) {
    return;
  }

  try {
    const approvals = await request("/employee/approvals");
    const items = approvals?.data?.items || [];
    list.innerHTML = items.length ? items.map(approvalCard).join("") : `
      <article class="approval-empty">
        <h3>No pending approvals</h3>
        <p>New visitor requests will appear here automatically.</p>
      </article>
    `;
    if (showToastOnSuccess) {
      showToast("Approvals refreshed", `${items.length} pending request${items.length === 1 ? "" : "s"}.`);
    }
  } catch (error) {
    showToast("Approvals unavailable", error.message);
  }
}

function initApprovalActions() {
  document.querySelector("#approvals-list")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-approval-action]");
    if (!button) {
      return;
    }

    const action = button.dataset.approvalAction;
    const id = button.dataset.visitorId;
    const card = button.closest(".approval-card");
    const note = card?.querySelector("[data-approval-note]")?.value?.trim() || "";

    setApprovalLoading(card, true);
    try {
      if (action === "approve") {
        await approveVisitor("/employee", id, note);
        showToast("Visitor approved", "Security can now check in this visitor.");
      }
      if (action === "reject") {
        await rejectVisitor("/employee", id, note || "Denied by host employee.");
        showToast("Visitor denied", "Security will see the updated status.");
      }
      if (action === "approve-reschedule") {
        await approveRescheduleRequest("/employee", id, note);
        showToast("Reschedule approved", "The previous QR was invalidated and a new pass window is active.");
      }
      if (action === "reject-reschedule") {
        await rejectRescheduleRequest("/employee", id, note || "Timing change declined by host employee.");
        showToast("Reschedule denied", "The original approved timing remains active.");
      }
      await loadApprovals(false);
      await loadEmployeePortal();
    } catch (error) {
      showToast("Approval failed", error.message);
    } finally {
      setApprovalLoading(card, false);
    }
  });
}

function renderScheduledVisitors(items) {
  const list = document.querySelector("#scheduled-list");
  if (!list) {
    return;
  }

  list.innerHTML = items.length ? items.map(scheduledCard).join("") : `
    <article class="approval-empty">
      <h3>No upcoming visitors</h3>
      <p>Pre-approved visitors will appear here after scheduling.</p>
    </article>
  `;
}

function renderVisitorInvites(items) {
  renderWorkList("#visitor-invite-list", items, inviteCard, "No visitor invites", "Create a secure pre-registration invite to track its lifecycle here.");
}

function inviteCard(invite) {
  const stage = canonicalVisitorInviteStage(invite);
  const canRevoke = !["REVOKED", "EXPIRED", "CHECKED_IN", "CHECKED_OUT"].includes(stage);
  const canResend = Boolean(invite.visitorEmail) && canRevoke;
  const emailState = invite.visitorEmail
    ? `${formatStatusLabel(invite.emailStatus || "PENDING")}${invite.emailSentAt ? ` · sent ${formatDate(invite.emailSentAt)}` : ""}`
    : "No email, share link manually";
  return `
    <article class="scheduled-card" data-invite-card>
      <div>
        <h3>${escapeHtml(invite.visitorName || "Visitor invite")}</h3>
        <p>${escapeHtml([invite.companyName, invite.purposeOfVisit].filter(Boolean).join(" · ") || "Pre-registration invite")}</p>
      </div>
      <dl>
        <div><dt>Status</dt><dd>${escapeHtml(invite.lifecycleLabel || visitorInviteStatusLabel(invite))}</dd></div>
        <div><dt>Next step</dt><dd>${escapeHtml(invite.nextAction || "Monitor lifecycle")}</dd></div>
        <div><dt>Arrival</dt><dd>${escapeHtml(formatDate(invite.scheduledStartTime))}</dd></div>
        <div><dt>Expires</dt><dd>${escapeHtml(formatDate(invite.expiresAt))}</dd></div>
        <div><dt>Email</dt><dd>${escapeHtml(emailState)}</dd></div>
        <div><dt>Badge</dt><dd>${escapeHtml(invite.pass?.badgeId || (invite.qrIssuedAt ? "QR issued" : "Issued after approval"))}</dd></div>
        <div><dt>Viewed</dt><dd>${escapeHtml(invite.viewedAt ? formatDate(invite.viewedAt) : "Not viewed")}</dd></div>
        <div><dt>Registered</dt><dd>${escapeHtml(invite.registrationCompletedAt ? formatDate(invite.registrationCompletedAt) : "Pending")}</dd></div>
      </dl>
      ${invite.revocationReason ? `<p>${escapeHtml(invite.revocationReason)}</p>` : ""}
      <div class="scheduled-card__footer">
        <span class="status-badge ${escapeHtml(statusBadgeClass(stage))}">${escapeHtml(visitorInviteStatusLabel(invite))}</span>
        <span>${escapeHtml(invite.note || "Approval visibility follows host/workplace review.")}</span>
      </div>
      <div class="scheduled-card__actions">
        ${invite.inviteUrl ? `<button class="button button--ghost" type="button" data-invite-action="share" data-invite-id="${escapeHtml(invite.id)}" data-invite-url="${escapeHtml(invite.inviteUrl)}" data-visitor-name="${escapeHtml(invite.visitorName || "Visitor")}">Share invite</button>` : ""}
        ${canResend ? `<button class="button button--ghost" type="button" data-invite-action="resend" data-invite-id="${escapeHtml(invite.id)}">Resend invite</button>` : ""}
        ${canRevoke ? `<button class="button button--ghost" type="button" data-invite-action="revoke" data-invite-id="${escapeHtml(invite.id)}">Revoke invite</button>` : ""}
      </div>
    </article>
  `;
}

function scheduledCard(visitor) {
  const windowText = `${formatDate(visitor.accessWindowStartTime || visitor.scheduledStartTime)} - ${formatTime(visitor.accessWindowEndTime || visitor.scheduledEndTime)}`;
  const company = visitor.companyName || "Unlisted company";
  const status = formatStatus(visitor.status);
  const pending = visitor.rescheduleStatus === "PENDING" && visitor.pendingScheduledStartTime;
  return `
    <article class="scheduled-card">
      <div>
        <h3>${escapeHtml(visitor.fullName)}</h3>
        <p>${escapeHtml(company)} · ${escapeHtml(visitor.purposeOfVisit)}</p>
      </div>
      <dl>
        <div><dt>Window</dt><dd>${escapeHtml(windowText)}</dd></div>
        <div><dt>Meeting</dt><dd>${escapeHtml(formatDate(visitor.scheduledStartTime))}</dd></div>
        <div><dt>Reschedule</dt><dd>${escapeHtml(pending ? formatDate(visitor.pendingScheduledStartTime) : visitor.rescheduleStatus || "None")}</dd></div>
        <div><dt>Pass</dt><dd>${escapeHtml(visitor.qrCode || "Pending")}</dd></div>
      </dl>
      <div class="scheduled-card__footer">
        <span>${escapeHtml(visitor.scheduledTimezone || "UTC")}</span>
        <span class="status-badge ${escapeHtml(statusBadgeClass(visitor.status))}">${escapeHtml(status)}</span>
      </div>
      <div class="scheduled-card__actions">
        ${pending ? `<button class="button button--primary" type="button" data-approval-action="approve-reschedule" data-visitor-id="${escapeHtml(visitor.id)}">Approve timing</button><button class="button button--ghost" type="button" data-approval-action="reject-reschedule" data-visitor-id="${escapeHtml(visitor.id)}">Deny timing</button>` : ""}
        <button class="button button--ghost" type="button" data-direct-reschedule="${escapeHtml(visitor.id)}">Modify timing</button>
      </div>
    </article>
  `;
}

function initScheduledActions() {
  document.querySelector("#scheduled-list")?.addEventListener("click", async (event) => {
    const decisionButton = event.target.closest("[data-approval-action]");
    if (decisionButton) {
      try {
        if (decisionButton.dataset.approvalAction === "approve-reschedule") {
          await approveRescheduleRequest("/employee", decisionButton.dataset.visitorId, "");
          showToast("Reschedule approved", "The badge was regenerated for the new timing.");
        }
        if (decisionButton.dataset.approvalAction === "reject-reschedule") {
          const note = window.prompt("Reason for rejecting this timing change.") || "Timing change declined by host employee.";
          await rejectRescheduleRequest("/employee", decisionButton.dataset.visitorId, note);
          showToast("Reschedule denied", "The original timing remains active.");
        }
        await loadEmployeePortal();
      } catch (error) {
        showToast("Reschedule failed", error.message);
      }
      return;
    }
    const rescheduleButton = event.target.closest("[data-direct-reschedule]");
    if (!rescheduleButton) {
      return;
    }
    const dateTime = window.prompt("Enter the new visit date and arrival time as YYYY-MM-DD HH:mm.");
    if (!dateTime) {
      return;
    }
    const scheduledStartTime = toIsoInstant(dateTime.trim().replace(" ", "T"), getDefaultTimezone());
    if (!scheduledStartTime || new Date(scheduledStartTime) <= new Date()) {
      showToast("Invalid timing", "Enter a future date and time.");
      return;
    }
    try {
      await hostRescheduleVisitor("/employee", rescheduleButton.dataset.directReschedule, {
        scheduledStartTime,
        expectedDurationMinutes: 60,
        timezone: getDefaultTimezone(),
        note: "Timing modified by host.",
      });
      showToast("Timing updated", "The previous QR was invalidated and the new access window is active.");
      await loadEmployeePortal();
    } catch (error) {
      showToast("Reschedule failed", error.message);
    }
  });
}

function approvalCard(visitor) {
  return `
    <article class="approval-card">
      <div class="approval-card__media">
        ${visitor.photoUrl ? `<img src="${escapeHtml(visitor.photoUrl)}" alt="${escapeHtml(visitor.fullName)} photo" loading="lazy" />` : ""}
      </div>
      <div class="approval-card__body">
        <div class="approval-card__header">
          <div>
            <h3>${escapeHtml(visitor.fullName)}</h3>
            <p>${escapeHtml(visitor.companyName || "Unlisted company")} · ${escapeHtml(visitor.phone)}</p>
          </div>
          <span class="status-badge ${escapeHtml(statusBadgeClass("PENDING"))}">Pending approval</span>
        </div>
        <dl class="approval-meta">
          <div><dt>Purpose</dt><dd>${escapeHtml(visitor.purposeOfVisit)}</dd></div>
          <div><dt>Requested</dt><dd>${formatDate(visitor.createdAt)}</dd></div>
          <div><dt>Arrival</dt><dd>${formatDate(visitor.scheduledStartTime)}</dd></div>
          <div><dt>Access window</dt><dd>${formatDate(visitor.accessWindowStartTime)} - ${formatTime(visitor.accessWindowEndTime)}</dd></div>
          ${visitor.rescheduleStatus === "PENDING" ? `<div><dt>Requested timing</dt><dd>${formatDate(visitor.pendingScheduledStartTime)}</dd></div>` : ""}
        </dl>
        ${approvalTimeline(visitor.statusHistory)}
        <label class="form-field">
          <span>Decision note</span>
          <input data-approval-note type="text" maxlength="240" placeholder="Optional approval or rejection note" />
        </label>
        <div class="approval-card__actions">
          <button class="button button--ghost" type="button" data-approval-action="reject" data-visitor-id="${escapeHtml(visitor.id)}">Deny</button>
          <button class="button button--primary" type="button" data-approval-action="approve" data-visitor-id="${escapeHtml(visitor.id)}">Approve</button>
          ${visitor.rescheduleStatus === "PENDING" ? `<button class="button button--ghost" type="button" data-approval-action="reject-reschedule" data-visitor-id="${escapeHtml(visitor.id)}">Deny timing</button><button class="button button--primary" type="button" data-approval-action="approve-reschedule" data-visitor-id="${escapeHtml(visitor.id)}">Approve timing</button>` : ""}
        </div>
      </div>
    </article>
  `;
}

function approvalTimeline(history = []) {
  const items = history.map((entry) => `
    <li>
      <strong>${escapeHtml(formatStatus(entry.status))}</strong>
      <span>${formatDate(entry.timestamp)}</span>
      ${entry.note ? `<small>${escapeHtml(entry.note)}</small>` : ""}
    </li>
  `).join("");
  return `<ol class="approval-timeline">${items}</ol>`;
}

function setApprovalLoading(card, loading) {
  card?.querySelectorAll("button").forEach((button) => {
    button.toggleAttribute("disabled", loading);
    button.classList.toggle("is-loading", loading);
  });
}

function preApprovalPayload(form, timezone) {
  const data = Object.fromEntries(new FormData(form).entries());
  const phone = phonePayload(data);
  return {
    fullName: trim(data.fullName),
    phoneCountryCode: phone.phoneCountryCode,
    phone: phone.phone,
    email: trim(data.email),
    purposeOfVisit: trim(data.purposeOfVisit),
    scheduledStartTime: toIsoInstant(data.scheduledStartTime, timezone),
    scheduledEndTime: toIsoInstant(data.scheduledEndTime, timezone),
    timezone,
    note: trim(data.note),
  };
}

function visitorInvitePayload(form, timezone) {
  const data = Object.fromEntries(new FormData(form).entries());
  const phone = phonePayload(data);
  const duration = Number(data.expectedDurationMinutes || 60);
  const scheduledStartTime = toIsoInstant(data.scheduledStartTime, timezone);
  const scheduledEndTime = scheduledStartTime
    ? new Date(new Date(scheduledStartTime).getTime() + duration * 60 * 1000).toISOString()
    : null;
  return {
    visitorName: trim(data.visitorName),
    visitorEmail: trim(data.visitorEmail),
    phoneCountryCode: phone.phoneCountryCode,
    visitorPhone: phone.phone,
    companyName: trim(data.companyName),
    purposeOfVisit: trim(data.purposeOfVisit),
    visitorType: "ONE_TIME",
    scheduledStartTime,
    scheduledEndTime,
    expectedDurationMinutes: duration,
    timezone,
    approvalRequired: true,
    expiresInHours: Number(data.expiresInHours || 72),
    note: trim(data.note),
  };
}

function validatePreApproval(payload) {
  if (!payload.fullName || payload.fullName.length < 2) {
    return "Enter the visitor full name.";
  }
  const phoneError = validatePhonePayload(payload);
  if (phoneError) {
    return phoneError;
  }
  if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    return "Enter a valid email address.";
  }
  if (!payload.purposeOfVisit || payload.purposeOfVisit.length < 2) {
    return "Enter the purpose of visit.";
  }
  const start = new Date(payload.scheduledStartTime);
  const end = new Date(payload.scheduledEndTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Choose a valid start and end time.";
  }
  if (start <= new Date()) {
    return "Choose a future start time.";
  }
  if (end <= start) {
    return "Choose an end time after the start.";
  }
  if (end - start < 15 * 60 * 1000) {
    return "The visit window must be at least 15 minutes.";
  }
  return "";
}

function validateVisitorInvite(payload) {
  if (!payload.visitorName || payload.visitorName.length < 2) {
    return "Enter the visitor full name.";
  }
  if (payload.visitorEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.visitorEmail)) {
    return "Enter a valid visitor email address.";
  }
  if (payload.visitorPhone) {
    const phoneError = validatePhonePayload({
      phoneCountryCode: payload.phoneCountryCode,
      phone: payload.visitorPhone,
    }, { required: false });
    if (phoneError) {
      return phoneError;
    }
  }
  if (!payload.purposeOfVisit || payload.purposeOfVisit.length < 2) {
    return "Enter the purpose of visit.";
  }
  if (!payload.scheduledStartTime || new Date(payload.scheduledStartTime) <= new Date()) {
    return "Choose a future arrival time.";
  }
  if (!payload.expectedDurationMinutes || payload.expectedDurationMinutes < 15 || payload.expectedDurationMinutes > 1440) {
    return "Choose a valid expected duration.";
  }
  return "";
}

async function shareInvite(invite) {
  const inviteUrl = invite?.inviteUrl;
  if (!inviteUrl) {
    showToast("Share unavailable", "This invite does not have a secure link.");
    return;
  }
  const text = `AccessFlow visitor pre-registration for ${invite.visitorName || "your visit"}: ${inviteUrl}`;
  if (navigator.share) {
    await navigator.share({ title: "AccessFlow visitor invite", text, url: inviteUrl });
    return;
  }
  await navigator.clipboard?.writeText(text);
  showToast("Invite copied", "The secure invite link was copied to the clipboard.");
}

function timezoneLabelText(timezone) {
  return timezoneLabel(timezone);
}

function formatStatusLabel(status) {
  return status ? enterpriseStatusLabel(status) : "Presence pending";
}

function setScheduleMinimums(form) {
  const start = form.querySelector("[name='scheduledStartTime']");
  const end = form.querySelector("[name='scheduledEndTime']");
  const min = toDatetimeLocal(new Date(Date.now() + 5 * 60 * 1000), getDefaultTimezone());
  start?.setAttribute("min", min);
  end?.setAttribute("min", min);
}

function setFormLoading(form, loading) {
  const button = form.querySelector("button[type='submit']");
  button?.toggleAttribute("disabled", loading);
  button?.classList.toggle("is-loading", loading);
  button?.toggleAttribute("aria-busy", loading);
}

function setInviteMinimums(form) {
  const start = form.querySelector("[name='scheduledStartTime']");
  const min = toDatetimeLocal(new Date(Date.now() + 5 * 60 * 1000), getDefaultTimezone());
  start?.setAttribute("min", min);
}

function setInviteLoading(card, loading) {
  card?.querySelectorAll("button").forEach((button) => {
    button.toggleAttribute("disabled", loading);
    button.classList.toggle("is-loading", loading);
  });
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

function joinSoft(values, fallback = "Profile pending") {
  const parts = values
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : fallback;
}

function stripDialCode(value, code) {
  const text = String(value || "").trim();
  const dialCode = String(code || "").trim();
  return dialCode && text.startsWith(dialCode) ? text.slice(dialCode.length).trim() : text;
}

function trim(value) {
  const next = String(value || "").trim();
  return next || null;
}
