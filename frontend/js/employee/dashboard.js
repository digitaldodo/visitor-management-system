import { request } from "../shared/httpClient.js";
import { initAppErrorBoundary } from "../shared/appErrorBoundary.js";
import { bootstrapApplication } from "../shared/appRuntime.js";
import { formatDate, formatStatus, formatTime, getDefaultTimezone, timezoneLabel, toDatetimeLocal, toIsoInstant } from "../shared/formatters.js";
import { requireRole } from "../shared/roleGuard.js";
import { initPortalShell, renderLoadingList, renderMetrics, renderWorkList, workCard, escapeHtml } from "../shared/portalShell.js";
import { approveRescheduleRequest, approveVisitor, createEmployeeVisitorInvite, getEmployeeProfile, getOwnEmployeeAttendance, hostRescheduleVisitor, listEmployeeVisitorInvites, preApproveVisitor, rejectRescheduleRequest, rejectVisitor, resendEmployeeVisitorInvite, revokeEmployeeVisitorInvite, updateEmployeePassword, updateEmployeeProfile, uploadEmployeeProfilePhoto } from "../shared/accessService.js";
import { canonicalVisitorInviteStage, enterpriseStatusLabel, statusBadgeClass, visitorInviteStatusLabel } from "../shared/workflowEnums.js";
import { BadgePreviewPanel, QRIdentityCard, downloadEmployeeBadge, employeeBadgeQrImage, employeeBadgeSkeletonMarkup, printEmployeeBadge } from "../shared/employeeBadgeStudio.js";
import { loadEmployeeBadgeIdentity, updateEmployeeBadgeCache } from "../shared/employeeBadgeProvider.js";
import { LOGIN_FROM_PORTAL } from "../shared/config.js";
import { setText } from "../shared/dom.js";
import { clearSession } from "../shared/session.js";
import { createNonOverlappingPoller } from "../shared/performance.js";
import { showToast } from "../shared/toast.js";
import { initPhoneInput, phonePayload, setPhoneInputValues, validatePhonePayload } from "../shared/phoneInput.js";
import { promptAction } from "../shared/actionModal.js";

const ROUTES = ["dashboard", "badge", "presence", "requests", "history", "notifications", "profile", "settings"];
const ROUTE_DEFINITIONS = {
  dashboard: {
    href: "/employee/dashboard",
    title: "Employee Dashboard",
    eyebrow: "Workflow Workspace",
    loader: () => import("./routes/dashboardPage.js"),
  },
  badge: {
    href: "/employee/badge",
    title: "Badge",
    eyebrow: "Identity Center",
    loader: () => import("./routes/badgePage.js"),
  },
  presence: {
    href: "/employee/presence",
    title: "Presence",
    eyebrow: "Attendance Workspace",
    loader: () => import("./routes/presencePage.js"),
  },
  requests: {
    href: "/employee/requests",
    title: "Requests",
    eyebrow: "Approval Workspace",
    loader: () => import("./routes/requestsPage.js"),
  },
  history: {
    href: "/employee/history",
    title: "Visitor History",
    eyebrow: "Hosted Visitor Timeline",
    loader: () => import("./routes/historyPage.js"),
  },
  notifications: {
    href: "/employee/notifications",
    title: "Notifications",
    eyebrow: "Updates",
    loader: () => import("./routes/notificationsPage.js"),
  },
  profile: {
    href: "/employee/profile",
    title: "Profile",
    eyebrow: "Account Settings",
    loader: () => import("./routes/profilePage.js"),
  },
  settings: {
    href: "/employee/settings",
    title: "Settings",
    eyebrow: "Preferences",
    loader: () => import("./routes/settingsPage.js"),
  },
};
const ROUTE_ALIASES = {
  "": "dashboard",
  employee: "dashboard",
  credential: "badge",
  attendance: "presence",
  "visitor-requests": "requests",
  approvals: "requests",
  requests: "requests",
  scheduled: "requests",
  history: "history",
  badge: "badge",
  dashboard: "dashboard",
  notifications: "notifications",
  settings: "settings",
  profile: "profile",
};
let approvalPollTimer;
let employeePortalLoading = false;
let employeePortalQueued = false;
let employeePortalRevision = 0;
let employeeRouteRenderId = 0;
let approvalsLoading = false;
let approvalsQueued = false;
let activeEmployeeBadge = null;
let activeEmployeeProfile = null;
let credentialLoaded = false;
let settingsLoaded = false;
let profileLoaded = false;
let historyState = {
  page: 0,
  size: 20,
  totalPages: 0,
  filters: {},
  loading: false,
};

document.addEventListener("DOMContentLoaded", () => {
  void bootstrapApplication("employee-portal", () => bootEmployeePortal(), {
    redirectToLogin: true,
    failureMessage: "Opening employee workspace...",
  });
});

