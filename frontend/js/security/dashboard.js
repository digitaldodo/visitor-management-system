import { request } from "../shared/httpClient.js";
import { initAppErrorBoundary, runSafely } from "../shared/appErrorBoundary.js";
import { bootstrapApplication } from "../shared/appRuntime.js";
import { formatDate, formatDurationMinutes, formatStatus, minutesBetween } from "../shared/formatters.js";
import { requireRole } from "../shared/roleGuard.js";
import { initPortalShell, renderLoadingList, renderMetrics, renderWorkList, workCard, escapeHtml } from "../shared/portalShell.js";
import { initVisitorModule } from "../shared/visitorModule.js";
import { badgeDialogMarkup, downloadBadge, hydrateBadgePreview, printBadge } from "../shared/badgeStudio.js";
import {
  checkInVisitor,
  checkInWithQr,
  checkOutVisitor,
  createWorkforceOnboarding,
  getEmployeeAttendanceLogs,
  getEmployeeBadge,
  getSecurityMonitoring,
  getVisitorPass,
  listSecurityVisitorInvites,
  listSecurityWorkforceOnboardingRequests,
  manualEmployeeCheckIn,
  manualEmployeeCheckOut,
  markBadgePrinted,
  resendSecurityVisitorInvite,
  revokeSecurityVisitorInvite,
  scanEmployeeQr,
  searchEmployees,
  updateVisitor,
  uploadVisitorPhoto,
  uploadWorkforcePhoto,
  verifyQrPayload,
} from "../shared/accessService.js";
import { downloadEmployeeBadge, employeeBadgeDialogMarkup, printEmployeeBadge } from "../shared/employeeBadgeStudio.js";
import { getOperationalEvents } from "../shared/operationalEventApi.js";
import { createNonOverlappingPoller } from "../shared/performance.js";
import { showToast } from "../shared/toast.js";
import { enterpriseStatusLabel, statusBadgeClass } from "../shared/workflowEnums.js";
import { confirmAction, promptAction } from "../shared/actionModal.js";
import { SECURITY_REPORTS, exportOperationalReport } from "../shared/reportExport.js";

const ROUTES = ["dashboard", "verification", "scanner", "visitors", "checkins", "approvals", "incidents", "emergency", "notifications", "logs", "settings", "profile"];
const ROUTE_DEFINITIONS = {
  dashboard: {
    href: "/security/dashboard",
    title: "Security Dashboard",
    eyebrow: "Front Desk Operations",
    loader: () => import("./routes/dashboardPage.js"),
  },
  verification: {
    href: "/security/verification",
    title: "Visitor Verification",
    eyebrow: "Identity Workspace",
    loader: () => import("./routes/verificationPage.js"),
  },
  scanner: {
    href: "/security/scanner",
    title: "QR Scanner",
    eyebrow: "Verification Workspace",
    loader: () => import("./routes/scannerPage.js"),
  },
  visitors: {
    href: "/security/visitors",
    title: "Active Visitors",
    eyebrow: "Visitor Operations",
    loader: () => import("./routes/visitorsPage.js"),
  },
  checkins: {
    href: "/security/checkins",
    title: "Check-in / Check-out",
    eyebrow: "Access Desk",
    loader: () => import("./routes/checkinsPage.js"),
  },
  approvals: {
    href: "/security/approvals",
    title: "Pending Approvals",
    eyebrow: "Approval Workflow",
    loader: () => import("./routes/approvalsPage.js"),
  },
  incidents: {
    href: "/security/incidents",
    title: "Incident Reports",
    eyebrow: "Incident Workflow",
    loader: () => import("./routes/incidentsPage.js"),
  },
  emergency: {
    href: "/security/emergency",
    title: "Emergency Actions",
    eyebrow: "Emergency Command",
    loader: () => import("./routes/emergencyPage.js"),
  },
  notifications: {
    href: "/security/notifications",
    title: "Notifications",
    eyebrow: "Operational Updates",
    loader: () => import("./routes/notificationsPage.js"),
  },
  logs: {
    href: "/security/logs",
    title: "Security Logs",
    eyebrow: "Audit Workspace",
    loader: () => import("./routes/logsPage.js"),
  },
  settings: {
    href: "/security/settings",
    title: "Settings",
    eyebrow: "Preferences",
    loader: () => import("./routes/settingsPage.js"),
  },
  profile: {
    href: "/security/profile",
    title: "Profile",
    eyebrow: "Account",
    loader: () => import("./routes/profilePage.js"),
  },
};
const ROUTE_ALIASES = {
  "": "dashboard",
  security: "dashboard",
  dashboard: "dashboard",
  "visitor-verification": "verification",
  verification: "verification",
  badges: "verification",
  badge: "verification",
  photo: "verification",
  qr: "scanner",
  scanner: "scanner",
  scan: "scanner",
  visitors: "visitors",
  "visitor-registration": "visitors",
  queue: "visitors",
  monitoring: "visitors",
  checkins: "checkins",
  "check-in": "checkins",
  checkin: "checkins",
  "employee-check-in": "checkins",
  "employee-attendance": "checkins",
  approvals: "approvals",
  "workforce-onboarding": "approvals",
  incidents: "incidents",
  alerts: "incidents",
  emergency: "emergency",
  notifications: "notifications",
  logs: "logs",
  "workforce-logs": "logs",
  settings: "settings",
  profile: "profile",
};
const ROUTE_DATA_REQUIREMENTS = {
  dashboard: ["overview", "monitoring", "visitorInvites", "workforceRequests", "employeeLogs", "emergencyState", "emergencyFeed"],
  verification: ["photo", "monitoring"],
  scanner: ["monitoring"],
  visitors: ["queue", "monitoring"],
  checkins: ["monitoring", "employees"],
  approvals: ["visitorInvites", "workforceRequests"],
  incidents: ["emergencyFeed"],
  emergency: ["emergencyState", "emergencyFeed", "emergencyEvacuation", "operationalEvents"],
  logs: ["monitoring", "employeeLogs"],
  notifications: [],
  settings: [],
  profile: [],
};
const state = {
  session: null,
  monitoringQuery: "",
  monitoringDebounce: 0,
  emergencyIncidentFilter: "ALL",
  emergencyState: null,
  emergencyFeed: [],
  emergencyEvacuation: null,
  operationalEvents: [],
  operationalEventCursor: "",
  employeeQuery: "",
  employeeDebounce: 0,
  activeBadge: null,
  activeEmployeeBadge: null,
  activeVerification: null,
  approvedBadgeVisitors: [],
  portalLoading: false,
  portalLoadQueued: false,
  portalLoadRevision: 0,
};
let securityPortalPoller;
let securityRouteRenderId = 0;
let securityInviteActionsBound = false;
let securityBadgeActionsBound = false;
let employeeBadgeActionsBound = false;

document.addEventListener("DOMContentLoaded", () => {
  void bootstrapApplication("security-portal", () => bootSecurityPortal(), {
    redirectToLogin: true,
    failureMessage: "AccessFlow had trouble restoring front desk operations. Refreshing workspace...",
  });
});

async function bootSecurityPortal() {
  initAppErrorBoundary();
  migrateLegacySecurityRoute();

  const session = requireRole("SECURITY_GUARD");
  if (!session) {
    return;
  }
  state.session = session;
  const initialRoute = currentSecurityRoute();

  groupSecurityNavigation();
  initPortalShell(session, {
    allowedRoutes: ROUTES,
    routeMap: ROUTE_DEFINITIONS,
    activeRoute: initialRoute,
    defaultHref: ROUTE_DEFINITIONS.dashboard.href,
    onRefresh: () => loadSecurityPortal(false),
  });
  bindSecurityWorkspaceNavigation();
  initSecurityInviteActions();
  initBadgeActions();
  initEmployeeBadgeActions();
  await renderSecurityRoute(initialRoute, { replace: true });
  securityPortalPoller = createNonOverlappingPoller(() => loadSecurityPortal(false), {
    intervalMs: 30000,
    backgroundIntervalMs: 120000,
    immediate: false,
  });
  securityPortalPoller.start();
  window.addEventListener("beforeunload", () => securityPortalPoller?.stop(), { once: true });
}

function groupSecurityNavigation() {
  const nav = document.querySelector("#sidebar-nav");
  if (!nav || nav.dataset.grouped === "true") {
    return;
  }
  const sections = [
    { label: "Command center", routes: ["dashboard", "notifications"] },
    { label: "Visitor operations", routes: ["verification", "scanner", "visitors", "checkins", "approvals"] },
    { label: "Response and audit", routes: ["incidents", "emergency", "logs", "settings", "profile"] },
  ];
  const linksByRoute = new Map(Array.from(nav.querySelectorAll(".nav-link")).map((link) => [link.dataset.route, link]));
  nav.replaceChildren(...sections.map((section) => {
    const wrapper = document.createElement("section");
    wrapper.className = "nav-section";
    wrapper.setAttribute("aria-label", section.label);

    const label = document.createElement("p");
    label.className = "nav-section__label";
    label.textContent = section.label;
    wrapper.append(label);

    section.routes.forEach((route) => {
      const link = linksByRoute.get(route);
      if (link) {
        wrapper.append(link);
      }
    });
    return wrapper;
  }));
  nav.dataset.grouped = "true";
}

