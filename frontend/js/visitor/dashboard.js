import { request } from "../shared/httpClient.js";
import { initAppErrorBoundary, runSafely } from "../shared/appErrorBoundary.js";
import { bootstrapApplication } from "../shared/appRuntime.js";
import { formatDate, formatDurationMinutes, getDefaultTimezone, minutesBetween, timezoneLabel, toIsoInstant } from "../shared/formatters.js";
import { requireRole } from "../shared/roleGuard.js";
import { initPortalShell, renderLoadingList, renderMetrics, renderWorkList, updatePortalIdentitySummary, workCard, escapeHtml } from "../shared/portalShell.js";
import { initOrganizationSelectors } from "../shared/organizationSelector.js";
import { cancelVisitorVisit, getAccountProfile, getVisitorPass, getVisitorHistory, listVisitorInvites, requestVisitReschedule, updateAccountPassword, updateAccountProfile, uploadAccountProfilePhoto, uploadVisitPhoto } from "../shared/accessService.js";
import { canonicalVisitorInviteStage, enterpriseStatusLabel, statusBadgeClass, visitorInviteStatusLabel } from "../shared/workflowEnums.js";
import { initHostPicker } from "../shared/hostPicker.js";
import { badgeDialogMarkup, badgeMarkup, downloadBadge, hydrateBadgePreview, printBadge } from "../shared/badgeStudio.js";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "../shared/notificationApi.js";
import { showToast } from "../shared/toast.js";
import { initPhoneInput, phonePayload, setPhoneInputValues, validatePhonePayload } from "../shared/phoneInput.js";
import { LOGIN_FROM_PORTAL } from "../shared/config.js";
import { setText } from "../shared/dom.js";
import { clearSession } from "../shared/session.js";
import { promptAction } from "../shared/actionModal.js";

const ROUTES = ["dashboard", "badge", "requests", "history", "profile", "notifications", "settings", "pre-registration"];
const ROUTE_DEFINITIONS = {
  dashboard: {
    href: "/visitor/dashboard",
    title: "Visitor Dashboard",
    eyebrow: "Visitor Workspace",
    loader: () => import("./routes/dashboardPage.js"),
  },
  badge: {
    href: "/visitor/badge",
    title: "Badge",
    eyebrow: "Identity Center",
    loader: () => import("./routes/badgePage.js"),
  },
  requests: {
    href: "/visitor/requests",
    title: "Requests",
    eyebrow: "Visit Workflow",
    loader: () => import("./routes/requestsPage.js"),
  },
  history: {
    href: "/visitor/history",
    title: "Visit History",
    eyebrow: "Visitor Timeline",
    loader: () => import("./routes/historyPage.js"),
  },
  profile: {
    href: "/visitor/profile",
    title: "Profile",
    eyebrow: "Profile Management",
    loader: () => import("./routes/profilePage.js"),
  },
  notifications: {
    href: "/visitor/notifications",
    title: "Notifications",
    eyebrow: "Visitor Inbox",
    loader: () => import("./routes/notificationsPage.js"),
  },
  settings: {
    href: "/visitor/settings",
    title: "Settings",
    eyebrow: "Account Preferences",
    loader: () => import("./routes/settingsPage.js"),
  },
  "pre-registration": {
    href: "/visitor/pre-registration",
    title: "Pre-registration",
    eyebrow: "Visit Planning",
    loader: () => import("./routes/preRegistrationPage.js"),
  },
};
const ROUTE_ALIASES = {
  "": "dashboard",
  visitor: "dashboard",
  visits: "requests",
  visit: "requests",
  invites: "requests",
  invite: "requests",
  request: "pre-registration",
  pass: "badge",
  dashboard: "dashboard",
  badge: "badge",
  requests: "requests",
  history: "history",
  profile: "profile",
  notifications: "notifications",
  settings: "settings",
  "pre-registration": "pre-registration",
  preregistration: "pre-registration",
};
const VISITOR_PORTAL_PROFILE = {
  identityScope: "Visitor",
  contextLabel: () => "Visitor account",
  menuItems: (_session, summary = {}) => [
    { label: "Pass status", value: summary.passStatus || "Not available" },
    ...(summary.nextVisit ? [{ label: "Next visit", value: summary.nextVisit }] : []),
    { label: "Timezone", value: summary.timezone || timezoneLabel(getDefaultTimezone()) },
  ],
};

let activeBadge = null;
let visitorRouteLoading = false;
let visitorRouteQueued = false;
let visitorRouteQueuedRoute = "";
let visitorRouteRenderId = 0;
let visitorRouteRevision = 0;
let visitorProfileLoaded = false;
let activeVisitorProfile = null;
let cachedVisits = [];
let cachedHistory = null;
let cachedNotifications = null;
let requestFilter = "all";
let historyFilters = {};
let activeSession = null;

document.addEventListener("DOMContentLoaded", () => {
  void bootstrapApplication("visitor-portal", () => bootVisitorPortal(), {
    redirectToLogin: true,
    failureMessage: "Opening visitor workspace...",
  });
});

async function bootVisitorPortal() {
  initAppErrorBoundary();
  migrateLegacyVisitorRoute();

  const session = requireRole("VISITOR");
  if (!session) {
    return;
  }
  activeSession = session;
  const initialRoute = currentVisitorRoute();

  initPortalShell(session, {
    allowedRoutes: ROUTES,
    routeMap: ROUTE_DEFINITIONS,
    activeRoute: initialRoute,
    defaultHref: ROUTE_DEFINITIONS.dashboard.href,
    portalProfile: VISITOR_PORTAL_PROFILE,
    identitySummary: buildVisitorIdentitySummary([]),
    onRefresh: async () => loadRouteData({ force: true }),
  });
  bindVisitorWorkspaceNavigation();
  initVisitActions();
  initBadgeModalActions();
  await renderVisitorRoute(initialRoute, { replace: true });
}