async function bootEmployeePortal() {
  initAppErrorBoundary();
  migrateLegacyEmployeeRoute();

  const session = requireRole("EMPLOYEE");
  if (!session) {
    return;
  }
  const initialRoute = currentEmployeeRoute();

  initPortalShell(session, {
    allowedRoutes: ROUTES,
    routeMap: ROUTE_DEFINITIONS,
    activeRoute: initialRoute,
    defaultHref: ROUTE_DEFINITIONS.dashboard.href,
    onRefresh: async () => {
      await loadEmployeePortal({ forceBadge: true });
      await loadRouteData({ force: true });
    },
  });
  bindEmployeeWorkspaceNavigation();
  await renderEmployeeRoute(initialRoute, { replace: true });
  initApprovalActions();
  initScheduledActions();
  initPreApprovalForm();
  initVisitorInviteForm();
  initVisitorInviteActions();
  initEmployeeBadgeActions();
  initCredentialPhotoForm();
  initEmployeeProfileForm();
  initSafeDeleteActions();
  initEmployeeSettingsForm();
  initEmployeePasswordForm();
  approvalPollTimer = createNonOverlappingPoller(() => loadApprovals(false), {
    intervalMs: 30000,
    backgroundIntervalMs: 120000,
    immediate: false,
  });
  approvalPollTimer.start();
  window.addEventListener("beforeunload", () => approvalPollTimer?.stop(), { once: true });
}

function migrateLegacyEmployeeRoute() {
  const hashRoute = routeFromHash(window.location.hash);
  if (hashRoute) {
    window.history.replaceState({}, "", ROUTE_DEFINITIONS[hashRoute].href);
    return;
  }

  const route = currentEmployeeRoute();
  const definition = ROUTE_DEFINITIONS[route] || ROUTE_DEFINITIONS.dashboard;
  if (window.location.pathname !== definition.href) {
    window.history.replaceState({}, "", definition.href);
  }
}

function routeFromHash(hash) {
  const value = String(hash || "").replace("#", "").trim().toLowerCase();
  return value ? ROUTE_ALIASES[value] || "" : "";
}

function currentEmployeeRoute() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const rawRoute = segments[0] === "employee" ? segments[1] || "dashboard" : "dashboard";
  return ROUTE_ALIASES[rawRoute] || (ROUTES.includes(rawRoute) ? rawRoute : "dashboard");
}

async function renderEmployeeRoute(route = currentEmployeeRoute(), options = {}) {
  const resolvedRoute = ROUTES.includes(route) ? route : "dashboard";
  const definition = ROUTE_DEFINITIONS[resolvedRoute];
  const host = document.querySelector("#main-content");
  if (!host || !definition) {
    return;
  }
  if (!options.replace && host.dataset.activeRoute === resolvedRoute && window.location.pathname === definition.href && !host.classList.contains("is-transitioning")) {
    setActiveRoute(resolvedRoute);
    return;
  }

  const renderId = ++employeeRouteRenderId;

  if (!options.replace && window.location.pathname !== definition.href) {
    window.history.pushState({}, "", definition.href);
  } else if (options.replace && window.location.pathname !== definition.href) {
    window.history.replaceState({}, "", definition.href);
  }

  setActiveRoute(resolvedRoute);
  setPageTitle(definition);
  host.classList.add("is-transitioning");
  host.innerHTML = `
    <section class="employee-route panel route-loading-state">
      <div class="employee-badge-skeleton">
        <div>
          <strong>Loading ${escapeHtml(definition.title)}</strong>
          <p>Preparing this workspace.</p>
        </div>
        <span></span><span></span><span></span>
      </div>
    </section>
  `;

  try {
    const pageModule = await definition.loader();
    if (renderId !== employeeRouteRenderId) {
      return;
    }
    host.innerHTML = pageModule.render();
    host.dataset.activeRoute = resolvedRoute;
    await initializeRenderedRoute(resolvedRoute, renderId);
    if (renderId !== employeeRouteRenderId) {
      return;
    }
    host.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    if (renderId !== employeeRouteRenderId) {
      return;
    }
    host.innerHTML = `
      <section class="employee-route panel">
        <div class="empty-state empty-state--inline">
          <h3>Workspace unavailable</h3>
          <p>${escapeHtml(error?.message || "This employee workspace could not be loaded.")}</p>
        </div>
      </section>
    `;
    showToast("Workspace unavailable", error?.message || "Route module could not be loaded.");
  } finally {
    if (renderId === employeeRouteRenderId) {
      requestAnimationFrame(() => host.classList.remove("is-transitioning"));
    }
  }
}