function migrateLegacySecurityRoute() {
  const hashRoute = routeFromHash(window.location.hash);
  if (hashRoute) {
    window.history.replaceState({}, "", ROUTE_DEFINITIONS[hashRoute].href);
    return;
  }

  const route = currentSecurityRoute();
  const definition = ROUTE_DEFINITIONS[route] || ROUTE_DEFINITIONS.dashboard;
  if (window.location.pathname !== definition.href) {
    window.history.replaceState({}, "", definition.href);
  }
}

function routeFromHash(hash) {
  const value = String(hash || "").replace("#", "").trim().toLowerCase();
  return value ? ROUTE_ALIASES[value] || "" : "";
}

function currentSecurityRoute() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const rawRoute = segments[0] === "security" ? segments[1] || "dashboard" : "dashboard";
  return ROUTE_ALIASES[rawRoute] || (ROUTES.includes(rawRoute) ? rawRoute : "dashboard");
}

async function renderSecurityRoute(route = currentSecurityRoute(), options = {}) {
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

  const renderId = ++securityRouteRenderId;

  if (!options.replace && window.location.pathname !== definition.href) {
    window.history.pushState({}, "", definition.href);
  } else if (options.replace && window.location.pathname !== definition.href) {
    window.history.replaceState({}, "", definition.href);
  }

  setActiveRoute(resolvedRoute);
  setPageTitle(definition);
  host.classList.add("is-transitioning");
  host.innerHTML = `
    <section class="security-route panel route-loading-state">
      <div class="employee-badge-skeleton">
        <div>
          <strong>Loading ${escapeHtml(definition.title)}</strong>
          <p>Preparing this security workspace.</p>
        </div>
        <span></span><span></span><span></span>
      </div>
    </section>
  `;

  try {
    const pageModule = await definition.loader();
    if (renderId !== securityRouteRenderId) {
      return;
    }
    host.innerHTML = pageModule.render({ session: state.session });
    host.dataset.activeRoute = resolvedRoute;
    await initializeRenderedRoute(resolvedRoute, renderId);
    if (renderId !== securityRouteRenderId) {
      return;
    }
    host.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    if (renderId !== securityRouteRenderId) {
      return;
    }
    host.innerHTML = `
      <section class="security-route panel">
        <div class="empty-state empty-state--inline">
          <h3>Workspace unavailable</h3>
          <p>${escapeHtml(error?.message || "This security workspace could not be loaded.")}</p>
        </div>
      </section>
    `;
    showToast("Workspace unavailable", error?.message || "Route module could not be loaded.");
  } finally {
    if (renderId === securityRouteRenderId) {
      requestAnimationFrame(() => host.classList.remove("is-transitioning"));
    }
  }
}

async function initializeRenderedRoute(route, renderId) {
  if (route === "visitors") {
    await runSafely("security visitor module", () => initVisitorModule("[data-security-visitors]", {
      basePath: "/security",
      title: "Front Desk Registration",
      eyebrow: "Reception Operations",
      canDelete: false,
      enableRecurring: true,
    }), { toastTitle: "Visitor registration unavailable" });
    initMonitoringSearch();
  }
  if (route === "scanner") {
    initQrVerification();
    renderVerificationIdle();
  }
  if (route === "checkins") {
    initEmployeeAttendanceWorkspace();
    renderEmployeeScanIdle();
  }
  if (route === "approvals") {
    initWorkforceOnboarding();
  }
  if (route === "incidents" || route === "emergency") {
    initEmergencyWorkspace();
  }
  if (route === "logs") {
    mountSecurityReportExports();
  }
  if (route === "verification") {
    await refreshBadgeListIfVisible(true);
  }
  if (renderId !== securityRouteRenderId) {
    return;
  }
  await loadSecurityPortal();
}