function migrateLegacyVisitorRoute() {
  const hashRoute = routeFromHash(window.location.hash);
  if (hashRoute) {
    window.history.replaceState({}, "", ROUTE_DEFINITIONS[hashRoute].href);
    return;
  }
  const route = currentVisitorRoute();
  const definition = ROUTE_DEFINITIONS[route] || ROUTE_DEFINITIONS.dashboard;
  const legacyPath = window.location.pathname.includes("/pages/visitor");
  if (legacyPath || window.location.pathname === "/visitor") {
    window.history.replaceState({}, "", definition.href);
  }
}

function routeFromHash(hash) {
  const value = String(hash || "").replace("#", "").trim().toLowerCase();
  return value ? ROUTE_ALIASES[value] || "" : "";
}

function currentVisitorRoute() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const rawRoute = segments[0] === "visitor" ? segments[1] || "dashboard" : "dashboard";
  return ROUTE_ALIASES[rawRoute] || (ROUTES.includes(rawRoute) ? rawRoute : "dashboard");
}

async function renderVisitorRoute(route = currentVisitorRoute(), options = {}) {
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

  const renderId = ++visitorRouteRenderId;

  if (!options.replace && window.location.pathname !== definition.href) {
    window.history.pushState({}, "", definition.href);
  } else if (options.replace && window.location.pathname !== definition.href) {
    window.history.replaceState({}, "", definition.href);
  }

  setActiveRoute(resolvedRoute);
  setPageTitle(definition);
  host.classList.add("is-transitioning");
  host.innerHTML = `
    <section class="panel route-loading-state">
      <div class="visitor-route-skeleton">
        <strong>Loading ${escapeHtml(definition.title)}</strong>
        <p>Preparing this visitor workspace.</p>
        <span></span><span></span><span></span>
      </div>
    </section>
  `;

  try {
    const pageModule = await definition.loader();
    if (renderId !== visitorRouteRenderId) {
      return;
    }
    host.innerHTML = pageModule.render();
    host.dataset.activeRoute = resolvedRoute;
    await initializeRenderedRoute(resolvedRoute, renderId);
    if (renderId !== visitorRouteRenderId) {
      return;
    }
    host.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    if (renderId !== visitorRouteRenderId) {
      return;
    }
    host.innerHTML = `
      <section class="visitor-route panel">
        <div class="empty-state empty-state--inline">
          <h3>Workspace unavailable</h3>
          <p>${escapeHtml(error?.message || "This visitor workspace could not be loaded.")}</p>
        </div>
      </section>
    `;
    showToast("Workspace unavailable", error?.message || "Route module could not be loaded.");
  } finally {
    if (renderId === visitorRouteRenderId) {
      requestAnimationFrame(() => host.classList.remove("is-transitioning"));
    }
  }
}

async function initializeRenderedRoute(route, renderId) {
  if (route === "requests" || route === "pre-registration") {
    await runSafely("visitor organizations", () => initOrganizations(), { toastTitle: "Organizations unavailable" });
    if (renderId !== visitorRouteRenderId) {
      return;
    }
    await runSafely("visitor host picker", () => initHostPickers(), { toastTitle: "Host search unavailable" });
    if (renderId !== visitorRouteRenderId) {
      return;
    }
    initRequestForms();
    initScheduleHints();
    initRequestFilters();
  }
  if (route === "history") {
    initVisitorHistoryFilters();
  }
  if (route === "badge") {
    initBadgePageActions();
  }
  if (route === "profile") {
    initVisitorProfileForm();
  }
  if (route === "settings") {
    initVisitorSettingsForm();
    initVisitorPasswordForm();
    initSafePreferenceActions();
  }
  if (route === "notifications") {
    initNotificationActions();
  }
  if (renderId === visitorRouteRenderId) {
    await loadRouteData({ force: true, route });
  }
}