async function initializeRenderedRoute(route, renderId) {
  if (route === "requests") {
    initPreApprovalForm();
    initVisitorInviteForm();
  }
  if (route === "badge") {
    initCredentialPhotoForm();
  }
  if (route === "profile") {
    initEmployeeProfileForm();
  }
  if (route === "settings") {
    initEmployeeSettingsForm();
    initEmployeePasswordForm();
  }
  if (route === "history") {
    initVisitorHistoryFilters();
  }
  if (renderId !== employeeRouteRenderId) {
    return;
  }
  await loadEmployeePortal();
  if (renderId === employeeRouteRenderId) {
    await loadRouteData({ force: false, route });
  }
}

function bindEmployeeWorkspaceNavigation() {
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link || link.target || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const url = new URL(link.href, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/employee")) {
      return;
    }
    event.preventDefault();
    const nextRoute = ROUTE_ALIASES[url.pathname.split("/").filter(Boolean)[1] || "dashboard"] || "dashboard";
    void renderEmployeeRoute(nextRoute);
  });

  window.addEventListener("popstate", () => {
    void renderEmployeeRoute(currentEmployeeRoute(), { replace: true });
  });
}

function setActiveRoute(route) {
  document.querySelectorAll("#sidebar-nav .nav-link").forEach((link) => {
    const isActive = link.dataset.route === route;
    link.classList.toggle("is-active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
  if (window.matchMedia("(max-width: 1024px)").matches) {
    const shell = document.querySelector(".portal-shell");
    if (shell) {
      shell.dataset.sidebarState = "closed";
    }
    document.body.classList.remove("has-mobile-sidebar");
  }
}

function setPageTitle(definition) {
  setText(".topbar__title .eyebrow", definition.eyebrow || "Workflow Workspace");
  setText(".topbar__title h1", definition.title || "Employee Dashboard");
  document.title = `AccessFlow | ${definition.title || "Employee Portal"}`;
}

async function loadEmployeePortal(options = {}) {
  const { forceBadge = false } = options;
  if (employeePortalLoading) {
    employeePortalRevision += 1;
    employeePortalQueued = true;
    return;
  }
  const revision = ++employeePortalRevision;
  employeePortalLoading = true;
  employeePortalQueued = false;

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
  renderDashboardBadgeSkeleton();

  const [overview, notifications, scheduled, attendance, invites, badgeIdentity] = await Promise.allSettled([
    request("/employee/overview"),
    request("/employee/notifications"),
    request("/employee/scheduled-visitors"),
    getOwnEmployeeAttendance(),
    listEmployeeVisitorInvites(),
    loadEmployeeBadgeIdentity({ force: forceBadge }),
  ]);

  if (revision !== employeePortalRevision) {
    employeePortalLoading = false;
    if (employeePortalQueued) {
      void loadEmployeePortal();
    }
    return;
  }

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

  if (badgeIdentity.status === "fulfilled") {
    activeEmployeeProfile = badgeIdentity.value.profile || activeEmployeeProfile;
    activeEmployeeBadge = badgeIdentity.value.badge || activeEmployeeBadge;
    renderDashboardBadge(activeEmployeeBadge);
  } else {
    renderDashboardBadge(null, badgeIdentity.reason?.message || "Your badge could not be loaded.");
  }

  employeePortalLoading = false;
  if (employeePortalQueued) {
    void loadEmployeePortal();
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
    panel.innerHTML = BadgePreviewPanel(null, {
      emptyTitle: "Badge unavailable",
      emptyMessage: error || "Your employee badge is not ready yet.",
    });
    renderCredentialCompanions(null);
    setCredentialActionsState(false);
    return;
  }
  panel.innerHTML = BadgePreviewPanel(badge);
  renderCredentialCompanions(badge);
  setCredentialActionsState(true);
}

function renderDashboardBadgeSkeleton() {
  const panel = document.querySelector("#dashboard-badge-panel");
  if (!panel) {
    return;
  }
  panel.innerHTML = employeeBadgeSkeletonMarkup("Loading badge", "Syncing reusable identity QR.");
}

function renderDashboardBadge(badge, error = "") {
  const panel = document.querySelector("#dashboard-badge-panel");
  if (!panel) {
    return;
  }
  panel.innerHTML = badge ? `
    <div class="dashboard-badge-card__preview">
      ${BadgePreviewPanel(badge, { compact: true })}
    </div>
    <div class="dashboard-badge-card__footer">
      <span>${escapeHtml(badge.organizationName || badge.organizationCode || "Organization context pending")}</span>
      <a class="button button--ghost" href="/employee/badge">Open badge</a>
    </div>
  ` : `
      ${BadgePreviewPanel(null, {
      emptyTitle: "Badge unavailable",
      emptyMessage: error || "Your reusable employee badge will appear here once available.",
    })}
  `;
}

function renderCredentialCompanions(badge) {
  const qrPanel = document.querySelector("#credential-qr-panel");
  const mobilePanel = document.querySelector("#credential-mobile-preview");
  const qrImage = badge ? employeeBadgeQrImage(badge) : "";
  const hasQrImage = Boolean(firstUsableBadgeQrImage(badge));
  if (qrPanel) {
    qrPanel.innerHTML = badge ? QRIdentityCard(badge, {
      title: hasQrImage ? "Reusable Identity QR" : "QR image pending",
    }) : `
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
        <img src="${escapeHtml(qrImage)}" alt="${hasQrImage ? "Static QR" : "QR pending"}" />
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

function setCredentialActionsState(enabled) {
  document.querySelectorAll("[data-own-badge-action]").forEach((button) => {
    button.toggleAttribute("disabled", !enabled);
    button.setAttribute("aria-disabled", String(!enabled));
  });
}

function initEmployeeBadgeActions() {
  if (document.body.dataset.employeeBadgeActionsBound === "true") {
    return;
  }
  document.body.dataset.employeeBadgeActionsBound = "true";
  document.addEventListener("click", async (event) => {
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

async function loadRouteData(options = {}) {
  const { force = false } = options;
  const route = options.route || currentEmployeeRoute();
  if (route === "badge") {
    await loadCredentialPage(force);
  }
  if (route === "settings" || route === "profile") {
    await loadEmployeeSettings(force);
  }
  if (route === "history") {
    await loadVisitorHistory(force);
  }
}

async function loadCredentialPage(force = false) {
  if (credentialLoaded && !force) {
    return;
  }
  const panel = document.querySelector("#employee-badge-panel");
  if (panel) {
    panel.innerHTML = employeeBadgeSkeletonMarkup("Loading credential", "Preparing your badge preview and static QR.");
  }
  setCredentialActionsState(false);
  try {
    const badgeIdentity = await loadEmployeeBadgeIdentity({ force });
    activeEmployeeProfile = badgeIdentity.profile || activeEmployeeProfile;
    activeEmployeeBadge = badgeIdentity.badge;
    renderOwnBadge(activeEmployeeBadge);
    renderDashboardBadge(activeEmployeeBadge);
    credentialLoaded = Boolean(activeEmployeeBadge);
  } catch (error) {
    activeEmployeeBadge = null;
    credentialLoaded = false;
    renderOwnBadge(null, error.message);
  }
}

function firstUsableBadgeQrImage(badge) {
  return [
    badge?.qrImageDataUri,
    badge?.staticFallbackQrImageDataUri,
    badge?.qrCodeImageDataUri,
    badge?.qrCodeDataUri,
  ].find((value) => /^data:image\/(?:png|jpeg|jpg|webp|svg\+xml);/i.test(String(value || "").trim())) || "";
}

function initCredentialPhotoForm() {
  const form = document.querySelector("#credential-photo-form");
  const input = form?.querySelector("input[name='profilePhoto']");
  if (!form || !input) {
    return;
  }
  if (form.dataset.bound === "true") {
    return;
  }
  form.dataset.bound = "true";
  initProfileUploadCard(form, {
    emptyTitle: "Upload profile photo",
    emptyMeta: "PNG, JPG, or WebP up to 5MB",
    currentPhotoUrl: activeEmployeeBadge?.employeePhotoUrl || activeEmployeeProfile?.employeePhotoUrl || "",
  });
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    if (!isValidProfilePhoto(file)) {
      showToast("Photo rejected", "Choose a JPEG, PNG, or WebP image.");
      setUploadCardError(form, "Choose a PNG, JPG, or WebP image up to 5MB.");
      return;
    }
    updateUploadCardPreview(form, file, "Uploading photo...");
    const localPreviewUrl = URL.createObjectURL(file);
    if (activeEmployeeBadge) {
      activeEmployeeBadge = { ...activeEmployeeBadge, employeePhotoUrl: localPreviewUrl };
      updateEmployeeBadgeCache(activeEmployeeBadge, activeEmployeeProfile);
      renderOwnBadge(activeEmployeeBadge);
      renderDashboardBadge(activeEmployeeBadge);
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
      setUploadCardSuccess(form, photoUrl, "Photo uploaded");
    } catch (error) {
      showToast("Photo update failed", error.message);
      setUploadCardError(form, "Photo update failed. Retry when ready.");
      setText("#credential-photo-status", "Photo update failed. Your credential QR was not changed.");
      await loadCredentialPage(true);
    } finally {
      URL.revokeObjectURL(localPreviewUrl);
    }
  });
}

function initEmployeeProfileForm() {
  const form = document.querySelector("#employee-profile-form");
  if (!form) {
    return;
  }
  if (form.dataset.bound === "true") {
    return;
  }
  form.dataset.bound = "true";
  initPhoneInput(form);
  initProfileUploadCard(form, {
    emptyTitle: "Upload profile photo",
    emptyMeta: "PNG, JPG, or WebP up to 5MB",
    currentPhotoUrl: activeEmployeeProfile?.employeePhotoUrl || "",
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    if (!trim(data.fullName)) {
      showToast("Check profile", "Display name is required.");
      return;
    }
    const phone = phonePayload(data);
    const phoneError = validatePhonePayload(phone, { required: false });
    if (phoneError) {
      showToast("Check phone", phoneError);
      return;
    }

    setFormLoading(form, true);
    try {
      let employeePhotoUrl;
      const photoFile = form.querySelector("input[name='profilePhoto']")?.files?.[0];
      if (photoFile) {
        if (!isValidProfilePhoto(photoFile)) {
          setUploadCardError(form, "Choose a PNG, JPG, or WebP image up to 5MB.");
          throw new Error("Choose a JPEG, PNG, or WebP image.");
        }
        updateUploadCardPreview(form, photoFile, "Uploading photo...");
        const upload = await uploadEmployeeProfilePhoto(photoFile);
        employeePhotoUrl = upload?.data?.url;
        if (!employeePhotoUrl) {
          throw new Error("Photo upload completed without a usable URL.");
        }
      }

      const payload = {
        fullName: trim(data.fullName),
        phoneCountryCode: phone.phone ? phone.phoneCountryCode : null,
        phone: phone.phone,
        designation: trim(data.designation),
        emergencyContact: trim(data.emergencyContact),
        preferredLanguage: trim(data.preferredLanguage),
        preferredTimezone: trim(data.preferredTimezone),
      };
      if (employeePhotoUrl) {
        payload.employeePhotoUrl = employeePhotoUrl;
      }

      const response = await updateEmployeeProfile(payload);
      activeEmployeeProfile = response?.data || null;
      profileLoaded = Boolean(activeEmployeeProfile);
      settingsLoaded = Boolean(activeEmployeeProfile);
      credentialLoaded = false;
      renderSettingsProfile(activeEmployeeProfile);
      await loadCredentialPage(true);
      showToast("Profile saved", "Your employee-owned profile details were updated.");
      if (employeePhotoUrl) {
        setUploadCardSuccess(form, employeePhotoUrl, "Photo uploaded");
      }
    } catch (error) {
      showToast("Profile update failed", error.message);
      if (form.querySelector("input[name='profilePhoto']")?.files?.[0]) {
        setUploadCardError(form, "Photo upload failed. Retry when ready.");
      }
    } finally {
      setFormLoading(form, false);
    }
  });
}

function initProfileUploadCard(form, options = {}) {
  const input = form?.querySelector("input[name='profilePhoto']");
  const card = form?.querySelector("[data-profile-upload-card]");
  if (!input || !card || card.dataset.bound === "true") {
    return;
  }
  card.dataset.bound = "true";
  input.classList.add("profile-upload__input");
  input.setAttribute("aria-label", "Upload profile photo");
  const browse = () => input.click();
  card.addEventListener("click", (event) => {
    if (!event.target.closest("button")) {
      browse();
    }
  });
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      browse();
    }
  });
  card.addEventListener("dragover", (event) => {
    event.preventDefault();
    card.classList.add("is-dragging");
  });
  card.addEventListener("dragleave", () => card.classList.remove("is-dragging"));
  card.addEventListener("drop", (event) => {
    event.preventDefault();
    card.classList.remove("is-dragging");
    const file = event.dataTransfer?.files?.[0];
    if (!file) {
      return;
    }
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  form.querySelector("[data-upload-replace]")?.addEventListener("click", browse);
  form.querySelector("[data-upload-clear]")?.addEventListener("click", () => {
    input.value = "";
    setUploadCardEmpty(form, options.emptyTitle, options.emptyMeta, options.currentPhotoUrl);
  });
  setUploadCardEmpty(form, options.emptyTitle, options.emptyMeta, options.currentPhotoUrl);
}

function updateUploadCardPreview(form, file, status = "Preview ready") {
  const card = form?.querySelector("[data-profile-upload-card]");
  if (!card) {
    return;
  }
  const previousUrl = card.dataset.previewUrl;
  if (previousUrl) {
    URL.revokeObjectURL(previousUrl);
  }
  const previewUrl = URL.createObjectURL(file);
  card.dataset.previewUrl = previewUrl;
  card.classList.add("has-preview");
  card.classList.remove("has-error", "is-success");
  card.querySelector("[data-upload-preview]").innerHTML = `<img src="${escapeHtml(previewUrl)}" alt="Selected profile photo preview" />`;
  setUploadText(form, status, `${file.name} · ${formatFileSize(file.size)}`);
}

function setUploadCardSuccess(form, photoUrl, status = "Photo ready") {
  const card = form?.querySelector("[data-profile-upload-card]");
  if (!card) {
    return;
  }
  card.classList.add("has-preview", "is-success");
  card.classList.remove("has-error");
  if (photoUrl) {
    card.querySelector("[data-upload-preview]").innerHTML = `<img src="${escapeHtml(photoUrl)}" alt="Uploaded profile photo preview" />`;
  }
  setUploadText(form, status, "Upload complete. You can replace or remove it.");
}

function setUploadCardError(form, message) {
  const card = form?.querySelector("[data-profile-upload-card]");
  card?.classList.add("has-error");
  card?.classList.remove("is-success");
  setUploadText(form, "Upload failed", message);
}

function setUploadCardEmpty(form, title = "Upload profile photo", meta = "PNG, JPG, or WebP up to 5MB", currentPhotoUrl = "") {
  const card = form?.querySelector("[data-profile-upload-card]");
  if (!card) {
    return;
  }
  const previousUrl = card.dataset.previewUrl;
  if (previousUrl) {
    URL.revokeObjectURL(previousUrl);
    delete card.dataset.previewUrl;
  }
  card.classList.toggle("has-preview", Boolean(currentPhotoUrl));
  card.classList.remove("has-error", "is-success");
  card.querySelector("[data-upload-preview]").innerHTML = currentPhotoUrl
    ? `<img src="${escapeHtml(currentPhotoUrl)}" alt="Current profile photo" />`
    : `<span aria-hidden="true">⇧</span>`;
  setUploadText(form, title, meta);
}

function setUploadText(form, title, meta) {
  const titleNode = form?.querySelector("[data-upload-title]");
  const metaNode = form?.querySelector("[data-upload-meta]");
  if (titleNode) {
    titleNode.textContent = title;
  }
  if (metaNode) {
    metaNode.textContent = meta;
  }
}

function isValidProfilePhoto(file) {
  return /^image\/(png|jpe?g|webp)$/i.test(file.type) && file.size <= 5 * 1024 * 1024;
}

function formatFileSize(size) {
  return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(size / 1024))}KB`;
}

function initSafeDeleteActions() {
  if (document.body.dataset.employeeSafeDeletesBound === "true") {
    return;
  }
  document.body.dataset.employeeSafeDeletesBound = "true";
  document.addEventListener("click", async (event) => {
    const removePhoto = event.target.closest("[data-profile-remove-photo]");
    const clearPreferences = event.target.closest("[data-clear-preferences]");
    const clearDownloads = event.target.closest("[data-clear-download-cache]");
    const revokeExports = event.target.closest("[data-revoke-badge-exports]");
    if (!removePhoto && !clearPreferences && !clearDownloads && !revokeExports) {
      return;
    }

    try {
      if (removePhoto) {
        await updateEmployeeProfile({ employeePhotoUrl: "" });
        activeEmployeeProfile = { ...(activeEmployeeProfile || {}), employeePhotoUrl: "" };
        if (activeEmployeeBadge) {
          activeEmployeeBadge = { ...activeEmployeeBadge, employeePhotoUrl: "" };
          updateEmployeeBadgeCache(activeEmployeeBadge, activeEmployeeProfile);
        }
        credentialLoaded = false;
        profileLoaded = false;
        settingsLoaded = false;
        await loadEmployeeSettings(true);
        await loadCredentialPage(true);
        showToast("Photo removed", "Your optional profile photo was removed.");
      }
      if (clearPreferences) {
        await updateEmployeeProfile({
          preferredLanguage: "",
          preferredTimezone: "",
          notificationEmailEnabled: true,
          notificationInAppEnabled: true,
        });
        settingsLoaded = false;
        profileLoaded = false;
        await loadEmployeeSettings(true);
        showToast("Preferences deleted", "Optional saved preferences were reset to organization defaults.");
      }
      if (clearDownloads || revokeExports) {
        clearEmployeeDownloadCache();
        showToast(revokeExports ? "Badge exports revoked" : "Download cache cleared", "Local employee-owned export records were removed from this browser.");
      }
    } catch (error) {
      showToast("Remove action failed", error.message);
    }
  });
}

function clearEmployeeDownloadCache() {
  const prefixes = ["accessflow.employee.badge", "accessflow.employee.export", "accessflow.badge.export"];
  [window.localStorage, window.sessionStorage].forEach((storage) => {
    try {
      Object.keys(storage)
        .filter((key) => prefixes.some((prefix) => key.startsWith(prefix)))
        .forEach((key) => storage.removeItem(key));
    } catch {
      // Browser storage may be disabled; export generation remains stateless.
    }
  });
}

function initEmployeeSettingsForm() {
  const form = document.querySelector("#employee-settings-form");
  if (!form) {
    return;
  }
  if (form.dataset.bound === "true") {
    return;
  }
  form.dataset.bound = "true";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    setFormLoading(form, true);
    try {
      const response = await updateEmployeeProfile({
        preferredLanguage: trim(data.preferredLanguage),
        preferredTimezone: trim(data.preferredTimezone),
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
  if (form.dataset.bound === "true") {
    return;
  }
  form.dataset.bound = "true";
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
    renderSettingsProfile(activeEmployeeProfile);
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
  if (!profile) {
    return;
  }
  if (form) {
    setFieldValue(form, "preferredLanguage", profile.preferredLanguage || "");
    setFieldValue(form, "preferredTimezone", profile.preferredTimezone || "");
    const inApp = form.querySelector("input[name='notificationInAppEnabled']");
    const email = form.querySelector("input[name='notificationEmailEnabled']");
    if (inApp) {
      inApp.checked = profile.notificationInAppEnabled !== false;
    }
    if (email) {
      email.checked = profile.notificationEmailEnabled !== false;
    }
  }
  renderProfileForm(profile);
  renderRestrictedProfile(profile);
}

function renderProfileForm(profile) {
  const form = document.querySelector("#employee-profile-form");
  if (!form) {
    return;
  }
  setPhoneInputValues(form, profile);
  setFieldValue(form, "fullName", profile.fullName || "");
  setFieldValue(form, "designation", profile.designation || "");
  setFieldValue(form, "emergencyContact", profile.emergencyContact || "");
  setFieldValue(form, "preferredLanguage", profile.preferredLanguage || "");
  setFieldValue(form, "preferredTimezone", profile.preferredTimezone || "");
}

function renderRestrictedProfile(profile) {
  const card = document.querySelector("#restricted-profile-card");
  if (!card) {
    return;
  }
  card.innerHTML = `
    <div>
      <p class="eyebrow">Account Context</p>
      <h3>Workforce Fields</h3>
    </div>
    <dl>
      ${profileDetail("Full name", profile.fullName)}
      ${profileDetail("Employee ID", profile.employeeId)}
      ${profileDetail("Department", profile.department, "Department pending")}
      ${profileDetail("Designation", profile.designation, "Designation pending")}
      ${profileDetail("Preferred timezone", profile.preferredTimezone || profile.organizationTimezone, "Organization default")}
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

async function loadVisitorHistory(force = false) {
  const list = document.querySelector("#visitor-history-list");
  if (!list) {
    return;
  }
  if (historyState.loading && !force) {
    return;
  }
  historyState.loading = true;
  renderLoadingList("#visitor-history-list", 4);
  try {
    const query = new URLSearchParams({
      page: String(historyState.page),
      size: String(historyState.size),
      sortBy: "createdAt",
      direction: "desc",
    });
    Object.entries(historyState.filters).forEach(([key, value]) => {
      if (value) {
        query.set(key, value);
      }
    });
    const response = await request(`/employee/history?${query.toString()}`);
    const page = response?.data || {};
    historyState.totalPages = page.totalPages || 0;
    renderVisitorHistory(page.items || [], page.totalItems || 0);
  } catch (error) {
    renderWorkList("#visitor-history-list", [], (item) => item, "Visitor history unavailable", error.message);
  } finally {
    historyState.loading = false;
  }
}

function initVisitorHistoryFilters() {
  const form = document.querySelector("#visitor-history-filter");
  if (!form || form.dataset.bound === "true") {
    return;
  }
  form.dataset.bound = "true";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    historyState.page = 0;
    historyState.filters = historyFilters(form);
    await loadVisitorHistory(true);
  });
  form.querySelector("[data-history-clear]")?.addEventListener("click", async () => {
    form.reset();
    historyState.page = 0;
    historyState.filters = {};
    await loadVisitorHistory(true);
  });
  document.querySelector("#visitor-history-pagination")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-history-page]");
    if (!button) {
      return;
    }
    historyState.page = Math.max(0, historyState.page + Number(button.dataset.historyPage || 0));
    await loadVisitorHistory(true);
  });
}

function historyFilters(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  return {
    query: trim(data.query),
    status: trim(data.status),
    department: trim(data.department),
    visitorType: trim(data.visitorType),
    from: dateStartInstant(data.from),
    to: dateEndInstant(data.to),
  };
}

function renderVisitorHistory(items, totalItems) {
  renderWorkList("#visitor-history-list", items, historyCard, "No visitor history", "Hosted visitors will appear here after requests, approvals, or completed visits.");
  const pagination = document.querySelector("#visitor-history-pagination");
  if (!pagination) {
    return;
  }
  const start = totalItems === 0 ? 0 : historyState.page * historyState.size + 1;
  const end = Math.min((historyState.page + 1) * historyState.size, totalItems);
  pagination.innerHTML = `
    <span>${escapeHtml(start)}-${escapeHtml(end)} of ${escapeHtml(totalItems)}</span>
    <div>
      <button class="button button--ghost" type="button" data-history-page="-1" ${historyState.page === 0 ? "disabled" : ""}>Previous</button>
      <button class="button button--ghost" type="button" data-history-page="1" ${historyState.page + 1 >= historyState.totalPages ? "disabled" : ""}>Next</button>
    </div>
  `;
}

function historyCard(visitor) {
  const timeline = (visitor.statusHistory || []).slice(-4).map((entry) => `
    <li>
      <strong>${escapeHtml(formatStatus(entry.status))}</strong>
      <span>${escapeHtml(formatDate(entry.timestamp))}</span>
      ${entry.note ? `<small>${escapeHtml(entry.note)}</small>` : ""}
    </li>
  `).join("");
  return `
    <article class="scheduled-card history-card">
      <div>
        <h3>${escapeHtml(visitor.fullName || "Visitor")}</h3>
        <p>${escapeHtml([visitor.companyName || visitor.vendorCompanyName, visitor.purposeOfVisit].filter(Boolean).join(" · ") || "Hosted visitor")}</p>
      </div>
      <dl>
        <div><dt>Status</dt><dd><span class="status-badge ${escapeHtml(statusBadgeClass(visitor.status))}">${escapeHtml(formatStatus(visitor.status))}</span></dd></div>
        <div><dt>Visitor type</dt><dd>${escapeHtml(formatStatus(visitor.visitorType || "ONE_TIME"))}</dd></div>
        <div><dt>Department</dt><dd>${escapeHtml(visitor.department || visitor.hostEmployeeDepartment || "Not recorded")}</dd></div>
        <div><dt>Approved</dt><dd>${escapeHtml(visitor.approvedAt ? formatDate(visitor.approvedAt) : "Not approved")}</dd></div>
        <div><dt>Check-in</dt><dd>${escapeHtml(formatDate(visitor.checkInTime))}</dd></div>
        <div><dt>Check-out</dt><dd>${escapeHtml(formatDate(visitor.checkOutTime))}</dd></div>
      </dl>
      <ol class="approval-timeline">${timeline || "<li><strong>No status history</strong></li>"}</ol>
    </article>
  `;
}

function dateStartInstant(value) {
  const text = trim(value);
  if (!text) {
    return null;
  }
  const date = new Date(`${text}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dateEndInstant(value) {
  const text = trim(value);
  if (!text) {
    return null;
  }
  const date = new Date(`${text}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function initPreApprovalForm() {
  const form = document.querySelector("#preapproval-form");
  if (!form) {
    return;
  }
  if (form.dataset.bound === "true") {
    return;
  }
  form.dataset.bound = "true";

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
  if (form.dataset.bound === "true") {
    return;
  }
  form.dataset.bound = "true";

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
  if (document.body.dataset.employeeInviteActionsBound === "true") {
    return;
  }
  document.body.dataset.employeeInviteActionsBound = "true";
  document.addEventListener("click", async (event) => {
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
        const reason = await promptAction({
          title: "Revoke visitor invite",
          message: "Record why this invite should be closed before the visitor arrives.",
          label: "Revocation reason",
          placeholder: "Schedule cancelled, wrong recipient, or policy reason",
          confirmLabel: "Revoke invite",
          tone: "danger",
          minLength: 4,
          multiline: true,
        });
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
  if (approvalsLoading) {
    approvalsQueued = true;
    return;
  }
  const list = document.querySelector("#approvals-list");
  if (!list) {
    return;
  }

  approvalsLoading = true;
  approvalsQueued = false;
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
  } finally {
    approvalsLoading = false;
    if (approvalsQueued) {
      void loadApprovals(false);
    }
  }
}

function initApprovalActions() {
  if (document.body.dataset.employeeApprovalActionsBound === "true") {
    return;
  }
  document.body.dataset.employeeApprovalActionsBound = "true";
  document.addEventListener("click", async (event) => {
    if (event.target.closest("[data-refresh-approvals]")) {
      await loadApprovals(true);
      return;
    }
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
  if (document.body.dataset.employeeScheduledActionsBound === "true") {
    return;
  }
  document.body.dataset.employeeScheduledActionsBound = "true";
  document.addEventListener("click", async (event) => {
    if (!event.target.closest("#scheduled-list")) {
      return;
    }
    const decisionButton = event.target.closest("[data-approval-action]");
    if (decisionButton) {
      try {
        if (decisionButton.dataset.approvalAction === "approve-reschedule") {
          await approveRescheduleRequest("/employee", decisionButton.dataset.visitorId, "");
          showToast("Reschedule approved", "The badge was regenerated for the new timing.");
        }
        if (decisionButton.dataset.approvalAction === "reject-reschedule") {
          const note = await promptAction({
            title: "Deny timing change",
            message: "Add a short note for the visitor and audit trail.",
            label: "Decision note",
            placeholder: "Timing change declined by host employee.",
            confirmLabel: "Deny timing",
            minLength: 0,
            required: false,
            multiline: true,
          }) || "Timing change declined by host employee.";
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
    const dateTime = await promptAction({
      title: "Modify visitor timing",
      message: "Enter the new visit date and arrival time in local workspace time.",
      label: "New arrival time",
      placeholder: "YYYY-MM-DD HH:mm",
      confirmLabel: "Update timing",
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