function bindSecurityWorkspaceNavigation() {
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link || link.target || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const url = new URL(link.href, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/security")) {
      return;
    }
    event.preventDefault();
    const nextRoute = ROUTE_ALIASES[url.pathname.split("/").filter(Boolean)[1] || "dashboard"] || "dashboard";
    void renderSecurityRoute(nextRoute);
  });

  window.addEventListener("popstate", () => {
    void renderSecurityRoute(currentSecurityRoute(), { replace: true });
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
  setText(".topbar__title .eyebrow", definition.eyebrow || "Front Desk Operations");
  setText(".topbar__title h1", definition.title || "Security Dashboard");
  document.title = `AccessFlow | ${definition.title || "Security Portal"}`;
}

async function loadSecurityPortal(showErrors = true) {
  const route = activeRenderedSecurityRoute();
  const needs = dataRequirementsForRoute(route);
  if (state.portalLoading) {
    state.portalLoadRevision += 1;
    state.portalLoadQueued = true;
    return;
  }
  const revision = ++state.portalLoadRevision;
  state.portalLoading = true;
  state.portalLoadQueued = false;

  if (showErrors) {
    renderRouteLoadingState(needs);
  }

  const [overview, queue, photo, monitoring, visitorInvites, emergencyState, emergencyFeed, emergencyEvacuation, operationalEvents, employees, employeeLogs, workforceRequests] = await Promise.allSettled([
    fetchIfNeeded(needs.overview, () => request("/security/overview")),
    fetchIfNeeded(needs.queue, () => request("/security/queue")),
    fetchIfNeeded(needs.photo, () => request("/security/photo-capture")),
    fetchIfNeeded(needs.monitoring, () => getSecurityMonitoring(state.monitoringQuery)),
    fetchIfNeeded(needs.visitorInvites, () => listSecurityVisitorInvites()),
    fetchIfNeeded(needs.emergencyState, () => getEmergencyState()),
    fetchIfNeeded(needs.emergencyFeed, () => getEmergencyFeed()),
    fetchIfNeeded(needs.emergencyEvacuation, () => getEmergencyEvacuationRegister()),
    fetchIfNeeded(needs.operationalEvents, () => getOperationalEvents(state.operationalEventCursor, 80)),
    fetchIfNeeded(needs.employees, () => searchEmployees(state.employeeQuery)),
    fetchIfNeeded(needs.employeeLogs, () => getEmployeeAttendanceLogs("/security")),
    fetchIfNeeded(needs.workforceRequests, () => listSecurityWorkforceOnboardingRequests()),
  ]);

  if (revision !== state.portalLoadRevision) {
    state.portalLoading = false;
    if (state.portalLoadQueued) {
      void loadSecurityPortal(false);
    }
    return;
  }

  if (needs.overview && overview.status === "fulfilled") {
    renderMetrics(overview.value?.data?.metrics || []);
  } else if (needs.overview && showErrors) {
    renderMetrics([]);
  }

  if (needs.queue && queue.status === "fulfilled") {
    renderWorkList("#queue-list", queue.value?.data?.items || [], queueCard, "No approved arrivals", "Approved visitors waiting for arrival will appear here.");
  } else if (needs.queue && showErrors) {
    renderWorkList("#queue-list", [], (item) => item, "Queue unavailable", queue.reason?.message || "Queue could not be loaded.");
  }

  if (needs.photo && photo.status === "fulfilled") {
    renderPhotoCapturePanel(photo.value?.data || {});
  } else if (needs.photo && showErrors) {
    const message = photo.reason?.message || "Camera status could not be loaded.";
    renderWorkList("#photo-list", [], (item) => item, "Camera status unavailable", message);
    setCameraFrameStatus(message);
  }

  if (needs.monitoring && monitoring.status === "fulfilled") {
    const monitoringData = monitoring.value?.data || {};
    renderWorkList("#checkins-list", monitoringData.currentlyInside || [], checkedInCard, "No active check-ins", "Checked-in visitors will appear here.");
    renderMonitoring(monitoringData);
    state.approvedBadgeVisitors = monitoringData.approvedVisitors || [];
    await refreshBadgeListIfVisible();
  } else if (needs.monitoring && showErrors) {
    const message = monitoring.reason?.message || "Monitoring could not be loaded.";
    renderWorkList("#checkins-list", [], (item) => item, "Check-ins unavailable", message);
    renderWorkList("#badge-list", [], (item) => item, "Badges unavailable", message);
    renderWorkList("#monitor-inside-list", [], (item) => item, "Monitoring unavailable", message);
    renderWorkList("#monitor-overdue-list", [], (item) => item, "Monitoring unavailable", message);
    renderWorkList("#monitor-checkedout-list", [], (item) => item, "Monitoring unavailable", message);
    renderWorkList("#monitor-rejected-list", [], (item) => item, "Monitoring unavailable", message);
    renderWorkList("#monitor-recurring-active-list", [], (item) => item, "Monitoring unavailable", message);
    renderWorkList("#monitor-recurring-expired-list", [], (item) => item, "Monitoring unavailable", message);
    renderWorkList("#monitor-suspended-list", [], (item) => item, "Monitoring unavailable", message);
    renderWorkList("#monitor-attendance-list", [], (item) => item, "Monitoring unavailable", message);
  }

  if (needs.visitorInvites && visitorInvites.status === "fulfilled") {
    renderSecurityVisitorInvites(visitorInvites.value?.data || []);
  } else if (needs.visitorInvites && showErrors) {
    renderWorkList("#security-invite-list", [], (item) => item, "Invites unavailable", visitorInvites.reason?.message || "Visitor invites could not be loaded.");
  }

  if (needs.emergencyState && emergencyState.status === "fulfilled") {
    state.emergencyState = emergencyState.value?.data || null;
  }
  if (needs.emergencyFeed && emergencyFeed.status === "fulfilled") {
    state.emergencyFeed = emergencyFeed.value?.data || [];
  }
  if (needs.emergencyEvacuation && emergencyEvacuation.status === "fulfilled") {
    state.emergencyEvacuation = emergencyEvacuation.value?.data || null;
  }
  if (needs.operationalEvents && operationalEvents.status === "fulfilled") {
    mergeOperationalEvents(operationalEvents.value?.data || {});
  }
  if (needsEmergencyRender(needs) && [emergencyState, emergencyFeed, emergencyEvacuation, operationalEvents].some((result) => result.status === "fulfilled" && result.value !== null)) {
    renderEmergencyWorkspace();
  } else if (needsEmergencyRender(needs) && showErrors) {
    renderEmergencyUnavailable(emergencyFeed.reason?.message || emergencyState.reason?.message || "Emergency operations could not be loaded.");
  }

  if (needs.employees && employees.status === "fulfilled") {
    renderEmployeeDirectory(employees.value?.data || []);
  } else if (needs.employees && showErrors) {
    renderWorkList("#employee-directory-list", [], (item) => item, "Employee lookup unavailable", employees.reason?.message || "Employee directory could not be loaded.");
  }

  if (needs.employeeLogs && employeeLogs.status === "fulfilled") {
    renderEmployeeAttendanceLogs(employeeLogs.value?.data || []);
  } else if (needs.employeeLogs && showErrors) {
    renderWorkList("#employee-attendance-log-list", [], (item) => item, "Presence logs unavailable", employeeLogs.reason?.message || "Workforce presence could not be loaded.");
  }

  if (needs.workforceRequests && workforceRequests.status === "fulfilled") {
    renderSubmittedWorkforceRequests(workforceRequests.value?.data || []);
  } else if (needs.workforceRequests && showErrors) {
    renderWorkList("#workforce-request-list", [], (item) => item, "Submitted requests unavailable", workforceRequests.reason?.message || "Workforce approval status could not be loaded.");
  }

  if (route === "dashboard") {
    renderSecurityDashboard({
      queue: queue.status === "fulfilled" && queue.value ? queue.value?.data?.items || [] : [],
      monitoring: monitoring.status === "fulfilled" && monitoring.value ? monitoring.value?.data || {} : {},
      visitorInvites: visitorInvites.status === "fulfilled" && visitorInvites.value ? visitorInvites.value?.data || [] : [],
      workforceRequests: workforceRequests.status === "fulfilled" && workforceRequests.value ? workforceRequests.value?.data || [] : [],
      employeeLogs: employeeLogs.status === "fulfilled" && employeeLogs.value ? employeeLogs.value?.data || [] : [],
    });
  }

  state.portalLoading = false;
  if (state.portalLoadQueued) {
    void loadSecurityPortal(false);
  }
}

function activeRenderedSecurityRoute() {
  const activeRoute = document.querySelector("#main-content")?.dataset.activeRoute;
  return ROUTES.includes(activeRoute) ? activeRoute : currentSecurityRoute();
}

function dataRequirementsForRoute(route) {
  const keys = ROUTE_DATA_REQUIREMENTS[route] || ROUTE_DATA_REQUIREMENTS.dashboard;
  return keys.reduce((requirements, key) => {
    requirements[key] = true;
    return requirements;
  }, { route });
}

function fetchIfNeeded(needed, loader) {
  return needed ? loader() : Promise.resolve(null);
}

function needsEmergencyRender(needs) {
  return Boolean(needs.emergencyState || needs.emergencyFeed || needs.emergencyEvacuation || needs.operationalEvents);
}

function renderRouteLoadingState(needs) {
  if (needs.overview) {
    renderMetrics([]);
    renderLoadingList("#dashboard-active-visitors", 2);
    renderLoadingList("#dashboard-pending-approvals", 2);
    renderLoadingList("#dashboard-checkin-activity", 2);
  }
  if (needs.queue) {
    renderLoadingList("#queue-list");
  }
  if (needs.photo) {
    renderLoadingList("#photo-list");
  }
  if (needs.monitoring) {
    renderLoadingList("#checkins-list");
    renderLoadingList("#badge-list");
    renderLoadingList("#monitor-inside-list");
    renderLoadingList("#monitor-overdue-list");
    renderLoadingList("#monitor-checkedout-list");
    renderLoadingList("#monitor-rejected-list");
    renderLoadingList("#monitor-recurring-active-list");
    renderLoadingList("#monitor-recurring-expired-list");
    renderLoadingList("#monitor-suspended-list");
    renderLoadingList("#monitor-attendance-list");
  }
  if (needs.visitorInvites) {
    renderLoadingList("#security-invite-list");
  }
  if (needsEmergencyRender(needs)) {
    renderEmergencyLoading();
  }
  if (needs.employees) {
    renderLoadingList("#employee-directory-list");
  }
  if (needs.employeeLogs) {
    renderLoadingList("#employee-attendance-log-list");
  }
  if (needs.workforceRequests) {
    renderLoadingList("#workforce-request-list");
  }
}

function renderSecurityDashboard(data = {}) {
  const monitoring = data.monitoring || {};
  const activeVisitors = monitoring.currentlyInside || [];
  const pendingVisitorInvites = (data.visitorInvites || []).filter((invite) => {
    const stage = canonicalInviteStage(invite);
    return !["CHECKED_IN", "CHECKED_OUT", "REVOKED", "EXPIRED", "REJECTED"].includes(stage);
  });
  const pendingWorkforce = (data.workforceRequests || []).filter((worker) => {
    const status = String(worker.accountStatus || "PENDING_APPROVAL").toUpperCase();
    return status.includes("PENDING") || status.includes("CHANGE");
  });
  const movement = [
    ...activeVisitors.slice(0, 3).map((visitor) => ({
      title: visitor.fullName || "Visitor",
      detail: visitor.hostEmployee || visitor.companyName || "Checked in visitor",
      at: visitor.checkInTime || visitor.createdAt,
    })),
    ...(data.employeeLogs || []).slice(0, 3).map((log) => ({
      title: log.fullName || log.employeeName || "Workforce member",
      detail: formatPresenceStatus(log),
      at: log.checkOutTime || log.checkInTime || log.createdAt,
    })),
  ].sort((left, right) => new Date(right.at || 0) - new Date(left.at || 0)).slice(0, 4);

  renderWorkList("#dashboard-active-visitors", activeVisitors.slice(0, 4), checkedInCard, "No active visitors", "Checked-in visitors will appear here.");
  renderWorkList("#dashboard-pending-approvals", [
    ...pendingVisitorInvites.slice(0, 3).map((invite) => ({
      title: invite.visitorName || "Visitor invite",
      detail: invite.companyName || invite.purposeOfVisit || "Visitor verification",
      meta: invite.scheduledStartTime ? `Arrival ${formatDate(invite.scheduledStartTime)}` : "Arrival pending",
    })),
    ...pendingWorkforce.slice(0, 3).map((worker) => ({
      title: worker.fullName || "Workforce request",
      detail: formatInternalRole((worker.roles || [])[0] || "EMPLOYEE"),
      meta: formatDate(worker.workforceOnboardingCreatedAt || worker.createdAt),
    })),
  ].slice(0, 4), (item) => workCard(item.title, item.detail, item.meta), "No pending approvals", "Visitor and workforce approval workflows will appear here.");
  renderWorkList("#dashboard-checkin-activity", movement, (item) => workCard(item.title, item.detail, formatDate(item.at)), "No recent movement", "Check-in and check-out activity will appear here.");

  const summary = document.querySelector("#security-dashboard-summary");
  if (summary) {
    const counts = monitoring.counts || {};
    const activeIncidents = (state.emergencyFeed || []).filter((incident) => incident.status !== "RESOLVED").length;
    summary.innerHTML = `
      ${summaryTile("Inside now", counts.currentlyInside || activeVisitors.length || 0)}
      ${summaryTile("Pending approvals", pendingVisitorInvites.length + pendingWorkforce.length)}
      ${summaryTile("Emergency alerts", activeIncidents)}
      ${summaryTile("Overdue visitors", counts.overdueVisitors || 0)}
    `;
  }
}

function summaryTile(label, value) {
  return `
    <div class="employee-summary-tile">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function mountSecurityReportExports() {
  const target = document.querySelector("#security-report-export-target");
  if (!target || document.querySelector("#security-report-export-panel")) {
    return;
  }
  const panel = document.createElement("article");
  panel.className = "security-report-export-panel";
  panel.id = "security-report-export-panel";
  panel.innerHTML = `
    <div class="panel__header">
      <div>
        <p class="eyebrow">Structured Reporting</p>
        <h3>Security Report Exports</h3>
        <p class="panel__subtle">Generate audit-safe CSV or print-ready PDF exports from backend reporting endpoints.</p>
      </div>
    </div>
    <div class="security-report-export-grid">
      ${SECURITY_REPORTS.map((report) => `
        <article class="security-report-export-card">
          <span>CSV / PDF</span>
          <strong>${escapeHtml(report.title)}</strong>
          <small>${escapeHtml(report.note)}</small>
          <div class="security-report-export-card__actions">
            <button class="button button--ghost button--small" type="button" data-security-report="${escapeHtml(report.type)}" data-export-format="CSV">Download CSV</button>
            <button class="button button--primary button--small" type="button" data-security-report="${escapeHtml(report.type)}" data-export-format="PDF">Download PDF</button>
          </div>
        </article>
      `).join("")}
    </div>
  `;
  panel.querySelectorAll("[data-security-report]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.toggleAttribute("disabled", true);
      try {
        const report = await exportOperationalReport("/security", button.dataset.securityReport, button.dataset.exportFormat);
        showToast("Security report ready", `${report.title} ${report.format} export generated.`);
      } catch (error) {
        showToast("Security report failed", error.message);
      } finally {
        button.toggleAttribute("disabled", false);
      }
    });
  });
  target.append(panel);
}

function initSecurityInviteActions() {
  if (securityInviteActionsBound) {
    return;
  }
  securityInviteActionsBound = true;
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-security-invite-action]");
    if (!button) {
      return;
    }
    const id = button.dataset.inviteId;
    if (!id) {
      return;
    }
    const action = button.dataset.securityInviteAction;
    button.disabled = true;
    button.classList.add("is-loading");
    try {
      if (action === "copy") {
        const url = button.dataset.inviteUrl || "";
        if (!url) {
          showToast("Invite link unavailable", "This invite does not currently expose a shareable link.");
          return;
        }
        await navigator.clipboard?.writeText(url);
        showToast("Invite link copied", "Share the secure pre-registration link with the visitor.");
        return;
      }
      if (action === "resend") {
        const confirmed = await confirmAction({
          title: "Resend visitor invite",
          message: "Queue the invite email again for this visitor?",
          confirmLabel: "Resend invite",
        });
        if (!confirmed) {
          return;
        }
        await resendSecurityVisitorInvite(id);
        showToast("Invite resent", "Email delivery has been queued again.");
      }
      if (action === "revoke") {
        const reason = await promptAction({
          title: "Cancel visitor invite",
          message: "Record why this pending invite should be closed.",
          label: "Revocation reason",
          placeholder: "Meeting cancelled, wrong recipient, policy reason",
          confirmLabel: "Revoke invite",
          minLength: 8,
          multiline: true,
        });
        if (!reason || reason.trim().length < 8) {
          showToast("Reason required", "Enter at least 8 characters before revoking an invite.");
          return;
        }
        await revokeSecurityVisitorInvite(id, reason.trim());
        showToast("Invite revoked", "The visitor invite lifecycle was closed.");
      }
      await loadSecurityPortal(false);
    } catch (error) {
      showToast("Invite action failed", error.message);
    } finally {
      button.disabled = false;
      button.classList.remove("is-loading");
    }
  });
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
  setCount("#monitor-count-recurring-active", counts.activeRecurringVisitors || 0);
  setCount("#monitor-count-recurring-expired", counts.expiredRecurringVisitors || 0);
  setCount("#monitor-count-suspended", counts.suspendedVisitors || 0);
  setCount("#monitor-count-attendance", counts.dailyAttendanceLogs || 0);

  renderWorkList("#monitor-inside-list", data.currentlyInside || [], monitorCard, "No visitors inside", "Checked-in visitors will appear here.");
  renderWorkList("#monitor-overdue-list", data.overdueVisitors || [], overdueCard, "No overdue visitors", "Visitors who exceed the approved window will appear here.");
  renderWorkList("#monitor-checkedout-list", data.checkedOutVisitors || [], monitorCard, "No recent check-outs", "Completed departures will appear here.");
  renderWorkList("#monitor-rejected-list", data.rejectedVisitors || [], rejectedCard, "No denied visitors", "Denied requests will appear here.");
  renderWorkList("#monitor-recurring-active-list", data.activeRecurringVisitors || [], recurringCard, "No active recurring visitors", "Approved recurring profiles will appear here.");
  renderWorkList("#monitor-recurring-expired-list", data.expiredRecurringVisitors || [], recurringCard, "No expired recurring visitors", "Expired recurring profiles will appear here.");
  renderWorkList("#monitor-suspended-list", data.suspendedVisitors || [], recurringCard, "No suspended visitors", "Suspended profiles will appear here.");
  renderWorkList("#monitor-attendance-list", data.dailyAttendanceLogs || [], attendanceCard, "No presence logs today", "Today's check-in and check-out activity will appear here.");
}

function renderSecurityVisitorInvites(invites = []) {
  setCount("#security-invite-count", invites.length);
  renderWorkList(
    "#security-invite-list",
    invites.slice(0, 10),
    securityInviteCard,
    "No active invites",
    "Visitor pre-registration invites will appear here with resend and revoke controls.",
  );
}

function securityInviteCard(invite = {}) {
  const stage = canonicalInviteStage(invite);
  const closed = ["REVOKED", "EXPIRED", "REJECTED", "CHECKED_IN", "CHECKED_OUT"].includes(stage);
  const canResend = Boolean(invite.visitorEmail) && !closed;
  const subtitle = [invite.companyName, invite.purposeOfVisit, invite.hostEmployeeName ? `Host ${invite.hostEmployeeName}` : ""].filter(Boolean).join(" · ") || "Pre-registration invite";
  const meta = [
    invite.scheduledStartTime ? `Arrival ${formatDate(invite.scheduledStartTime)}` : "Arrival pending",
    invite.emailStatus ? `Email ${enterpriseStatusLabel(invite.emailStatus)}` : "",
    invite.expiresAt ? `Expires ${formatDate(invite.expiresAt)}` : "",
  ].filter(Boolean).join(" · ");
  return `
    <article class="work-card">
      <div class="work-card__header">
        <h3>${escapeHtml(invite.visitorName || "Visitor invite")}</h3>
        <span class="status-badge status-badge--tone-${escapeHtml(inviteTone(stage))}">${escapeHtml(invite.lifecycleLabel || enterpriseStatusLabel(stage, "invite"))}</span>
      </div>
      <p>${escapeHtml(subtitle)}</p>
      <small>${escapeHtml(meta)}</small>
      <div class="table-actions">
        ${invite.inviteUrl ? `<button class="button button--ghost button--small" type="button" data-security-invite-action="copy" data-invite-id="${escapeHtml(invite.id)}" data-invite-url="${escapeHtml(invite.inviteUrl)}">Copy link</button>` : ""}
        ${canResend ? `<button class="button button--ghost button--small" type="button" data-security-invite-action="resend" data-invite-id="${escapeHtml(invite.id)}">Resend</button>` : ""}
        ${!closed ? `<button class="button button--danger button--small" type="button" data-security-invite-action="revoke" data-invite-id="${escapeHtml(invite.id)}">Cancel invite</button>` : ""}
      </div>
    </article>
  `;
}

function canonicalInviteStage(invite = {}) {
  const status = String(invite.lifecycleStage || invite.status || "INVITED").toUpperCase();
  if (status === "CHECKED_OUT") {
    return "CHECKED_OUT";
  }
  if (status === "CHECKED_IN" || status === "ARRIVED" || invite.arrivedAt) {
    return "CHECKED_IN";
  }
  if (status === "BADGE_ISSUED" || status === "QR_ISSUED" || invite.qrIssuedAt) {
    return "BADGE_ISSUED";
  }
  if (status === "SENT") {
    return "INVITED";
  }
  if (status === "VIEWED") {
    return "PRE_REGISTRATION_PENDING";
  }
  if (status === "REGISTRATION_COMPLETED") {
    return "PRE_REGISTERED";
  }
  return status;
}

function inviteTone(stage) {
  if (["REVOKED", "EXPIRED", "REJECTED"].includes(stage)) {
    return "danger";
  }
  if (["BADGE_ISSUED", "CHECKED_IN", "CHECKED_OUT"].includes(stage)) {
    return "success";
  }
  if (["PENDING_APPROVAL", "PRE_REGISTERED", "APPROVED"].includes(stage)) {
    return "warning";
  }
  return "info";
}

function initEmergencyWorkspace() {
  const filter = document.querySelector("#emergency-incident-filter");
  filter?.addEventListener("change", () => {
    state.emergencyIncidentFilter = filter.value || "ALL";
    renderEmergencyWorkspace();
  });

  document.querySelector("#panic-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const checkpoint = trim(data.checkpoint) || "Security checkpoint";
    const note = trim(data.note);
    if (!note || note.length < 4) {
      showToast("Panic note required", "Record a short note before dispatching a panic alert.");
      return;
    }
    const confirmed = await confirmAction({
      title: "Dispatch panic alert",
      message: "Dispatch a critical panic alert to emergency operations and audit this security action.",
      confirmLabel: "Dispatch alert",
      tone: "danger",
    });
    if (!confirmed) {
      return;
    }
    await submitEmergencyAction(form, () => triggerEmergencyPanic({ checkpoint, note, deliberate: true }), {
      title: "Panic alert dispatched",
      message: "Emergency operations have been notified and the incident was audited.",
      reset: true,
    });
  });

  document.querySelector("#suspicious-visitor-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const id = trim(data.id);
    const note = trim(data.note);
    if (!id || !note) {
      showToast("Visitor and note required", "Choose a visitor record ID and record the suspicious activity note.");
      return;
    }
    await submitEmergencyAction(form, () => flagSuspiciousVisitor({ id, note, checkpoint: trim(data.checkpoint) || "Visitor operation" }), {
      title: "Suspicious visitor flagged",
      message: "The incident is visible in the emergency feed and audit trail.",
      reset: true,
    });
  });

  document.querySelector("#suspicious-workforce-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const id = trim(data.id);
    const note = trim(data.note);
    if (!id || !note) {
      showToast("Workforce ID and note required", "Choose a workforce user ID and record the suspicious activity note.");
      return;
    }
    await submitEmergencyAction(form, () => flagSuspiciousWorkforce({ id, note, checkpoint: trim(data.checkpoint) || "Workforce operation" }), {
      title: "Suspicious workforce flagged",
      message: "The incident is visible in the emergency feed and audit trail.",
      reset: true,
    });
  });

  document.querySelector("#emergency-feed-list")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-emergency-subject]");
    if (!button?.dataset.emergencySubject) {
      return;
    }
    const write = navigator.clipboard?.writeText?.(button.dataset.emergencySubject);
    if (write?.then) {
      write.then(() => {
        showToast("Record ID copied", "Use this ID for related suspicious activity workflows.");
      }).catch(() => undefined);
    }
  });
}

async function submitEmergencyAction(form, action, options = {}) {
  const submit = form.querySelector("button[type='submit']");
  submit?.toggleAttribute("disabled", true);
  submit?.classList.add("is-loading");
  submit?.setAttribute("aria-busy", "true");
  try {
    await action();
    if (options.reset) {
      form.reset();
    }
    showToast(options.title || "Emergency action recorded", options.message || "The operational workflow was completed.");
    await loadSecurityPortal(false);
  } catch (error) {
    showToast("Emergency action failed", error.message);
  } finally {
    submit?.toggleAttribute("disabled", false);
    submit?.classList.remove("is-loading");
    submit?.removeAttribute("aria-busy");
  }
}

function renderEmergencyLoading() {
  renderWorkList("#emergency-feed-list", [], (item) => item, "Loading incidents", "Emergency incidents are loading.");
  renderWorkList("#evacuation-register-list", [], (item) => item, "Loading register", "Evacuation register is loading.");
  renderWorkList("#operational-feed-list", [], (item) => item, "Loading operations", "Realtime operational events are loading.");
}

function renderEmergencyUnavailable(message) {
  renderWorkList("#emergency-feed-list", [], (item) => item, "Emergency feed unavailable", message);
  renderWorkList("#evacuation-register-list", [], (item) => item, "Evacuation register unavailable", message);
  renderWorkList("#operational-feed-list", [], (item) => item, "Operational feed unavailable", message);
}

function renderEmergencyWorkspace() {
  const incidents = state.emergencyFeed || [];
  const evacuation = state.emergencyEvacuation || {};
  const activeIncidents = incidents.filter((incident) => incident.status !== "RESOLVED");
  const panicCount = activeIncidents.filter((incident) => incident.type === "PANIC_TRIGGERED").length;
  const unaccounted = evacuation.counts?.unaccounted || 0;

  setText("#emergency-lockdown-state", state.emergencyState?.lockdownActive ? "Active" : "Clear");
  setText("#emergency-active-count", String(activeIncidents.length));
  setText("#emergency-panic-count", String(panicCount));
  setText("#emergency-unaccounted-count", String(unaccounted));
  setText("#emergency-alert-title", emergencyAlertTitle(state.emergencyState, activeIncidents));
  setText("#emergency-alert-body", emergencyAlertBody(state.emergencyState, activeIncidents));

  document.querySelector("#emergency-alert-card")?.classList.toggle("emergency-alert-card--active", Boolean(state.emergencyState?.lockdownActive || state.emergencyState?.evacuationActive || panicCount));
  const emergencyStateBadge = document.querySelector("#emergency-lockdown-state");
  if (emergencyStateBadge) {
    emergencyStateBadge.className = `status-badge ${state.emergencyState?.lockdownActive ? "status-badge--tone-danger" : "status-badge--tone-info"}`;
  }

  setText("#evacuation-visitor-count", String(evacuation.counts?.visitorsInside || 0));
  setText("#evacuation-workforce-count", String(evacuation.counts?.workforceInside || 0));
  setText("#evacuation-unaccounted-count", String(unaccounted));

  const filteredIncidents = state.emergencyIncidentFilter === "ALL"
    ? incidents
    : incidents.filter((incident) => incident.type === state.emergencyIncidentFilter || incident.severity === state.emergencyIncidentFilter || incident.status === state.emergencyIncidentFilter);

  renderWorkList("#emergency-feed-list", filteredIncidents.slice(0, 16), emergencyIncidentCard, "No emergency incidents", "Panic, suspicious activity, evacuation, and broadcast incidents will appear here.");
  renderWorkList("#evacuation-register-list", (evacuation.unaccounted || []).slice(0, 14), evacuationPersonCard, "No unaccounted people", "Checked-in visitors and workforce will appear here during evacuation review.");
  renderWorkList("#operational-feed-list", state.operationalEvents.slice(0, 18), operationalEventCard, "No realtime operational events", "Visitor alerts, incident streams, and approval updates will appear here.");
}

function mergeOperationalEvents(batch = {}) {
  if (batch.cursor) {
    state.operationalEventCursor = batch.cursor;
  }
  const events = Array.isArray(batch.events) ? batch.events : [];
  if (!events.length) {
    return;
  }
  const byId = new Map(state.operationalEvents.map((event) => [event.id, event]));
  events.forEach((event) => {
    if (event?.id) {
      byId.set(event.id, event);
    }
  });
  state.operationalEvents = Array.from(byId.values())
    .sort((left, right) => Date.parse(right.occurredAt || 0) - Date.parse(left.occurredAt || 0))
    .slice(0, 80);
}

function emergencyAlertTitle(emergencyState, activeIncidents) {
  if (emergencyState?.lockdownActive) {
    return "Emergency lockdown active";
  }
  if (emergencyState?.evacuationActive) {
    return "Evacuation register active";
  }
  const panic = activeIncidents.find((incident) => incident.type === "PANIC_TRIGGERED");
  if (panic) {
    return panic.title || "Panic alert active";
  }
  return emergencyState?.latestBroadcastTitle || "Emergency operations clear";
}

function emergencyAlertBody(emergencyState, activeIncidents) {
  if (emergencyState?.lockdownActive) {
    return [emergencyState.lockdownReason, emergencyState.lockdownScope, emergencyState.lockdownInitiatedByName].filter(Boolean).join(" · ") || "Visitor approvals and new check-ins are suspended.";
  }
  if (emergencyState?.evacuationActive) {
    return [emergencyState.evacuationScope, formatDate(emergencyState.evacuationStartedAt)].filter(Boolean).join(" · ") || "Monitor the evacuation register until everyone is accounted for.";
  }
  const panic = activeIncidents.find((incident) => incident.type === "PANIC_TRIGGERED");
  if (panic) {
    return [panic.checkpoint, panic.notes, formatDate(panic.createdAt)].filter(Boolean).join(" · ");
  }
  return emergencyState?.latestBroadcastMessage || "No active lockdown, evacuation, or panic alert.";
}

function emergencyIncidentCard(incident) {
  const tone = incident.severity === "CRITICAL" ? "tone-danger" : incident.severity === "HIGH" ? "tone-warning" : "tone-info";
  return `
    <article class="work-card emergency-incident-card">
      <div class="emergency-incident-card__header">
        <div>
          <h3>${escapeHtml(incident.title || "Emergency incident")}</h3>
          <p>${escapeHtml(incident.message || incident.notes || "Incident recorded.")}</p>
        </div>
        <span class="status-badge status-badge--${escapeHtml(tone)}">${escapeHtml(incident.severity || "INFO")}</span>
      </div>
      <small>${escapeHtml(formatIncidentType(incident.type))} · ${escapeHtml(incident.checkpoint || "No checkpoint")} · ${escapeHtml(formatDate(incident.createdAt))}</small>
      ${incident.subjectName ? `<small>${escapeHtml(incident.subjectType || "Subject")}: ${escapeHtml(incident.subjectName)}</small>` : ""}
      ${incident.subjectId ? `<button class="button button--ghost button--compact" type="button" data-emergency-subject="${escapeHtml(incident.subjectId)}">Copy subject ID</button>` : ""}
    </article>
  `;
}

function evacuationPersonCard(person) {
  return `
    <article class="work-card evacuation-person-card">
      <h3>${escapeHtml(person.name || "Person")}</h3>
      <p>${escapeHtml(person.personType || "Record")} · ${escapeHtml(person.department || "Department pending")} · ${escapeHtml(person.organizationName || "Organization")}</p>
      <small>${escapeHtml(person.lastKnownCheckpoint || "Last checkpoint pending")} · ${escapeHtml(formatDate(person.lastActivityAt))}</small>
      <span class="status-badge status-badge--tone-warning">${escapeHtml(person.evacuationStatus || "UNACCOUNTED")}</span>
    </article>
  `;
}

function operationalEventCard(event) {
  return `
    <article class="work-card operational-event-card operational-event-card--${escapeHtml(event.severity || "info")}">
      <div class="emergency-incident-card__header">
        <div>
          <h3>${escapeHtml(event.title || formatIncidentType(event.type))}</h3>
          <p>${escapeHtml(event.detail || event.targetName || "Operational update recorded.")}</p>
        </div>
        <span class="status-badge ${escapeHtml(operationalSeverityClass(event.severity))}">${escapeHtml(event.category || "audit")}</span>
      </div>
      <small>${escapeHtml(event.organizationName || "Current organization")} · ${escapeHtml(event.actorName || "System")} · ${escapeHtml(formatDate(event.occurredAt))}</small>
    </article>
  `;
}

function operationalSeverityClass(severity) {
  if (severity === "emergency") {
    return "status-badge--tone-danger";
  }
  if (severity === "security" || severity === "warning") {
    return "status-badge--tone-warning";
  }
  if (severity === "approval") {
    return "status-badge--approved";
  }
  return "status-badge--tone-info";
}

function formatIncidentType(value) {
  return String(value || "OPERATIONAL_EVENT")
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function initEmployeeAttendanceWorkspace() {
  const search = document.querySelector("#employee-search");
  search?.addEventListener("input", () => {
    window.clearTimeout(state.employeeDebounce);
    state.employeeDebounce = window.setTimeout(async () => {
      state.employeeQuery = search.value.trim();
      await loadSecurityPortal(false);
    }, 240);
  });

  const form = document.querySelector("#employee-qr-form");
  const input = document.querySelector("#employee-qr-input");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await scanEmployeeValue(input?.value || "");
  });
  document.querySelector("#employee-qr-camera-button")?.addEventListener("click", startEmployeeCameraScan);

  document.querySelector("#employee-directory-list")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-employee-action]");
    if (!button) {
      return;
    }
    const employeeId = button.dataset.employeeId;
    const action = button.dataset.employeeAction;
    try {
      if (action === "badge") {
        const response = await getEmployeeBadge("/security", employeeId);
        state.activeEmployeeBadge = response?.data || null;
        openEmployeeBadgeModal(state.activeEmployeeBadge);
      }
      if (action === "check-in" || action === "check-out") {
        const reason = await promptAction({
          title: action === "check-in" ? "Manual workforce check-in" : "Manual workforce check-out",
          message: "Manual workforce presence overrides require an audit reason.",
          label: "Override reason",
          placeholder: "Identity verified at checkpoint",
          confirmLabel: action === "check-in" ? "Check in" : "Check out",
          minLength: 4,
          multiline: true,
        });
        if (!reason?.trim()) {
          showToast("Reason required", "Manual workforce overrides require a reason.");
          return;
        }
        if (action === "check-in") {
          await manualEmployeeCheckIn(employeeId, reason.trim());
          showToast("Employee checked in", "Manual override was recorded with audit details.");
        } else {
          await manualEmployeeCheckOut(employeeId, reason.trim());
          showToast("Employee checked out", "Manual override was recorded with audit details.");
        }
        await loadSecurityPortal(false);
      }
    } catch (error) {
      showToast("Employee action failed", error.message);
    }
  });
}

function initWorkforceOnboarding() {
  const form = document.querySelector("#workforce-onboarding-form");
  const photoButton = document.querySelector("#workforce-photo-button");
  if (!form) {
    return;
  }

  photoButton?.addEventListener("click", () => captureWorkforcePhoto(form));
  document.querySelector("#workforce-onboarding-result")?.addEventListener("click", (event) => {
    if (event.target.closest("[data-workforce-print]")) {
      window.print();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const payload = {
      fullName: trim(data.fullName),
      username: trim(data.username),
      email: trim(data.email),
      role: trim(data.role) || "EMPLOYEE",
      phoneCountryCode: trim(data.phoneCountryCode),
      phone: trim(data.phone),
      department: trim(data.department),
      employeeType: trim(data.employeeType),
      designation: trim(data.designation),
      shiftName: trim(data.shiftName),
      shiftStartTime: trim(data.shiftStartTime),
      shiftEndTime: trim(data.shiftEndTime),
      employeePhotoUrl: trim(data.employeePhotoUrl),
    };
    if (!payload.fullName || payload.fullName.length < 2) {
      showToast("Workforce member name required", "Enter the workforce member's full name before submitting.");
      return;
    }
    if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
      showToast("Check email", "Use a valid work email or leave it blank.");
      return;
    }
    if (!["EMPLOYEE", "SECURITY_GUARD", "RECEPTION", "OPERATOR", "MANAGER"].includes(payload.role)) {
      showToast("Check access role", "Choose a supported workforce access role.");
      return;
    }

    const submit = form.querySelector("button[type='submit']");
    submit?.toggleAttribute("disabled", true);
    try {
      const response = await createWorkforceOnboarding(payload);
      const worker = response?.data || null;
      renderWorkforceReceipt(worker);
      form.reset();
      form.querySelector("input[name='phoneCountryCode']").value = "+1";
      setText("#workforce-photo-status", "Photo optional before admin approval");
      showToast("Sent for admin approval", "QR and badge access remain inactive until an organization admin approves this workforce member.");
      await loadSecurityPortal(false);
    } catch (error) {
      showToast("Onboarding failed", error.message);
    } finally {
      submit?.toggleAttribute("disabled", false);
    }
  });
}

function renderSubmittedWorkforceRequests(requests) {
  const list = document.querySelector("#workforce-request-list");
  if (!list) {
    return;
  }
  renderWorkList(
    "#workforce-request-list",
    requests || [],
    submittedWorkforceRequestCard,
    "No submitted requests",
    "Workforce onboarding requests created by this security account will appear here with admin decision status.",
  );
}

function submittedWorkforceRequestCard(worker) {
  return `
    <article class="work-card">
      <h3>${escapeHtml(worker.fullName || "Workforce member")}</h3>
      <p>${escapeHtml(formatInternalRole((worker.roles || [])[0] || "EMPLOYEE"))} · ${escapeHtml(worker.department || "Department pending")}</p>
      <small>${escapeHtml(formatStatusText(worker.accountStatus || "PENDING_APPROVAL"))} · Submitted ${escapeHtml(formatDate(worker.workforceOnboardingCreatedAt || worker.createdAt))}</small>
      ${worker.workforceApprovedAt ? `<small>Approved ${escapeHtml(formatDate(worker.workforceApprovedAt))}</small>` : ""}
      ${worker.workforceRejectedAt ? `<small>Decision ${escapeHtml(formatDate(worker.workforceRejectedAt))}: ${escapeHtml(worker.workforceRejectionReason || "No note recorded")}</small>` : ""}
    </article>
  `;
}

function captureWorkforcePhoto(form) {
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
      setText("#workforce-photo-status", "Uploading photo...");
      const upload = await uploadWorkforcePhoto(file);
      const uploadData = upload?.data || {};
      form.querySelector("input[name='employeePhotoUrl']").value = uploadData.url || "";
      setText("#workforce-photo-status", uploadData.url ? "Photo attached to onboarding request" : "Photo upload completed");
    } catch (error) {
      setText("#workforce-photo-status", "Photo upload failed");
      showToast("Photo update failed", error.message);
    }
  }, { once: true });
  input.click();
}

function renderWorkforceReceipt(worker) {
  const target = document.querySelector("#workforce-onboarding-result");
  if (!target || !worker) {
    return;
  }
  target.innerHTML = `
    <article class="workforce-receipt">
      <div>
        <p class="eyebrow">Temporary Receipt</p>
        <h3>${escapeHtml(worker.fullName || "Workforce member")}</h3>
        <p>${escapeHtml(worker.employeeType || "Support staff")} · ${escapeHtml(worker.department || "Department pending")}</p>
        <small>Request ${escapeHtml(worker.id || "")} · ${escapeHtml(formatStatusText(worker.accountStatus || "PENDING_APPROVAL"))}</small>
      </div>
      <div class="workforce-receipt__stamp">QR inactive</div>
      <button class="button button--ghost" type="button" data-workforce-print>Print receipt</button>
    </article>
  `;
}

async function scanEmployeeValue(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    showToast("Scan needed", "Scan or paste an employee badge QR.");
    return;
  }
  const submit = document.querySelector("#employee-qr-form button[type='submit']");
  submit?.toggleAttribute("disabled", true);
  try {
    const response = await scanEmployeeQr(trimmed);
    renderEmployeeScanResult(response?.data || null);
    showToast(response?.data?.headline || "Employee scan complete", response?.data?.message || "Presence updated.");
    await loadSecurityPortal(false);
  } catch (error) {
    renderEmployeeScanFailure(error.message);
    showToast("Employee scan failed", error.message);
  } finally {
    submit?.toggleAttribute("disabled", false);
  }
}

function renderEmployeeScanIdle() {
  const target = document.querySelector("#employee-qr-result");
  if (target) {
    target.innerHTML = `<article class="qr-result qr-result--idle"><strong>Ready for employee scan</strong><p>Employee QR scans toggle presence automatically: first scan checks in, next scan checks out.</p></article>`;
  }
}

function renderEmployeeScanFailure(message) {
  const target = document.querySelector("#employee-qr-result");
  if (target) {
    target.innerHTML = `<article class="qr-result qr-result--danger"><strong>Employee QR denied</strong><p>${escapeHtml(message)}</p></article>`;
  }
}

function renderEmployeeScanResult(result) {
  const target = document.querySelector("#employee-qr-result");
  if (!target || !result) {
    return;
  }
  const employee = result.employee || {};
  const attendance = result.attendance || {};
  target.innerHTML = `
    <article class="qr-result qr-result--${result.valid ? "success" : "danger"}">
      <div class="qr-result__header">
        <div>
          <strong>${escapeHtml(result.headline || "Employee scan complete")}</strong>
          <p>${escapeHtml(result.message || "")}</p>
        </div>
        <span class="status-badge ${escapeHtml(statusBadgeClass(attendance.state === "IN" ? "CHECKED_IN" : "CHECKED_OUT"))}">${escapeHtml(formatPresenceStatus(attendance))}</span>
      </div>
      <div class="qr-result__identity">
        <div class="qr-result__photo-placeholder">${escapeHtml(employee.employeeId || "Employee")}</div>
        <dl>
          <div><dt>Employee</dt><dd>${escapeHtml(employee.fullName || "Unknown")}</dd></div>
          <div><dt>Department</dt><dd>${escapeHtml(employee.department || "Not set")}</dd></div>
          <div><dt>Designation</dt><dd>${escapeHtml(employee.designation || "Not set")}</dd></div>
          <div><dt>Shift</dt><dd>${escapeHtml(formatEmployeeShift(employee))}</dd></div>
          <div><dt>Presence</dt><dd>${escapeHtml(formatPresenceStatus(attendance))}</dd></div>
          <div><dt>Check-in</dt><dd>${escapeHtml(formatDate(attendance.checkInTime))}</dd></div>
          <div><dt>Check-out</dt><dd>${escapeHtml(formatDate(attendance.checkOutTime))}</dd></div>
        </dl>
      </div>
      ${result.recommendedAction ? `<div class="qr-result__guidance">${escapeHtml(result.recommendedAction)}</div>` : ""}
    </article>
  `;
}

async function startEmployeeCameraScan() {
  if (!("BarcodeDetector" in window) || !navigator.mediaDevices?.getUserMedia) {
    showToast("Camera scan unavailable", "Use a hardware scanner or paste the employee QR payload.");
    return;
  }
  const video = document.querySelector("#employee-qr-scan-video");
  const input = document.querySelector("#employee-qr-input");
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
    showToast("Camera unavailable", "Allow camera access or paste the employee QR payload manually.");
    return;
  }
  const scan = async () => {
    const codes = await detector.detect(video).catch(() => []);
    if (codes.length) {
      const scanned = codes[0].rawValue;
      input.value = scanned;
      stream.getTracks().forEach((track) => track.stop());
      video.classList.add("is-hidden");
      await scanEmployeeValue(scanned);
      return;
    }
    window.requestAnimationFrame(scan);
  };
  window.requestAnimationFrame(scan);
}

function renderEmployeeDirectory(employees) {
  renderWorkList("#employee-directory-list", employees, employeeCard, "No employees found", "Search employees to assist with check-in, check-out, and badge lookup.");
}

function employeeCard(employee) {
  const state = employee.currentlyIn ? "Currently in" : "Out";
  const activeAccess = employee.active && employee.accountStatus === "ACTIVE";
  return `
    <article class="work-card employee-work-card">
      <div>
        <h3>${escapeHtml(employee.fullName || "Employee")}</h3>
        <p>${escapeHtml(employee.employeeId || "No employee ID")} · ${escapeHtml(employee.department || "Unassigned")} · ${escapeHtml(employee.designation || "No designation")}</p>
        <small>${escapeHtml(formatEmployeeShift(employee))} · ${escapeHtml(activeAccess ? state : formatStatusText(employee.accountStatus || "Inactive"))}</small>
      </div>
      <div class="employee-work-card__actions">
        <button class="button button--ghost" type="button" data-employee-action="badge" data-employee-id="${escapeHtml(employee.id)}" ${activeAccess ? "" : "disabled"}>Badge</button>
        ${!activeAccess
          ? `<button class="button button--ghost" type="button" disabled>Pending admin approval</button>`
          : employee.currentlyIn
          ? `<button class="button button--ghost" type="button" data-employee-action="check-out" data-employee-id="${escapeHtml(employee.id)}">Manual check-out</button>`
          : `<button class="button button--primary" type="button" data-employee-action="check-in" data-employee-id="${escapeHtml(employee.id)}">Manual check-in</button>`}
      </div>
    </article>
  `;
}

function renderEmployeeAttendanceLogs(logs) {
  renderWorkList("#employee-attendance-log-list", logs, employeeLogCard, "No workforce presence logs", "Employee check-ins, check-outs, and manual overrides will appear here.");
}

function employeeLogCard(log) {
  return `
    <article class="work-card">
      <h3>${escapeHtml(log.employeeName || "Employee")}</h3>
      <p>${escapeHtml(log.department || "Unassigned")} · ${escapeHtml(formatPresenceStatus(log))} · ${escapeHtml(log.lastAction || "Presence")}</p>
      <small>In ${escapeHtml(formatDate(log.checkInTime))} · Out ${escapeHtml(formatDate(log.checkOutTime))} · Guard ${escapeHtml(log.securityGuardName || "System")}</small>
      ${log.overrideReason ? `<small>Override: ${escapeHtml(log.overrideReason)}</small>` : ""}
    </article>
  `;
}

function initEmployeeBadgeActions() {
  if (employeeBadgeActionsBound) {
    return;
  }
  employeeBadgeActionsBound = true;
  const modal = document.querySelector("#employee-badge-modal");
  modal?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-employee-badge-action]");
    if (!button || !state.activeEmployeeBadge) {
      if (event.target === modal) {
        closeEmployeeBadgeModal();
      }
      return;
    }
    try {
      const action = button.dataset.employeeBadgeAction;
      if (action === "close") {
        closeEmployeeBadgeModal();
      }
      if (action === "print") {
        await printEmployeeBadge(state.activeEmployeeBadge);
      }
      if (action === "png" || action === "pdf") {
        await downloadEmployeeBadge(state.activeEmployeeBadge, action);
        showToast("Employee badge downloaded", `Saved ${action.toUpperCase()} badge export.`);
      }
    } catch (error) {
      showToast("Employee badge failed", error.message);
    }
  });
}

function openEmployeeBadgeModal(badge) {
  const modal = document.querySelector("#employee-badge-modal");
  if (!modal || !badge) {
    return;
  }
  modal.classList.remove("is-hidden");
  modal.innerHTML = employeeBadgeDialogMarkup(badge);
}

function closeEmployeeBadgeModal() {
  const modal = document.querySelector("#employee-badge-modal");
  modal?.classList.add("is-hidden");
  if (modal) {
    modal.innerHTML = "";
  }
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

async function refreshBadgeListIfVisible(force = false) {
  const badgesModule = document.querySelector("#badges");
  const list = document.querySelector("#badge-list");
  if (!badgesModule || !list) {
    return;
  }

  if (badgesModule.classList.contains("is-collapsed") && !force) {
    list.innerHTML = `
      <article class="badge-empty">
        <h3>Badge station ready</h3>
        <p>Expand this module to load approved badge previews.</p>
      </article>
    `;
    return;
  }

  await renderBadgeList(state.approvedBadgeVisitors);
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
        <span class="status-badge ${escapeHtml(statusBadgeClass(tone))}">${escapeHtml(pass.validityStatus || pass.statusLabel)}</span>
      </div>
      <div class="visitor-pass-card__actions">
        <button class="button button--ghost" type="button" data-badge-open="${escapeHtml(pass.visitorId)}">Open badge</button>
      </div>
    </article>
  `;
}

function initBadgeActions() {
  if (securityBadgeActionsBound) {
    return;
  }
  securityBadgeActionsBound = true;

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-badge-open]");
    if (!button) {
      return;
    }
    try {
      const response = await getVisitorPass("/security", button.dataset.badgeOpen);
      state.activeBadge = response?.data || null;
      if (!state.activeBadge) {
        throw new Error("Badge response was empty.");
      }
      openBadgeModal(state.activeBadge);
    } catch (error) {
      showToast("Badge unavailable", error.message);
    }
  });

  document.querySelector("#security-badge-modal")?.addEventListener("click", async (event) => {
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
  void hydrateBadgePreview(modal, pass);
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
        await checkInWithQr("/security", document.querySelector("#qr-payload-input")?.value || "");
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
    showToast("Scan needed", "Scan or paste a visitor badge link.");
    return;
  }
  const submit = document.querySelector("#qr-verify-form button[type='submit']");
  submit?.toggleAttribute("disabled", true);
  submit?.classList.add("is-loading");
  submit?.setAttribute("aria-busy", "true");
  try {
    const response = await verifyQrPayload("/security", trimmed);
    state.activeVerification = response?.data || null;
    if (!state.activeVerification) {
      throw new Error("Verification response was empty.");
    }
    renderVerification(state.activeVerification);
    showToast(state.activeVerification.headline || (state.activeVerification.valid ? "Pass verified" : "Pass review required"), state.activeVerification.message);
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
      <p>Scan a visitor badge or paste its verification link to validate the live approval record, photo, and access window.</p>
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
        <span class="status-badge ${escapeHtml(statusBadgeClass(statusTone))}">${escapeHtml(result.validityStatus || result.statusLabel || result.resultCode || "Review")}</span>
      </div>
      ${result.recommendedAction ? `<div class="qr-result__guidance">${escapeHtml(result.recommendedAction)}</div>` : ""}
      ${result.recognized ? `
        <div class="qr-result__identity">
          <div class="qr-result__photo-wrap">
            ${result.photoUrl ? `<img src="${escapeHtml(result.photoUrl)}" alt="${escapeHtml(result.fullName)} photo" />` : `<div class="qr-result__photo-placeholder">No photo on file</div>`}
          </div>
          <dl>
            <div><dt>Visitor</dt><dd>${escapeHtml(result.fullName || "Unknown visitor")}</dd></div>
            <div><dt>Visitor type</dt><dd>${escapeHtml(visitorTypeLabel(result.visitorType))}</dd></div>
            <div><dt>Company</dt><dd>${escapeHtml(result.companyName || "Unlisted")}</dd></div>
            <div><dt>Vendor</dt><dd>${escapeHtml(result.vendorCompanyName || "Unlisted")}</dd></div>
            <div><dt>Host</dt><dd>${escapeHtml(result.hostEmployee || "Unassigned")}</dd></div>
            <div><dt>Host team</dt><dd>${escapeHtml(result.hostEmployeeDepartment || "Not recorded")}</dd></div>
            <div><dt>Department</dt><dd>${escapeHtml(result.department || "Not recorded")}</dd></div>
            <div><dt>Badge ID</dt><dd>${escapeHtml(result.badgeId || "Not issued")}</dd></div>
            <div><dt>Pass code</dt><dd>${escapeHtml(result.passCode || "Not issued")}</dd></div>
            <div><dt>Workflow status</dt><dd>${escapeHtml(result.statusLabel || result.status || "Not recorded")}</dd></div>
            <div><dt>Validity</dt><dd>${escapeHtml(result.validityStatus || "Not recorded")}</dd></div>
            <div><dt>Issued</dt><dd>${escapeHtml(formatDate(result.issuedAt))}</dd></div>
            <div><dt>Expires</dt><dd>${escapeHtml(formatDate(result.expiresAt))}</dd></div>
            <div><dt>Visit window</dt><dd>${escapeHtml(formatWindow(result.scheduledStartTime, result.scheduledEndTime))}</dd></div>
            <div><dt>Valid entry window</dt><dd>${escapeHtml(formatWindow(result.accessWindowStartTime, result.accessWindowEndTime))}</dd></div>
            <div><dt>Recurring validity</dt><dd>${escapeHtml(formatWindow(result.validityStartDate, result.validityEndDate))}</dd></div>
            <div><dt>Entry window</dt><dd>${escapeHtml(result.allowedEntryStartTime && result.allowedEntryEndTime ? `${result.allowedEntryStartTime} to ${result.allowedEntryEndTime}` : "Any")}</dd></div>
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
      <p>${escapeHtml(visitor.rejectionReason || "Denied by host")}</p>
      <small>${escapeHtml(formatDate(visitor.rejectedAt || visitor.updatedAt || visitor.createdAt))}</small>
    </article>
  `;
}

function recurringCard(visitor) {
  return `
    <article class="work-card">
      <h3>${escapeHtml(visitor.fullName)}</h3>
      <p>${escapeHtml(visitor.vendorCompanyName || visitor.companyName || "Unlisted vendor")} · ${escapeHtml(visitor.department || visitor.hostEmployeeDepartment || "No department")}</p>
      <small>${escapeHtml(visitorTypeLabel(visitor.visitorType))} · Valid ${escapeHtml(formatWindow(visitor.validityStartDate, visitor.validityEndDate))}</small>
    </article>
  `;
}

function attendanceCard(visitor) {
  return `
    <article class="work-card">
      <h3>${escapeHtml(visitor.fullName)}</h3>
      <p>${escapeHtml(visitor.companyName || visitor.vendorCompanyName || "Unlisted")} · ${escapeHtml(visitor.hostEmployee || "Unassigned")}</p>
      <small>In ${escapeHtml(formatDate(visitor.checkInTime))} · Out ${escapeHtml(formatDate(visitor.checkOutTime))}</small>
    </article>
  `;
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
  if (value.includes("suspended")) {
    return "suspended";
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
  if (result.resultCode === "SUSPENDED_VISITOR") {
    return "suspended";
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
  return "Pending check-in";
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

function formatEmployeeShift(employee = {}) {
  const timing = employee.shiftStartTime && employee.shiftEndTime ? `${employee.shiftStartTime}-${employee.shiftEndTime}` : "Shift timing not set";
  return `${employee.shiftName || "General Shift"} · ${timing}`;
}

function formatStatusText(value) {
  return value ? enterpriseStatusLabel(value) : "Not recorded";
}

function formatInternalRole(role) {
  return String(role || "WORKFORCE")
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatPresenceStatus(record = {}) {
  if (record.status) {
    return formatStatusText(record.status);
  }
  return record.state === "IN" ? "Inside" : "Outside";
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

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) {
    element.textContent = value;
  }
}

function trim(value) {
  const next = String(value || "").trim();
  return next || null;
}

function getEmergencyState() {
  return request("/emergency/state");
}

function getEmergencyFeed() {
  return request("/emergency/feed");
}

function getEmergencyEvacuationRegister() {
  return request("/emergency/evacuation-register");
}

function triggerEmergencyPanic(payload) {
  return request("/emergency/panic", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

function flagSuspiciousVisitor(payload) {
  return request(`/emergency/visitors/${encodeURIComponent(payload.id)}/suspicious`, {
    method: "POST",
    body: JSON.stringify({
      note: payload.note,
      checkpoint: payload.checkpoint || null,
    }),
  });
}

function flagSuspiciousWorkforce(payload) {
  return request(`/emergency/workforce/${encodeURIComponent(payload.id)}/suspicious`, {
    method: "POST",
    body: JSON.stringify({
      note: payload.note,
      checkpoint: payload.checkpoint || null,
    }),
  });
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
      const uploadData = upload?.data || {};
      await updateVisitor("/security", visitorId, {
        photoUrl: uploadData.url,
        photoPublicId: uploadData.publicId,
      });
      showToast("Photo saved", "Visitor photo is now attached to the badge.");
      await loadSecurityPortal(false);
      if (state.activeVerification?.visitorId === visitorId) {
        state.activeVerification.photoUrl = uploadData.url;
        renderVerification(state.activeVerification);
      }
    } catch (error) {
      showToast("Photo update failed", error.message);
    }
  }, { once: true });
  input.click();
}