function bindVisitorWorkspaceNavigation() {
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link || link.target || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const url = new URL(link.href, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/visitor")) {
      return;
    }
    event.preventDefault();
    const nextRoute = ROUTE_ALIASES[url.pathname.split("/").filter(Boolean)[1] || "dashboard"] || "dashboard";
    void renderVisitorRoute(nextRoute);
  });

  window.addEventListener("popstate", () => {
    void renderVisitorRoute(currentVisitorRoute(), { replace: true });
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
  setText(".topbar__title .eyebrow", definition.eyebrow || "Visitor Workspace");
  setText(".topbar__title h1", definition.title || "Visitor Dashboard");
  document.title = `AccessFlow | ${definition.title || "Visitor Portal"}`;
}

async function loadRouteData(options = {}) {
  if (visitorRouteLoading) {
    visitorRouteQueued = true;
    visitorRouteQueuedRoute = options.route || currentVisitorRoute();
    return;
  }
  const route = options.route || currentVisitorRoute();
  const revision = ++visitorRouteRevision;
  visitorRouteLoading = true;
  visitorRouteQueued = false;
  visitorRouteQueuedRoute = "";

  try {
    if (route === "dashboard") {
      await loadDashboardRoute(revision);
    } else if (route === "badge") {
      await loadBadgeRoute(revision);
    } else if (route === "requests") {
      await loadRequestsRoute(revision);
    } else if (route === "history") {
      await loadHistoryRoute(revision);
    } else if (route === "profile") {
      await loadVisitorProfile(options.force);
    } else if (route === "settings") {
      await loadVisitorProfile(options.force);
    } else if (route === "notifications") {
      await loadNotificationsRoute(revision);
    }
  } finally {
    visitorRouteLoading = false;
    if (visitorRouteQueued) {
      const queuedRoute = visitorRouteQueuedRoute || currentVisitorRoute();
      visitorRouteQueued = false;
      visitorRouteQueuedRoute = "";
      void loadRouteData({ force: true, route: queuedRoute });
    }
  }
}

async function loadDashboardRoute(revision) {
  renderMetrics([]);
  renderLoadingList("#dashboard-upcoming-list", 2);
  renderLoadingList("#dashboard-notifications-list", 2);
  renderLoadingList("#recent-activity-list", 2);

  const [overview, visits, notifications, history] = await Promise.allSettled([
    request("/visitor/overview"),
    request("/visitor/visits"),
    getNotifications(5),
    getVisitorHistory("/visitor"),
  ]);
  if (revision !== visitorRouteRevision) {
    return;
  }

  if (overview.status === "fulfilled") {
    const overviewData = overview.value?.data || {};
    renderMetrics([
      { label: "Pending", value: overviewData.pending || 0, note: "Awaiting host approval" },
      { label: "Active QR", value: overviewData.activePasses || 0, note: "Approved or checked in" },
      { label: "Requests", value: overviewData.totalRequests || 0, note: "Saved in your access record" },
    ]);
    setOrganizationContext(overviewData);
  }

  cachedVisits = visits.status === "fulfilled" ? visits.value?.data || [] : [];
  updatePortalIdentitySummary(buildVisitorIdentitySummary(cachedVisits));
  cachedNotifications = notifications.status === "fulfilled" ? notifications.value?.data || { items: [] } : { items: [] };
  cachedHistory = history.status === "fulfilled" ? history.value?.data || null : null;
  renderDashboardBadge(cachedVisits);
  renderUpcomingVisits(cachedVisits);
  renderNotificationList("#dashboard-notifications-list", cachedNotifications.items || [], 3);
  renderRecentActivity(cachedHistory, cachedNotifications.items || []);
}

async function loadBadgeRoute(revision) {
  renderLoadingList("#visitor-badge-visits-list", 2);
  const visitsResponse = await request("/visitor/visits");
  if (revision !== visitorRouteRevision) {
    return;
  }
  cachedVisits = visitsResponse?.data || [];
  updatePortalIdentitySummary(buildVisitorIdentitySummary(cachedVisits));
  const selectedVisit = selectBadgeVisit(cachedVisits);
  renderBadgeVisitList(cachedVisits, selectedVisit?.id);
  if (!selectedVisit) {
    renderBadgePage(null, "No approved badge is ready yet.");
    return;
  }
  try {
    const pass = (await getVisitorPass("/visitor", selectedVisit.id))?.data || null;
    activeBadge = pass;
    renderBadgePage(pass);
  } catch (error) {
    activeBadge = null;
    renderBadgePage(null, error.message);
  }
}

async function loadRequestsRoute(revision) {
  renderLoadingList("#visitor-invite-list", 2);
  const [visits, invites] = await Promise.allSettled([
    request("/visitor/visits"),
    listVisitorInvites(),
  ]);
  if (revision !== visitorRouteRevision) {
    return;
  }
  cachedVisits = visits.status === "fulfilled" ? visits.value?.data || [] : [];
  updatePortalIdentitySummary(buildVisitorIdentitySummary(cachedVisits));
  renderRequestGroups(cachedVisits);
  if (visits.status === "rejected") {
    showToast("Visits unavailable", visits.reason?.message || "Visit requests could not be loaded.");
  }
  if (invites.status === "fulfilled") {
    renderInvites(invites.value?.data || []);
  } else {
    renderWorkList("#visitor-invite-list", [], (item) => item, "Invites unavailable", invites.reason?.message || "Invite inbox could not be loaded.");
  }
}

async function loadHistoryRoute(revision) {
  const response = await getVisitorHistory("/visitor");
  if (revision !== visitorRouteRevision) {
    return;
  }
  cachedHistory = response?.data || null;
  renderHistory(cachedHistory);
}

async function loadNotificationsRoute(revision) {
  const response = await getNotifications(30);
  if (revision !== visitorRouteRevision) {
    return;
  }
  cachedNotifications = response?.data || { items: [] };
  renderNotificationList("#visitor-notifications-list", cachedNotifications.items || [], 30, true);
}

function initRequestForms() {
  document.querySelectorAll("#visitor-request-form, #visitor-pre-registration-form").forEach((form) => {
    if (form.dataset.bound === "true") {
      return;
    }
    form.dataset.bound = "true";
    initPhoneInput(form);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      await submitVisitRequest(form);
    });
  });
}

async function submitVisitRequest(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  const phone = phonePayload(data);
  const photoFile = form.querySelector("[name='photoFile']")?.files?.[0] || null;
  const scheduledStartTime = form.id === "visitor-pre-registration-form"
    ? toIsoInstant(`${data.visitDate || ""}T${data.arrivalTime || ""}`, getDefaultTimezone())
    : toIsoInstant(data.scheduledStartTime, getDefaultTimezone());
  const payload = {
    phoneCountryCode: phone.phoneCountryCode,
    phone: phone.phone,
    companyCode: trim(data.companyCode),
    hostEmployee: trim(data.hostEmployee),
    hostEmployeeId: trim(data.hostEmployeeId),
    purposeOfVisit: trim(data.purposeOfVisit),
    scheduledStartTime,
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
    persistOptionalVisitPreferences(payload);
    if (form.id === "visitor-pre-registration-form") {
      renderPreRegistrationSuccess(payload);
    } else {
      showToast("Request submitted", "Your host will review the visit request.");
      await loadRouteData({ force: true });
    }
  } catch (error) {
    showToast("Request failed", error.message);
  } finally {
    setFormLoading(form, false);
  }
}

function initVisitActions() {
  if (document.body.dataset.visitorVisitActionsBound === "true") {
    return;
  }
  document.body.dataset.visitorVisitActionsBound = "true";
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-visit-action]");
    if (!button) {
      return;
    }
    const visitorId = button.dataset.visitorId;
    if (button.dataset.visitAction === "reschedule") {
      await handleRescheduleRequest(visitorId);
      return;
    }
    if (button.dataset.visitAction === "cancel") {
      await handleCancelRequest(visitorId);
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
  });
}

function initBadgeModalActions() {
  const modal = document.querySelector("#visitor-badge-modal");
  modal?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-badge-action]");
    if (!button || !activeBadge) {
      if (event.target === modal) {
        closeBadgeModal();
      }
      return;
    }
    await runBadgeAction(button.dataset.badgeAction);
  });
}

function initBadgePageActions() {
  const panel = document.querySelector(".visitor-badge-page");
  if (!panel || panel.dataset.badgeActionsBound === "true") {
    return;
  }
  panel.dataset.badgeActionsBound = "true";
  panel.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-badge-page-action]");
    if (!button) {
      return;
    }
    await runBadgeAction(button.dataset.badgePageAction);
  });
}

async function runBadgeAction(action) {
  if (!activeBadge) {
    showToast("Badge unavailable", "No approved badge is ready to export.");
    return;
  }
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

function renderDashboardBadge(items) {
  const panel = document.querySelector("#dashboard-badge-status");
  if (!panel) {
    return;
  }
  const visit = selectBadgeVisit(items);
  if (!visit) {
    panel.innerHTML = `
      <article class="empty-state empty-state--inline">
        <h3>No active QR badge</h3>
        <p>Approved visitor passes appear here and on the Badge page.</p>
      </article>
    `;
    return;
  }
  panel.innerHTML = `
    <article class="visitor-status-card">
      <span class="status-badge ${escapeHtml(statusBadgeClass(visit.status))}">${escapeHtml(enterpriseStatusLabel(visit.status, "visitor"))}</span>
      <h3>${escapeHtml(visit.organizationName || visit.organizationCode || "Host organization")}</h3>
      <p>${escapeHtml(visit.hostEmployee || "Host pending")} · ${escapeHtml(formatWindow(visit.accessWindowStartTime, visit.accessWindowEndTime, visit.organizationTimezone))}</p>
      <div class="visitor-status-card__actions">
        <button class="button button--primary" type="button" data-visit-action="badge" data-visitor-id="${escapeHtml(visit.id)}">Open QR badge</button>
      </div>
    </article>
  `;
}

function renderUpcomingVisits(items) {
  const now = Date.now();
  const upcoming = items
    .filter((visit) => !["CHECKED_OUT", "REJECTED", "EXPIRED", "SUSPENDED"].includes(visit.status) || new Date(visit.scheduledStartTime || visit.createdAt).getTime() >= now)
    .slice(0, 4);
  renderWorkList("#dashboard-upcoming-list", upcoming, (visit) => workCard(
    visit.purposeOfVisit || "Visit request",
    [visit.organizationName, visit.hostEmployee].filter(Boolean).join(" · ") || "Approval routing",
    `${enterpriseStatusLabel(visit.status, "visitor")} · ${formatDate(visit.scheduledStartTime || visit.createdAt)}`
  ), "No upcoming visits", "Create a request when you plan to visit a workplace.");
}

function renderRecentActivity(history, notifications) {
  const records = (history?.records || []).slice(0, 4).map((record) => ({
    title: enterpriseStatusLabel(record.status, "visitor"),
    detail: record.purposeOfVisit || record.organizationName || "Visit activity",
    at: record.updatedAt || record.createdAt,
  }));
  const notices = notifications.slice(0, 3).map((item) => ({
    title: item.title,
    detail: item.message,
    at: item.createdAt,
  }));
  const activity = [...records, ...notices]
    .sort((left, right) => new Date(right.at || 0) - new Date(left.at || 0))
    .slice(0, 4);
  renderWorkList("#recent-activity-list", activity, (item) => workCard(item.title, item.detail, formatDate(item.at)), "No recent activity", "Approvals, badge changes, and notices will appear here.");
}

function renderBadgePage(pass, error = "") {
  const panel = document.querySelector("#visitor-badge-panel");
  const details = document.querySelector("#visitor-badge-details");
  if (!panel || !details) {
    return;
  }
  if (!pass) {
    panel.innerHTML = `
      <article class="empty-state empty-state--inline">
        <h3>Badge unavailable</h3>
        <p>${escapeHtml(error || "Your approved QR badge will appear here after approval.")}</p>
      </article>
    `;
    details.innerHTML = badgeHelpMarkup();
    return;
  }
  panel.innerHTML = `<div class="enterprise-badge-sheet enterprise-badge-sheet--page">${badgeMarkup(pass)}</div>`;
  details.innerHTML = `
    ${detailPanel("Validity window", formatWindow(pass.accessWindowStartTime, pass.accessWindowEndTime, pass.organizationTimezone))}
    ${detailPanel("Organization", pass.organizationName || pass.organizationCode || "Pending")}
    ${detailPanel("Host information", [pass.hostEmployee, pass.hostEmployeeDepartment].filter(Boolean).join(" · ") || "Pending")}
    ${detailPanel("Arrival instructions", "Present this badge at reception. Security will verify your photo and current approval record before check-in.")}
    ${detailPanel("Badge export", "Use print, PNG, or PDF export for a stable mobile and print-ready preview.")}
  `;
}

function badgeHelpMarkup() {
  return `
    ${detailPanel("Approval required", "Pending, denied, expired, or suspended visits do not expose QR access.")}
    ${detailPanel("Security flow", "Security validates your photo and QR against the current approval record at arrival.")}
  `;
}

function detailPanel(label, value) {
  return `
    <article class="visitor-detail-panel">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `;
}

function renderBadgeVisitList(items, selectedId) {
  renderWorkList("#visitor-badge-visits-list", items, (visit) => `
    <article class="work-card ${visit.id === selectedId ? "is-selected" : ""}">
      <h3>${escapeHtml(visit.purposeOfVisit || "Visit request")}</h3>
      <p>${escapeHtml([visit.organizationName, visit.hostEmployee].filter(Boolean).join(" · ") || "Approval routing")}</p>
      <small>${escapeHtml(enterpriseStatusLabel(visit.status, "visitor"))} · ${escapeHtml(formatDate(visit.scheduledStartTime || visit.createdAt))}</small>
      ${["APPROVED", "CHECKED_IN"].includes(visit.status) && (visit.qrCode || visit.qrIssuedAt) ? `<button class="button button--ghost" type="button" data-visit-action="badge" data-visitor-id="${escapeHtml(visit.id)}">Open badge</button>` : ""}
    </article>
  `, "No visit requests", "Approved badge candidates will appear here.");
}

function renderRequestGroups(items) {
  const host = document.querySelector("#visitor-request-groups");
  if (!host) {
    return;
  }
  const filtered = requestFilter === "all" ? items : items.filter((visit) => visit.status === requestFilter);
  const groups = [
    ["Upcoming requests", filtered.filter((visit) => ["PENDING", "APPROVED", "CHECKED_IN"].includes(visit.status))],
    ["Pending approvals", filtered.filter((visit) => visit.status === "PENDING")],
    ["Denied requests", filtered.filter((visit) => visit.status === "REJECTED")],
    ["Completed visits", filtered.filter((visit) => ["CHECKED_OUT", "EXPIRED"].includes(visit.status))],
  ];
  host.innerHTML = groups.map(([title, records]) => `
    <section class="visitor-request-group">
      <div class="visitor-request-group__header">
        <h3>${escapeHtml(title)}</h3>
        <span>${escapeHtml(records.length)}</span>
      </div>
      <div class="work-list">
        ${records.length ? records.map(visitCard).join("") : `
          <article class="empty-state empty-state--inline">
            <h3>No records</h3>
            <p>This queue is clear.</p>
          </article>
        `}
      </div>
    </section>
  `).join("");
}

function visitCard(visit) {
  const status = enterpriseStatusLabel(visit.status, "visitor");
  const passReady = ["APPROVED", "CHECKED_IN"].includes(visit.status) && (visit.qrCode || visit.qrIssuedAt);
  const duration = visit.checkInTime ? formatDurationMinutes(minutesBetween(visit.checkInTime, visit.checkOutTime || new Date())) : "Pending";
  const passMessage = visit.rejectionReason
    || visit.revocationReason
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
        <div><dt>Arrival</dt><dd>${escapeHtml(formatDate(visit.scheduledStartTime))}</dd></div>
        <div><dt>Access window</dt><dd>${escapeHtml(formatWindow(visit.accessWindowStartTime, visit.accessWindowEndTime, visit.organizationTimezone))}</dd></div>
        <div><dt>Badge ID</dt><dd>${escapeHtml(visit.badgeId || "Issued after approval")}</dd></div>
        <div><dt>Visit duration</dt><dd>${escapeHtml(duration)}</dd></div>
      </dl>
      ${requestTimeline(visit)}
      <div class="visitor-visit-card__footer">
        <span>${escapeHtml(passMessage)}</span>
        ${visit.status === "PENDING" ? `<button class="button button--ghost" type="button" data-visit-action="cancel" data-visitor-id="${escapeHtml(visit.id)}">Cancel request</button>` : ""}
        ${["PENDING", "APPROVED"].includes(visit.status) ? `<button class="button button--ghost" type="button" data-visit-action="reschedule" data-visitor-id="${escapeHtml(visit.id)}">Request reschedule</button>` : ""}
        ${passReady ? `<button class="button button--primary" type="button" data-visit-action="badge" data-visitor-id="${escapeHtml(visit.id)}">Open badge</button>` : ""}
      </div>
    </article>
  `;
}

function requestTimeline(visit) {
  const history = (visit.statusHistory || []).slice(-4);
  if (!history.length) {
    return "";
  }
  return `
    <ol class="visitor-request-timeline">
      ${history.map((entry) => `
        <li>
          <strong>${escapeHtml(enterpriseStatusLabel(entry.status, "visitor"))}</strong>
          <span>${escapeHtml(formatDate(entry.timestamp))}</span>
        </li>
      `).join("")}
    </ol>
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

function renderHistory(history) {
  const summary = document.querySelector("#visitor-history-summary");
  const timeline = document.querySelector("#visitor-history-timeline");
  if (!summary || !timeline || !history) {
    if (summary) {
      summary.innerHTML = "";
    }
    if (timeline) {
      timeline.innerHTML = emptyHistoryMarkup();
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
      <span>Denied / expired</span>
      <strong>${escapeHtml((history.rejectedVisits || 0) + (history.expiredVisits || 0))}</strong>
      <small>Recorded in audit history</small>
    </article>
  `;

  const records = filterHistoryRecords(history.records || []);
  timeline.innerHTML = records.length ? records.map(historyCard).join("") : emptyHistoryMarkup();
}

function emptyHistoryMarkup() {
  return `
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
      <dl class="visitor-history-card__meta">
        <div><dt>Check-in</dt><dd>${escapeHtml(formatDate(record.checkInTime))}</dd></div>
        <div><dt>Check-out</dt><dd>${escapeHtml(formatDate(record.checkOutTime))}</dd></div>
        <div><dt>Window</dt><dd>${escapeHtml(formatWindow(record.accessWindowStartTime, record.accessWindowEndTime, record.organizationTimezone))}</dd></div>
      </dl>
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

function initVisitorHistoryFilters() {
  const form = document.querySelector("#visitor-history-filters");
  if (!form || form.dataset.bound === "true") {
    return;
  }
  form.dataset.bound = "true";
  form.addEventListener("input", () => {
    historyFilters = Object.fromEntries(new FormData(form).entries());
    renderHistory(cachedHistory);
  });
  form.addEventListener("reset", () => {
    window.setTimeout(() => {
      historyFilters = {};
      renderHistory(cachedHistory);
    }, 0);
  });
}

function filterHistoryRecords(records) {
  const date = trim(historyFilters.date);
  const organization = String(historyFilters.organization || "").trim().toLowerCase();
  const status = trim(historyFilters.status);
  return records.filter((record) => {
    const recordDate = String(record.scheduledStartTime || record.createdAt || "").slice(0, 10);
    const recordOrganization = String(record.organizationName || record.organizationCode || "").toLowerCase();
    return (!date || recordDate === date)
      && (!organization || recordOrganization.includes(organization))
      && (!status || record.status === status);
  });
}

async function loadVisitorProfile(force = false) {
  if (visitorProfileLoaded && !force) {
    renderVisitorProfile(activeVisitorProfile);
    return;
  }
  try {
    const response = await getAccountProfile();
    activeVisitorProfile = response?.data || null;
    visitorProfileLoaded = Boolean(activeVisitorProfile);
    renderVisitorProfile(activeVisitorProfile);
  } catch (error) {
    showToast("Settings unavailable", error.message);
  }
}

function renderVisitorProfile(profile) {
  if (!profile) {
    return;
  }
  const profileForm = document.querySelector("#visitor-profile-form");
  const settingsForm = document.querySelector("#visitor-settings-form");
  if (profileForm) {
    initPhoneInput(profileForm);
    setFieldValue(profileForm, "fullName", profile.fullName || "");
    setFieldValue(profileForm, "username", profile.username || "");
    setPhoneFields(profileForm, profile);
    setFieldValue(profileForm, "emergencyContact", profile.emergencyContact || "");
    setFieldValue(profileForm, "preferredLanguage", profile.preferredLanguage || "");
    renderVisitorProfileCard(profile);
  }
  if (settingsForm) {
    const inApp = settingsForm.querySelector("input[name='notificationInAppEnabled']");
    const email = settingsForm.querySelector("input[name='notificationEmailEnabled']");
    if (inApp) {
      inApp.checked = profile.notificationInAppEnabled !== false;
    }
    if (email) {
      email.checked = profile.notificationEmailEnabled !== false;
    }
  }
}

function renderVisitorProfileCard(profile) {
  const panel = document.querySelector("#visitor-profile-card");
  if (!panel) {
    return;
  }
  panel.innerHTML = `
    <div class="visitor-profile-card__photo">
      ${profile.employeePhotoUrl ? `<img src="${escapeHtml(profile.employeePhotoUrl)}" alt="${escapeHtml(profile.fullName || "Visitor")} profile photo" />` : `<span>${escapeHtml(initials(profile.fullName || profile.username || "Visitor"))}</span>`}
    </div>
    ${detailPanel("Account", profile.email || profile.username || "Signed in")}
    ${detailPanel("Organization", profile.organizationName || profile.organizationCode || "Visitor account")}
    ${detailPanel("Language", profile.preferredLanguage || "Organization default")}
    ${detailPanel("Audit history", "Approved visit history cannot be deleted from the visitor portal.")}
  `;
}

function initVisitorProfileForm() {
  const form = document.querySelector("#visitor-profile-form");
  if (!form || form.dataset.bound === "true") {
    return;
  }
  form.dataset.bound = "true";
  initPhoneInput(form);
  initProfileUploadCard(form, {
    emptyTitle: "Upload profile photo",
    emptyMeta: "PNG, JPG, or WebP up to 5MB",
    currentPhotoUrl: activeVisitorProfile?.employeePhotoUrl || "",
  });
  form.querySelector("input[name='profilePhoto']")?.addEventListener("change", async () => {
    await handleProfilePhotoUpload(form);
  });
  form.querySelector("[data-profile-remove-photo]")?.addEventListener("click", async () => {
    await handleProfilePhotoRemove();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const phone = phonePayload(data);
    const phoneError = validatePhonePayload(phone, { required: false });
    if (phoneError) {
      showToast("Check phone", phoneError);
      return;
    }
    if (!String(data.fullName || "").trim()) {
      showToast("Check name", "Enter your display name.");
      return;
    }
    if (!/^[a-z0-9_]{3,32}$/.test(String(data.username || "").trim().toLowerCase())) {
      showToast("Check username", "Use 3-32 lowercase letters, numbers, or underscores.");
      return;
    }
    setFormLoading(form, true);
    try {
      const response = await updateAccountProfile({
        fullName: String(data.fullName || "").trim(),
        username: String(data.username || "").trim().toLowerCase(),
        phoneCountryCode: phone.phoneCountryCode,
        phone: phone.phone,
        emergencyContact: trim(data.emergencyContact),
        preferredLanguage: trim(data.preferredLanguage),
      });
      activeVisitorProfile = response?.data || null;
      renderVisitorProfile(activeVisitorProfile);
      showToast("Profile saved", "Your visitor profile was updated.");
    } catch (error) {
      showToast("Profile update failed", error.message);
    } finally {
      setFormLoading(form, false);
    }
  });
}

function initVisitorSettingsForm() {
  const form = document.querySelector("#visitor-settings-form");
  if (!form || form.dataset.bound === "true") {
    return;
  }
  form.dataset.bound = "true";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    setFormLoading(form, true);
    try {
      const response = await updateAccountProfile({
        notificationInAppEnabled: Boolean(data.notificationInAppEnabled),
        notificationEmailEnabled: Boolean(data.notificationEmailEnabled),
      });
      activeVisitorProfile = response?.data || activeVisitorProfile;
      showToast("Settings saved", "Your visitor notification preferences were updated.");
    } catch (error) {
      showToast("Settings update failed", error.message);
    } finally {
      setFormLoading(form, false);
    }
  });
}

function initVisitorPasswordForm() {
  const form = document.querySelector("#visitor-password-form");
  if (!form || form.dataset.bound === "true") {
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

function initSafePreferenceActions() {
  const button = document.querySelector("[data-clear-saved-preferences]");
  if (!button || button.dataset.bound === "true") {
    return;
  }
  button.dataset.bound = "true";
  button.addEventListener("click", () => {
    try {
      window.localStorage?.removeItem("accessflow.visitor.optionalPreferences");
      showToast("Preferences cleared", "Optional saved visitor preferences were removed from this browser.");
    } catch {
      showToast("Preferences unavailable", "Browser storage could not be updated.");
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
    : `<span aria-hidden="true">Upload</span>`;
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

async function handleProfilePhotoUpload(form) {
  const input = form.querySelector("input[name='profilePhoto']");
  const file = input?.files?.[0];
  if (!file) {
    return;
  }
  if (!isValidProfilePhoto(file)) {
    showToast("Photo rejected", "Choose a JPEG, PNG, or WebP image.");
    setUploadCardError(form, "Choose a PNG, JPG, or WebP image up to 5MB.");
    return;
  }
  updateUploadCardPreview(form, file, "Uploading photo...");
  setText("#visitor-photo-status", "Uploading photo...");
  try {
    const upload = await uploadAccountProfilePhoto(file);
    const photoUrl = upload?.data?.url;
    if (!photoUrl) {
      throw new Error("Photo upload completed without a usable URL.");
    }
    const response = await updateAccountProfile({ employeePhotoUrl: photoUrl });
    activeVisitorProfile = response?.data || activeVisitorProfile;
    visitorProfileLoaded = Boolean(activeVisitorProfile);
    renderVisitorProfile(activeVisitorProfile);
    setText("#visitor-photo-status", "Profile photo updated.");
    setUploadCardSuccess(form, photoUrl, "Photo uploaded");
    showToast("Photo updated", "Your account photo was updated.");
  } catch (error) {
    setUploadCardError(form, "Photo update failed. Retry when ready.");
    setText("#visitor-photo-status", "Photo update failed. Your selected image is still ready to retry.");
    showToast("Photo update failed", error.message);
  }
}

async function handleProfilePhotoRemove() {
  try {
    const response = await updateAccountProfile({ employeePhotoUrl: "" });
    activeVisitorProfile = response?.data || activeVisitorProfile;
    renderVisitorProfile(activeVisitorProfile);
    setText("#visitor-photo-status", "Profile photo removed.");
    showToast("Photo removed", "Your optional profile photo was removed.");
  } catch (error) {
    showToast("Remove photo failed", error.message);
  }
}

function initNotificationActions() {
  const panel = document.querySelector(".visitor-notifications-page");
  if (!panel || panel.dataset.bound === "true") {
    return;
  }
  panel.dataset.bound = "true";
  panel.addEventListener("click", async (event) => {
    const readAll = event.target.closest("[data-visitor-notifications-read-all]");
    if (readAll) {
      try {
        const response = await markAllNotificationsRead();
        cachedNotifications = response?.data || cachedNotifications;
        renderNotificationList("#visitor-notifications-list", cachedNotifications.items || [], 30, true);
      } catch (error) {
        showToast("Notifications unavailable", error.message);
      }
      return;
    }
    const item = event.target.closest("[data-visitor-notification-id]");
    if (!item) {
      return;
    }
    try {
      const response = await markNotificationRead(item.dataset.visitorNotificationId);
      cachedNotifications = response?.data || cachedNotifications;
      renderNotificationList("#visitor-notifications-list", cachedNotifications.items || [], 30, true);
    } catch (error) {
      showToast("Notification update failed", error.message);
    }
  });
}

function renderNotificationList(selector, items, limit, interactive = false) {
  renderWorkList(selector, items.slice(0, limit), (item) => `
    <article class="work-card notification-item ${item.read ? "" : "is-unread"}">
      <h3>${escapeHtml(item.title || "Notification")}</h3>
      <p>${escapeHtml(item.message || "Visitor update")}</p>
      <small>${escapeHtml(formatDate(item.createdAt))}</small>
      ${interactive && !item.read ? `<button class="button button--ghost" type="button" data-visitor-notification-id="${escapeHtml(item.id)}">Mark read</button>` : ""}
    </article>
  `, "No notifications", "Visitor approvals, pass changes, and account notices will appear here.");
}

function initRequestFilters() {
  const host = document.querySelector(".visitor-filter-row");
  if (!host || host.dataset.bound === "true") {
    return;
  }
  host.dataset.bound = "true";
  host.addEventListener("click", (event) => {
    const button = event.target.closest("[data-request-filter]");
    if (!button) {
      return;
    }
    requestFilter = button.dataset.requestFilter || "all";
    host.querySelectorAll("[data-request-filter]").forEach((item) => item.classList.toggle("is-active", item === button));
    renderRequestGroups(cachedVisits);
  });
}

function initScheduleHints() {
  document.querySelectorAll("[id$='schedule-hint']").forEach((hint) => {
    hint.textContent = `Access opens 1 hour before arrival and closes 1 hour after expected end in ${timezoneLabel(getDefaultTimezone())}.`;
  });
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
    await loadRouteData({ force: true });
  } catch (error) {
    showToast("Reschedule failed", error.message);
  }
}

async function handleCancelRequest(visitorId) {
  const reason = await promptAction({
    title: "Cancel pending request",
    message: "This only cancels pending visitor requests. Approved audit history stays preserved.",
    label: "Cancellation reason",
    placeholder: "Optional reason",
    confirmLabel: "Cancel request",
    required: false,
    minLength: 0,
    multiline: true,
  }) || "";
  try {
    await cancelVisitorVisit(visitorId, { reason: reason.trim() });
    showToast("Request cancelled", "The pending request was cancelled without deleting audit history.");
    await loadRouteData({ force: true });
  } catch (error) {
    showToast("Cancel failed", error.message);
  }
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
    return "Attach an identity photo or document image for badge generation.";
  }
  if (!photoFile.type.startsWith("image/")) {
    return "Choose an image file so the badge photo can be verified at security.";
  }
  return "";
}

async function initOrganizations() {
  if (activeSession?.organizationCode) {
    document.querySelectorAll("[data-organization-selector], [data-organization-select]").forEach((control) => {
      control.value = activeSession.organizationCode;
    });
  }
  initOrganizationSelectors(document, { prefetch: true });
}

async function initHostPickers() {
  document.querySelectorAll("#visitor-request-form, #visitor-pre-registration-form").forEach((form) => {
    if (form.dataset.hostPickerBound === "true") {
      return;
    }
    form.dataset.hostPickerBound = "true";
    void initHostPicker(form, { basePath: "/visitor" });
  });
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

function selectBadgeVisit(items) {
  return items.find((visit) => ["APPROVED", "CHECKED_IN"].includes(visit.status) && (visit.qrCode || visit.qrIssuedAt))
    || items.find((visit) => ["APPROVED", "CHECKED_IN"].includes(visit.status))
    || null;
}

function buildVisitorIdentitySummary(items = []) {
  const visits = Array.isArray(items) ? items : [];
  const statusVisit = selectBadgeVisit(visits)
    || visits.find((visit) => visit.status === "PENDING")
    || visits.find((visit) => !["CHECKED_OUT", "REJECTED", "EXPIRED", "SUSPENDED"].includes(visit.status))
    || null;
  const nextVisit = selectNextVisitorVisit(visits);
  const timezone = nextVisit?.organizationTimezone
    || nextVisit?.scheduledTimezone
    || statusVisit?.organizationTimezone
    || statusVisit?.scheduledTimezone
    || getDefaultTimezone();

  return {
    passStatus: statusVisit ? visitorMenuStatusLabel(statusVisit.status) : "No active pass",
    nextVisit: nextVisit ? formatDate(nextVisit.scheduledStartTime || nextVisit.accessWindowStartTime, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }) : "",
    timezone: timezoneLabel(timezone),
  };
}

function selectNextVisitorVisit(items = []) {
  const now = Date.now();
  return items
    .filter((visit) => !["CHECKED_OUT", "REJECTED", "EXPIRED", "SUSPENDED"].includes(visit.status))
    .map((visit) => ({
      visit,
      time: new Date(visit.scheduledStartTime || visit.accessWindowStartTime || visit.createdAt || 0).getTime(),
    }))
    .filter((entry) => Number.isFinite(entry.time) && entry.time >= now)
    .sort((left, right) => left.time - right.time)[0]?.visit || null;
}

function visitorMenuStatusLabel(status) {
  if (status === "CHECKED_IN") {
    return "Checked-in";
  }
  return enterpriseStatusLabel(status, "visitor");
}

function renderPreRegistrationSuccess(payload) {
  const form = document.querySelector("#visitor-pre-registration-form");
  const success = document.querySelector("#visitor-pre-registration-success");
  if (!form || !success) {
    return;
  }
  form.classList.add("is-hidden");
  success.classList.remove("is-hidden");
  success.innerHTML = `
    <article class="empty-state empty-state--inline pre-registration-success__card">
      <span class="status-badge ${escapeHtml(statusBadgeClass("PENDING"))}">Pending approval</span>
      <h3>Pre-registration submitted</h3>
      <p>Your host will review this request. Approval status and QR badge availability will appear in Dashboard, Requests, and Badge.</p>
      <dl>
        <div><dt>Arrival</dt><dd>${escapeHtml(formatDate(payload.scheduledStartTime))}</dd></div>
        <div><dt>Purpose</dt><dd>${escapeHtml(payload.purposeOfVisit)}</dd></div>
      </dl>
      <div class="form-actions">
        <a class="button button--primary" href="/visitor/requests">Track request</a>
        <button class="button button--ghost" type="button" data-pre-registration-reset>Submit another</button>
      </div>
    </article>
  `;
  success.querySelector("[data-pre-registration-reset]")?.addEventListener("click", () => {
    success.classList.add("is-hidden");
    form.classList.remove("is-hidden");
  }, { once: true });
}

function persistOptionalVisitPreferences(payload) {
  try {
    window.localStorage?.setItem("accessflow.visitor.optionalPreferences", JSON.stringify({
      companyCode: payload.companyCode,
      expectedDurationMinutes: payload.expectedDurationMinutes,
      savedAt: new Date().toISOString(),
    }));
  } catch {
    // Preferences are optional; request submission should never depend on storage.
  }
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

function setPhoneFields(form, profile) {
  setPhoneInputValues(form, profile);
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

function initials(value) {
  const parts = String(value || "Visitor").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "V";
}
