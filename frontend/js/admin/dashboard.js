import { request } from "../shared/httpClient.js";
import { initAppErrorBoundary, runSafely } from "../shared/appErrorBoundary.js";
import { bootstrapApplication } from "../shared/appRuntime.js";
import { createDepartment, listDepartments, updateDepartment } from "../shared/departmentApi.js";
import { getHomepageSettings, updateHomepageSettings } from "../shared/homepageApi.js";
import { createOrganization, getOrganizationWorkspace, listManagedOrganizations, listOrganizationWorkspaceItems, updateOrganization } from "../shared/organizationApi.js";
import { requireRole } from "../shared/roleGuard.js";
import { initPortalShell, renderLoadingList, renderWorkList, workCard, escapeHtml } from "../shared/portalShell.js";
import { initVisitorModule } from "../shared/visitorModule.js";
import { approveWorkforceOnboarding, listWorkforceOnboardingRequests, rejectWorkforceOnboarding, updateWorkforceOnboarding } from "../shared/accessService.js";
import { getNotifications } from "../shared/notificationApi.js";
import { showToast } from "../shared/toast.js";
import { attachFieldValidator, isEmail, validateUsername } from "../shared/validation.js";
import { initPhoneInput, phonePayload, validatePhonePayload } from "../shared/phoneInput.js";
import { formatDate as formatOrgDate } from "../shared/formatters.js";
import { initOrganizationSelector } from "../shared/organizationSelector.js";
import { ROUTE_DEFINITIONS, ROUTE_ICON_PATHS, buildPortalProfile } from "./portalProfiles.js";

const ROUTE_ALIASES = {
  analytics: "dashboard",
  users: "employees",
  departments: "departments",
  organizations: "organizations",
  reports: "reports",
  monitoring: "system-monitoring",
  visitors: "visitor-access",
  "visitor-access": "visitor-access",
  "workforce-approvals": "workforce-approvals",
  "homepage-settings": "platform-settings",
  "homepage-controls": "platform-settings",
};

let currentSession;
let portalProfile;
let currentRoute = "";
let homepageMetricOptions = [];
let homepagePreviewSource = {};
let managedOrganizations = [];
let organizationWorkspaceItems = [];
let organizationDepartmentDraft = [];
let departmentWorkspaceItems = [];
let departmentFilterOrganizationId = "";
let userDepartmentOptions = [];
let userDepartmentOrganizationId = "";
let adminRouteState = null;
let activeOrganizationWorkspace = null;

const DEFAULT_DEPARTMENT_PRESETS = [
  "Operations",
  "Security",
  "HR",
  "IT",
  "Reception",
  "Facilities",
  "Management",
];

const ORGANIZATION_TIMEZONES = [
  "Asia/Kolkata",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/Berlin",
  "Asia/Singapore",
  "Asia/Dubai",
  "Australia/Sydney",
  "UTC",
];

const INTERNAL_ROLE_DEPARTMENT_RULES = {
  EMPLOYEE: {
    mode: "manual",
    label: "Department",
    meta: "Choose an organization department or enter a new one.",
    placeholder: "Search or add a department",
    department: "",
  },
  SECURITY_GUARD: {
    mode: "locked",
    label: "Department",
    meta: "Security portal access is always assigned to the Security department.",
    placeholder: "Security",
    department: "Security",
  },
  ADMIN: {
    mode: "locked",
    label: "Department",
    meta: "Administration portal access is always assigned to the Administration department.",
    placeholder: "Administration",
    department: "Administration",
  },
};

document.addEventListener("DOMContentLoaded", () => {
  void bootstrapApplication("admin-portal", () => bootAdminPortal(), {
    redirectToLogin: true,
    failureMessage: "AccessFlow had trouble restoring the admin workspace. Refreshing workspace...",
  });
});

async function bootAdminPortal() {
  initAppErrorBoundary();

  currentSession = requireRole("ADMIN");
  if (!currentSession) {
    return;
  }

  portalProfile = buildPortalProfile(currentSession);
  const allowedRoutes = resolveAllowedRoutes();
  const routeContext = resolveRouteContext(allowedRoutes);
  if (routeContext.redirectTo) {
    window.location.replace(routeContext.redirectTo);
    return;
  }

  currentRoute = routeContext.routeKey;
  renderPortalChrome(routeContext.routeMap);
  adminRouteState = {
    allowedRoutes,
    routeMap: routeContext.routeMap,
    legacyMode: routeContext.legacyMode,
    routeLifecycleBound: false,
  };
  initPortalShell(currentSession, {
    allowedRoutes,
    activeRoute: currentRoute,
    routeMap: routeContext.routeMap,
    defaultHref: routeContext.routeMap[allowedRoutes[0]]?.href,
    portalProfile,
    onRefresh: () => loadWorkspace(currentRoute, { preserveToasts: true }),
  });

  initAdminRouteLifecycle();
  await runSafely("admin portal activation", () => activateAdminRoute(currentRoute), {
    toastTitle: "Workspace unavailable",
  });
}

function resolveRouteContext(allowedRoutes) {
  const defaultRoute = portalProfile?.defaultRoute || allowedRoutes[0];
  const normalizedPath = normalizePath(window.location.pathname);
  const legacyMode = /\/pages\/admin\/[^/]+\.html$/i.test(normalizedPath);
  const routeMap = buildRouteMap(legacyMode);
  const hashRoute = resolveAlias(window.location.hash.replace("#", ""));

  if (legacyMode) {
    const routeKey = allowedRoutes.includes(hashRoute) ? hashRoute : defaultRoute;
    return { routeKey, routeMap, legacyMode };
  }

  if (normalizedPath === "/admin") {
    const targetRoute = allowedRoutes.includes(hashRoute) ? hashRoute : defaultRoute;
    return { redirectTo: routeMap[targetRoute]?.href || routeMap[defaultRoute]?.href || "/admin/dashboard", routeMap, legacyMode };
  }

  if (normalizedPath.startsWith("/admin/")) {
    const slug = normalizedPath.slice("/admin/".length).split("/")[0];
    const routeKey = resolveAlias(slug);
    if (allowedRoutes.includes(routeKey)) {
      return { routeKey, routeMap, legacyMode };
    }
    return { redirectTo: routeMap[defaultRoute]?.href || "/admin/dashboard", routeMap, legacyMode };
  }

  const routeKey = allowedRoutes.includes(hashRoute) ? hashRoute : defaultRoute;
  return { routeKey, routeMap, legacyMode };
}

function buildRouteMap(legacyMode) {
  return Object.fromEntries(
    Object.entries(ROUTE_DEFINITIONS).map(([key, route]) => [
      key,
      {
        href: legacyMode ? `./index.html#${route.slug}` : `/admin/${route.slug}`,
      },
    ]),
  );
}

function normalizePath(pathname) {
  const value = String(pathname || "/").trim() || "/";
  const cleaned = value.replace(/\/+$/, "");
  return cleaned || "/";
}

function resolveAlias(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return portalProfile?.aliases?.[normalized] || ROUTE_ALIASES[normalized] || (ROUTE_DEFINITIONS[normalized] ? normalized : "");
}

function renderPortalChrome(routeMap) {
  if (!portalProfile) {
    return;
  }

  const shell = document.querySelector(".portal-shell");
  shell?.classList.remove("org-admin-shell", "super-admin-shell");
  shell?.classList.add(portalProfile.shellClass);
  if (shell) {
    shell.dataset.portalProfile = portalProfile.key;
  }

  const defaultHref = routeMap?.[portalProfile.defaultRoute]?.href || `/admin/${ROUTE_DEFINITIONS[portalProfile.defaultRoute].slug}`;
  document.querySelector(".sidebar")?.setAttribute("aria-label", portalProfile.sidebarLabel);
  document.querySelectorAll("[data-default-admin-link]").forEach((link) => {
    link.setAttribute("href", defaultHref);
    link.setAttribute("aria-label", portalProfile.brandLabel);
  });
  setText(".sidebar__tagline", portalProfile.sidebarTagline);
  setText(".sidebar__product", portalProfile.sidebarProduct);
  setText(".topbar__title .eyebrow", portalProfile.topbarEyebrow);
  setText(".topbar__title h1", portalProfile.topbarTitle);
  setText(".topbar__tagline", portalProfile.topbarTagline);

  const nav = document.querySelector("#sidebar-nav");
  if (!nav) {
    return;
  }

  nav.innerHTML = portalProfile.navSections.map((section) => `
    <section class="nav-section" aria-label="${escapeHtml(section.label)}">
      <p class="nav-section__label">${escapeHtml(section.label)}</p>
      ${section.routes.map((routeKey) => navLink(routeKey, routeMap)).join("")}
    </section>
  `).join("");
}

function navLink(routeKey, routeMap) {
  const route = ROUTE_DEFINITIONS[routeKey];
  const href = routeMap?.[routeKey]?.href || `/admin/${route.slug}`;
  const iconPath = ROUTE_ICON_PATHS[routeKey] || ROUTE_ICON_PATHS.dashboard;
  return `
    <a class="nav-link" href="${escapeHtml(href)}" data-route="${escapeHtml(routeKey)}">
      <span class="nav-link__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${escapeHtml(iconPath)}"/></svg></span>
      <span>${escapeHtml(route.navLabel)}</span>
    </a>
  `;
}

function renderWorkspaceFrame(route) {
  document.title = `AccessFlow | ${route.navLabel}`;
  setText("#workspace-eyebrow", route.eyebrow);
  setText("#workspace-title", route.title);
  setText("#workspace-description", route.description);

  const badges = document.querySelector("#workspace-badges");
  if (badges) {
    badges.innerHTML = route.badges.map((badge) => `<span class="workspace-badge">${escapeHtml(badge)}</span>`).join("");
  }

  const view = document.querySelector("#workspace-view");
  if (view) {
    view.innerHTML = workspaceTemplate(currentRoute);
  }
}

function workspaceTemplate(routeKey) {
  switch (routeKey) {
    case "dashboard":
      return analyticsTemplate();
    case "platform-analytics":
      return platformAnalyticsTemplate();
    case "employees":
      return usersTemplate();
    case "departments":
      return departmentsTemplate();
    case "organizations":
      return organizationsTemplate();
    case "platform-settings":
      return homepageControlsTemplate();
    case "tenant-health":
      return tenantHealthTemplate();
    case "global-audit":
      return reportsTemplate();
    case "workforce-oversight":
      return workforceOversightTemplate();
    case "security-monitoring":
      return securityMonitoringTemplate();
    case "system-monitoring":
    case "runtime-status":
    case "api-health":
      return monitoringTemplate();
    case "feature-flags":
      return featureFlagsTemplate();
    case "reports":
      return reportsTemplate();
    case "attendance-presence":
      return attendancePresenceTemplate();
    case "notifications":
      return notificationsTemplate();
    case "organization-settings":
      return organizationSettingsTemplate();
    case "visitor-access":
      return visitorsTemplate();
    case "workforce-approvals":
      return workforceApprovalsTemplate();
    default:
      return `
        <article class="empty-state">
          <h3>Workspace unavailable</h3>
          <p>The requested admin workspace could not be rendered.</p>
        </article>
      `;
  }
}

function analyticsTemplate() {
  return `
    <section class="workspace-stack">
      <section class="metric-grid admin-metric-grid" id="metric-grid" aria-label="Admin analytics"></section>
      <section class="analytics-recovery" id="analytics-recovery" hidden></section>

      <section class="analytics-chart-grid" aria-label="Visitor analytics charts">
        <article class="panel chart-panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Daily Flow</p>
              <h3>Daily Visitors</h3>
            </div>
          </div>
          <div class="chart-stage" id="daily-visitors-chart"></div>
        </article>

        <article class="panel chart-panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Trend</p>
              <h3>Monthly Visitors</h3>
            </div>
          </div>
          <div class="chart-stage" id="monthly-trends-chart"></div>
        </article>

        <article class="panel chart-panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Operations</p>
              <h3>Peak Hours</h3>
            </div>
          </div>
          <div class="chart-stage" id="peak-hours-chart"></div>
        </article>

        <article class="panel chart-panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Decisions</p>
              <h3>Approval Rates</h3>
            </div>
          </div>
          <div class="chart-stage" id="approval-rates-chart"></div>
        </article>
      </section>

      <section class="workspace-grid workspace-grid--split">
        <article class="panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Live Operations</p>
              <h3>Active Access State</h3>
            </div>
          </div>
          <div class="operational-intel-grid" id="live-operations-grid"></div>
        </article>

        <article class="panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Actionable Intelligence</p>
              <h3>Operational Insights</h3>
            </div>
          </div>
          <div class="operational-insight-list" id="operational-insights-list"></div>
        </article>
      </section>

      <section class="panel chart-panel chart-panel--wide">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Traffic Heatmap</p>
            <h3>Busiest Entry Hours</h3>
          </div>
        </div>
        <div class="chart-stage" id="traffic-heatmap-chart"></div>
      </section>

      <section class="analytics-chart-grid" aria-label="Operational intelligence charts">
        <article class="panel chart-panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Workforce Movement</p>
              <h3>Rush Periods</h3>
            </div>
          </div>
          <div class="chart-stage" id="workforce-rush-chart"></div>
        </article>

        <article class="panel chart-panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Denied Entry</p>
              <h3>Denial Trend</h3>
            </div>
          </div>
          <div class="chart-stage" id="denial-trends-chart"></div>
        </article>

        <article class="panel chart-panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Incidents</p>
              <h3>Incident Spikes</h3>
            </div>
          </div>
          <div class="chart-stage" id="incident-trends-chart"></div>
        </article>
      </section>

      <section class="workspace-grid workspace-grid--split">
        <article class="panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Repeat Traffic</p>
              <h3>Visitor Intelligence</h3>
            </div>
          </div>
          <div class="operational-signal-list" id="repeat-visitor-list"></div>
        </article>

        <article class="panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Security</p>
              <h3>Denials and Incidents</h3>
            </div>
          </div>
          <div class="operational-signal-list" id="security-intelligence-list"></div>
        </article>
      </section>

      <section class="workspace-grid workspace-grid--split">
        <article class="panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Workforce Access</p>
              <h3>Anomaly Detection</h3>
            </div>
          </div>
          <div class="operational-signal-list" id="workforce-anomaly-list"></div>
        </article>

        <article class="panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Site Scope</p>
              <h3>Organization and Checkpoints</h3>
            </div>
          </div>
          <div class="operational-signal-list" id="site-scope-list"></div>
        </article>
      </section>

      <section class="panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Historical Reporting</p>
            <h3>Operational Snapshots</h3>
          </div>
        </div>
        <div class="operational-export-grid" id="operational-export-grid"></div>
      </section>

      <section class="panel employee-analytics-panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Host Performance</p>
            <h3>Employee-wise Analytics</h3>
          </div>
        </div>
        <div class="employee-analytics-table" id="employee-analytics-table"></div>
      </section>

      <section class="panel employee-analytics-panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Workforce Presence</p>
            <h3>Access Presence</h3>
          </div>
        </div>
        <div class="employee-analytics-table" id="workforce-attendance-table"></div>
      </section>
    </section>
  `;
}

function platformAnalyticsTemplate() {
  return `
    <section class="workspace-stack">
      <section class="metric-grid admin-metric-grid" id="metric-grid" aria-label="Platform analytics"></section>
      <section class="analytics-recovery" id="analytics-recovery" hidden></section>

      <section class="workspace-grid workspace-grid--split">
        <article class="panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Tenant Health</p>
              <h3>Organization Readiness</h3>
            </div>
          </div>
          <div class="work-list" id="tenant-health-list"></div>
        </article>

        <article class="panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Runtime</p>
              <h3>Platform Signals</h3>
            </div>
          </div>
          <div class="work-list" id="security-overview-list"></div>
        </article>
      </section>

      <section class="analytics-chart-grid" aria-label="System-wide visitor analytics">
        <article class="panel chart-panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Usage</p>
              <h3>Daily Platform Visitors</h3>
            </div>
          </div>
          <div class="chart-stage" id="daily-visitors-chart"></div>
        </article>

        <article class="panel chart-panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Growth</p>
              <h3>Monthly Platform Trend</h3>
            </div>
          </div>
          <div class="chart-stage" id="monthly-trends-chart"></div>
        </article>
      </section>

      <section class="workspace-grid workspace-grid--split">
        <article class="panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Platform Operations</p>
              <h3>Live Access State</h3>
            </div>
          </div>
          <div class="operational-intel-grid" id="live-operations-grid"></div>
        </article>

        <article class="panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Platform Intelligence</p>
              <h3>Operational Insights</h3>
            </div>
          </div>
          <div class="operational-insight-list" id="operational-insights-list"></div>
        </article>
      </section>

      <section class="panel chart-panel chart-panel--wide">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Cross-tenant Traffic</p>
            <h3>Busiest Entry Hours</h3>
          </div>
        </div>
        <div class="chart-stage" id="traffic-heatmap-chart"></div>
      </section>

      <section class="analytics-chart-grid" aria-label="Platform operational intelligence charts">
        <article class="panel chart-panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Workforce Movement</p>
              <h3>Rush Periods</h3>
            </div>
          </div>
          <div class="chart-stage" id="workforce-rush-chart"></div>
        </article>

        <article class="panel chart-panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Denied Entry</p>
              <h3>Denial Trend</h3>
            </div>
          </div>
          <div class="chart-stage" id="denial-trends-chart"></div>
        </article>

        <article class="panel chart-panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Incidents</p>
              <h3>Incident Spikes</h3>
            </div>
          </div>
          <div class="chart-stage" id="incident-trends-chart"></div>
        </article>
      </section>

      <section class="workspace-grid workspace-grid--split">
        <article class="panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Repeat Traffic</p>
              <h3>Visitor Intelligence</h3>
            </div>
          </div>
          <div class="operational-signal-list" id="repeat-visitor-list"></div>
        </article>

        <article class="panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Security</p>
              <h3>Denials and Incidents</h3>
            </div>
          </div>
          <div class="operational-signal-list" id="security-intelligence-list"></div>
        </article>
      </section>

      <section class="workspace-grid workspace-grid--split">
        <article class="panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Workforce Access</p>
              <h3>Anomaly Detection</h3>
            </div>
          </div>
          <div class="operational-signal-list" id="workforce-anomaly-list"></div>
        </article>

        <article class="panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Site Scope</p>
              <h3>Organizations and Checkpoints</h3>
            </div>
          </div>
          <div class="operational-signal-list" id="site-scope-list"></div>
        </article>
      </section>

      <section class="panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Historical Reporting</p>
            <h3>Operational Snapshots</h3>
          </div>
        </div>
        <div class="operational-export-grid" id="operational-export-grid"></div>
      </section>
    </section>
  `;
}

function usersTemplate() {
  return `
    <section class="workspace-grid workspace-grid--split">
      <article class="panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Provisioning</p>
            <h3>Create Internal Account</h3>
          </div>
        </div>
        <form class="admin-user-form" id="admin-user-form" novalidate>
          <label class="form-field">
            <span>Full name</span>
            <input name="fullName" type="text" autocomplete="name" placeholder="Team member name" required />
          </label>
          <label class="form-field">
            <span>Username</span>
            <input name="username" type="text" autocomplete="username" placeholder="employee01" required />
          </label>
          <label class="form-field">
            <span>Email</span>
            <input name="email" type="email" autocomplete="email" placeholder="person@company.com" required />
          </label>
          <label class="form-field">
            <span>Mobile</span>
            <input name="phone" type="tel" autocomplete="tel" placeholder="Mobile number" />
          </label>
          <label class="form-field">
            <span>Temporary password</span>
            <input name="password" type="password" autocomplete="new-password" placeholder="12+ characters" required />
          </label>
          <label class="form-field">
            <span>Portal access</span>
            <select name="role" required>
              <option value="EMPLOYEE">Employee portal</option>
              <option value="SECURITY_GUARD">Security portal</option>
              <option value="ADMIN">Administration portal</option>
            </select>
          </label>
          <label class="form-field" data-company-code-field>
            <span>Organization</span>
            <input name="companyCode" type="hidden" data-organization-selector data-organization-label="Account organization" />
          </label>
          <label class="form-field form-field--wide" data-department-field>
            <span id="department-field-label">Department</span>
            <input name="department" type="text" list="department-options" autocomplete="off" placeholder="Search or add a department" />
            <datalist id="department-options"></datalist>
            <small class="form-field__message form-field__message--inline" id="department-field-meta">Choose an organization department or enter a new one.</small>
          </label>
          <label class="form-field" data-employee-workforce-field>
            <span>Designation</span>
            <input name="designation" type="text" autocomplete="organization-title" placeholder="Operations associate" />
          </label>
          <label class="form-field" data-employee-workforce-field>
            <span>Employee type</span>
            <select name="employeeType">
              <option value="FULL_TIME">Full-time</option>
              <option value="CONTRACT">Contract</option>
              <option value="PART_TIME">Part-time</option>
              <option value="HELPER">Helper</option>
              <option value="MAINTENANCE">Maintenance</option>
            </select>
          </label>
          <label class="form-field" data-employee-workforce-field>
            <span>Shift timing</span>
            <input name="shiftName" type="text" placeholder="Morning Shift" value="General Shift" />
          </label>
          <label class="form-field" data-employee-workforce-field>
            <span>Shift start</span>
            <input name="shiftStartTime" type="time" value="09:00" />
          </label>
          <label class="form-field" data-employee-workforce-field>
            <span>Shift end</span>
            <input name="shiftEndTime" type="time" value="18:00" />
          </label>
          <div class="admin-user-form__footer">
            <p>Visitor accounts are created through public onboarding. Workforce access is issued internally.</p>
            <button class="button button--primary" type="submit">Create internal account</button>
          </div>
        </form>
      </article>

      <article class="panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Directory</p>
            <h3>Internal Account Management</h3>
          </div>
        </div>
        <div class="work-list" id="user-management-list"></div>
      </article>
    </section>
  `;
}

function workforceApprovalsTemplate() {
  return `
    <section class="workspace-stack">
      <article class="panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Pending Requests</p>
            <h3>Support Staff Onboarding</h3>
          </div>
        </div>
        <div class="work-list" id="workforce-approval-list"></div>
      </article>
    </section>
  `;
}

function departmentsTemplate() {
  const organizationField = hasRole("SUPER_ADMIN") ? `
    <label class="form-field department-toolbar__field">
      <span>Organization</span>
      <select name="organizationId" id="department-organization-filter">
        <option value="">All organizations</option>
      </select>
    </label>
  ` : "";

  return `
    <section class="workspace-grid workspace-grid--split">
      <article class="panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Department Controls</p>
            <h3>Manage Departments</h3>
          </div>
        </div>
        <form class="department-toolbar" id="department-form" novalidate>
          ${organizationField}
          <label class="form-field department-toolbar__field department-toolbar__field--grow">
            <span>New department</span>
            <input name="departmentName" type="text" autocomplete="organization-title" placeholder="Procurement" />
          </label>
          <div class="department-toolbar__actions">
            <p id="department-management-meta">Departments stay isolated to each organization and remain available for fast account setup.</p>
            <button class="button button--primary" type="submit">Add department</button>
          </div>
        </form>
      </article>

      <article class="panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Department Directory</p>
            <h3>Configured Departments</h3>
          </div>
        </div>
        <div class="work-list" id="departments-list"></div>
      </article>
    </section>
  `;
}

function organizationsTemplate() {
  return `
    <section class="workspace-stack">
      <article class="panel organization-directory-hero">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Platform Tenancy</p>
            <h3>Organization Directory</h3>
            <p class="panel__subtle">Operate tenants as managed entities with search, health signals, and dedicated workspaces instead of editing static forms inline.</p>
          </div>
          <div class="organization-directory-hero__actions">
            <button class="button button--ghost" id="organization-refresh" type="button">Refresh directory</button>
            <button class="button button--primary" id="organization-create-open" type="button">New organization</button>
          </div>
        </div>
        <div class="organization-summary-grid" id="organization-summary-grid"></div>
      </article>

      <article class="panel">
        <div class="organization-toolbar">
          <label class="search-field organization-toolbar__search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20 18.6-4.2-4.2a7 7 0 1 0-1.4 1.4l4.2 4.2ZM5 10a5 5 0 1 1 5 5 5 5 0 0 1-5-5Z"/></svg>
            <input id="organization-search" type="search" placeholder="Search organization name, code, or contact" />
          </label>
          <label class="form-field organization-toolbar__field">
            <span>Status</span>
            <select id="organization-status-filter">
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <label class="form-field organization-toolbar__field">
            <span>Sort by</span>
            <select id="organization-sort">
              <option value="companyName">Name</option>
              <option value="createdAt">Created date</option>
              <option value="recentVisitorCount">Recent visitor activity</option>
              <option value="adminCount">Admin count</option>
            </select>
          </label>
        </div>
        <div class="organization-table-wrap">
          <table class="organization-table">
            <thead>
              <tr>
                <th>Organization</th>
                <th>Admins</th>
                <th>Employees</th>
                <th>Visitor activity</th>
                <th>Status</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="organizations-list"></tbody>
          </table>
        </div>
        <div class="organization-list-empty empty-state empty-state--inline is-hidden" id="organizations-empty">
          <h3>No organizations match</h3>
          <p>Try a different search or create a new tenant workspace.</p>
        </div>
      </article>
    </section>
    <div class="visitor-modal is-hidden organization-workspace-modal" id="organization-workspace-modal"></div>
  `;
}

function homepageControlsTemplate() {
  return `
    <section class="workspace-grid homepage-controls-layout">
      <article class="panel homepage-controls-panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Public Website</p>
            <h3>Homepage Controls</h3>
            <p class="panel__subtle">Adjust public messaging, signal density, and metric visibility from one structured configuration workspace.</p>
          </div>
        </div>
        <form class="homepage-settings-form" id="homepage-settings-form" novalidate>
          <section class="settings-card">
            <div class="settings-card__header">
              <div>
                <p class="eyebrow">Visibility</p>
                <h4>Section toggles</h4>
              </div>
              <p>Keep the homepage lean by enabling only the modules that have an operational purpose.</p>
            </div>
            <div class="settings-toggle-grid">
              ${homepageToggleField("statsVisible", "Homepage stats", "Allow public data modules to render at all.")}
              ${homepageToggleField("featuredMetricsVisible", "Featured metrics", "Show the primary metrics band beneath the hero.")}
              ${homepageToggleField("publicCountersVisible", "Hero counters", "Surface counters directly inside the hero summary row.")}
              ${homepageToggleField("announcementVisible", "Announcement banner", "Publish short updates without adding long-form content.")}
            </div>
          </section>

          <section class="settings-card">
            <div class="settings-card__header">
              <div>
                <p class="eyebrow">Announcement</p>
                <h4>Public message</h4>
              </div>
              <p>Use concise messaging for maintenance windows, onboarding guidance, or launch updates.</p>
            </div>
            <div class="settings-field-grid">
              <label class="form-field form-field--wide">
                <span>Announcement title</span>
                <input name="announcementTitle" type="text" maxlength="80" placeholder="Platform update" />
              </label>
              <label class="form-field form-field--wide">
                <span>Announcement body</span>
                <textarea name="announcementBody" rows="4" maxlength="240" placeholder="Use this space for scheduled maintenance, launch updates, or onboarding guidance."></textarea>
              </label>
            </div>
          </section>

          <section class="settings-card">
            <div class="settings-card__header">
              <div>
                <p class="eyebrow">Metric Sets</p>
                <h4>Featured metrics and counters</h4>
              </div>
              <p>Select only the metrics that help a visitor or stakeholder understand platform scale at a glance.</p>
            </div>
            <div class="homepage-settings-form__selectors">
              <fieldset class="metric-selector">
                <legend>Featured metrics</legend>
                <div class="metric-selector__options" id="featured-metrics-options"></div>
              </fieldset>
              <fieldset class="metric-selector">
                <legend>Public counters</legend>
                <div class="metric-selector__options" id="public-counters-options"></div>
              </fieldset>
            </div>
          </section>

          <div class="homepage-settings-form__footer">
            <p id="homepage-settings-meta">Homepage controls are ready to configure.</p>
            <button class="button button--primary" type="submit">Save homepage settings</button>
          </div>
        </form>
      </article>

      <aside class="panel homepage-preview-panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Live Preview</p>
            <h3>Public Homepage Output</h3>
            <p class="panel__subtle">This preview mirrors the current control selections so layout and hierarchy stay visible while you edit.</p>
          </div>
        </div>
        <div class="homepage-preview" id="homepage-settings-preview"></div>
      </aside>
    </section>
  `;
}

function homepageToggleField(name, title, description) {
  return `
    <label class="toggle-card">
      <input name="${escapeHtml(name)}" type="checkbox" />
      <span class="toggle-card__content">
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(description)}</small>
      </span>
      <span class="toggle-card__switch" aria-hidden="true"></span>
    </label>
  `;
}

function reportsTemplate() {
  return `
    <article class="panel">
      <div class="panel__header">
        <div>
          <p class="eyebrow">Exports</p>
          <h3>Reports</h3>
        </div>
      </div>
      <div class="work-list" id="reports-list"></div>
    </article>
  `;
}

function monitoringTemplate() {
  return `
    <section class="workspace-stack">
      <section class="metric-grid admin-monitoring-grid" id="monitoring-summary"></section>

      <section class="workspace-grid workspace-grid--split">
        <article class="panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Health</p>
              <h3>Platform Status</h3>
            </div>
          </div>
          <div class="health-card" id="health-card"></div>
        </article>

        <article class="panel">
          <div class="panel__header">
            <div>
              <p class="eyebrow">Signals</p>
              <h3>System Monitoring</h3>
            </div>
          </div>
          <div class="work-list" id="monitoring-list"></div>
        </article>
      </section>
    </section>
  `;
}

function tenantHealthTemplate() {
  return `
    <section class="workspace-stack">
      <section class="metric-grid admin-metric-grid" id="tenant-health-summary"></section>
      <article class="panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Tenant Readiness</p>
            <h3>Organizations</h3>
          </div>
        </div>
        <div class="work-list" id="tenant-health-list"></div>
      </article>
    </section>
  `;
}

function workforceOversightTemplate() {
  return `
    <article class="panel">
      <div class="panel__header">
        <div>
          <p class="eyebrow">Cross-Tenant Workforce</p>
          <h3>Identity Oversight</h3>
        </div>
      </div>
      <p class="panel__subtle">This platform view is intentionally read-heavy. Organization operators keep day-to-day employee changes inside their own workspace.</p>
      <div class="work-list" id="user-management-list"></div>
    </article>
  `;
}

function securityMonitoringTemplate() {
  return `
    <section class="workspace-stack">
      <section class="metric-grid admin-monitoring-grid" id="security-summary"></section>
      <article class="panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Privileged Events</p>
            <h3>Security Signals</h3>
          </div>
        </div>
        <div class="work-list" id="security-monitoring-list"></div>
      </article>
    </section>
  `;
}

function featureFlagsTemplate() {
  return `
    <article class="panel">
      <div class="panel__header">
        <div>
          <p class="eyebrow">Controlled Rollout</p>
          <h3>Feature Flags</h3>
        </div>
      </div>
      <div class="feature-flag-grid">
        ${featureFlagCard("Organization impersonation", "Planned", "Foundation is separated so a future impersonation workflow can enter tenant context safely.")}
        ${featureFlagCard("Tenant health alerts", "Planned", "Health surfaces are isolated from organization operations and ready for alert thresholds.")}
        ${featureFlagCard("Public analytics controls", "Active", "Homepage metric controls remain platform-owned and unavailable to organization admins.")}
      </div>
    </article>
  `;
}

function featureFlagCard(title, status, detail) {
  return `
    <article class="admin-user-card">
      <div class="admin-user-card__header">
        <h3>${escapeHtml(title)}</h3>
        ${statusBadge(status)}
      </div>
      <p>${escapeHtml(detail)}</p>
    </article>
  `;
}

function attendancePresenceTemplate() {
  return `
    <section class="workspace-stack">
      <section class="metric-grid admin-metric-grid" id="attendance-summary"></section>
      <article class="panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Presence Logs</p>
            <h3>Workforce Attendance</h3>
          </div>
        </div>
        <div class="employee-analytics-table" id="attendance-presence-table"></div>
      </article>
    </section>
  `;
}

function notificationsTemplate() {
  return `
    <article class="panel">
      <div class="panel__header">
        <div>
          <p class="eyebrow">Recent Alerts</p>
          <h3>Notifications</h3>
        </div>
      </div>
      <div class="work-list" id="notifications-workspace-list"></div>
    </article>
  `;
}

function organizationSettingsTemplate() {
  return `
    <section class="workspace-stack">
      <section class="metric-grid admin-metric-grid" id="organization-settings-summary"></section>
      <article class="panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Organization Context</p>
            <h3>Settings Overview</h3>
          </div>
        </div>
        <div class="work-list" id="organization-settings-list"></div>
      </article>
    </section>
  `;
}

function visitorsTemplate() {
  return `<article class="panel workspace-visitor-panel" data-admin-visitors></article>`;
}

function initAdminRouteLifecycle() {
  if (!adminRouteState || adminRouteState.routeLifecycleBound) {
    return;
  }

  adminRouteState.routeLifecycleBound = true;

  if (adminRouteState.legacyMode) {
    window.addEventListener("hashchange", () => {
      void syncRouteFromLocation();
    });
    return;
  }

  document.querySelector("#sidebar-nav")?.addEventListener("click", (event) => {
    const link = event.target.closest(".nav-link[data-route]");
    if (!link) {
      return;
    }

    const routeKey = link.dataset.route;
    if (!isAllowedAdminRoute(routeKey)) {
      return;
    }

    event.preventDefault();
    void navigateToAdminRoute(routeKey);
  });

  document.querySelectorAll("[data-default-admin-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      const defaultRoute = adminRouteState?.allowedRoutes?.[0];
      if (!defaultRoute) {
        return;
      }

      event.preventDefault();
      void navigateToAdminRoute(defaultRoute);
    });
  });

  window.addEventListener("popstate", () => {
    void syncRouteFromLocation();
  });
}

async function syncRouteFromLocation() {
  if (!adminRouteState) {
    return;
  }

  const routeContext = resolveRouteContext(adminRouteState.allowedRoutes);
  if (routeContext.redirectTo) {
    window.location.replace(routeContext.redirectTo);
    return;
  }

  if (routeContext.routeKey === currentRoute) {
    syncAdminRouteNavigation(currentRoute);
    return;
  }

  await activateAdminRoute(routeContext.routeKey, { preserveToasts: true });
}

async function navigateToAdminRoute(routeKey) {
  if (!adminRouteState || !isAllowedAdminRoute(routeKey)) {
    return;
  }

  if (routeKey === currentRoute) {
    collapseAdminSidebarForNavigation();
    return;
  }

  const href = adminRouteState.routeMap?.[routeKey]?.href;
  if (!href) {
    return;
  }

  if (adminRouteState.legacyMode) {
    window.location.hash = ROUTE_DEFINITIONS[routeKey].slug;
    return;
  }

  window.history.pushState({}, "", href);
  await activateAdminRoute(routeKey, { preserveToasts: true });
}

function syncAdminRouteNavigation(routeKey) {
  if (!adminRouteState) {
    return;
  }

  const validRoutes = new Set(adminRouteState.allowedRoutes);
  document.querySelectorAll("#sidebar-nav .nav-link").forEach((link) => {
    const route = link.dataset.route;
    const allowed = validRoutes.has(route);
    link.hidden = !allowed;
    link.setAttribute("aria-hidden", String(!allowed));
    if (allowed && adminRouteState.routeMap?.[route]?.href) {
      link.setAttribute("href", adminRouteState.routeMap[route].href);
    }
    const isActive = allowed && route === routeKey;
    link.classList.toggle("is-active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  const fallbackHref = adminRouteState.routeMap?.[adminRouteState.allowedRoutes[0]]?.href || "/admin/dashboard";
  document.querySelectorAll("[data-default-admin-link]").forEach((link) => {
    link.setAttribute("href", fallbackHref);
  });
}

async function activateAdminRoute(routeKey, options = {}) {
  if (!ROUTE_DEFINITIONS[routeKey]) {
    return;
  }

  currentRoute = routeKey;
  collapseAdminSidebarForNavigation();
  syncAdminRouteNavigation(routeKey);
  renderWorkspaceFrame(ROUTE_DEFINITIONS[routeKey]);
  let initialized = true;
  try {
    initWorkspace(routeKey);
  } catch (error) {
    initialized = false;
    renderWorkspaceError("Workspace module failed", error.message);
    showToast("Workspace module unavailable", error.message);
  }
  window.scrollTo(0, 0);
  if (initialized) {
    await loadWorkspace(routeKey, options);
  }
}

function isAllowedAdminRoute(routeKey) {
  return Boolean(adminRouteState?.allowedRoutes?.includes(routeKey));
}

function collapseAdminSidebarForNavigation() {
  if (!window.matchMedia("(max-width: 1024px)").matches) {
    return;
  }

  const shell = document.querySelector(".portal-shell");
  if (shell) {
    shell.dataset.sidebarState = "closed";
  }
  document.body.classList.remove("has-mobile-sidebar");
}

function initWorkspace(routeKey) {
  switch (routeKey) {
    case "employees":
      initAdminUserForm();
      break;
    case "departments":
      initDepartmentWorkspace();
      break;
    case "organizations":
      initOrganizationsWorkspace();
      break;
    case "platform-settings":
      initHomepageSettingsForm();
      break;
    case "visitor-access":
      initVisitorModule("[data-admin-visitors]", {
        basePath: "/admin",
        title: "Full Visitor Access",
        eyebrow: "Visitor Records",
        canDelete: true,
        showOrganizationCodeField: false,
        requireOrganizationCode: false,
        organizationCode: currentSession.organizationCode,
      });
      break;
    case "workforce-approvals":
      initWorkforceApprovalsWorkspace();
      break;
    default:
      break;
  }
}

function renderWorkspaceError(title, message) {
  const view = document.querySelector("#workspace-view");
  if (!view) {
    return;
  }
  view.innerHTML = `
    <article class="empty-state">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message || "This workspace could not initialize, but the portal shell remains available.")}</p>
    </article>
  `;
}

async function loadWorkspace(routeKey, options = {}) {
  const { preserveToasts = false } = options;

  try {
    switch (routeKey) {
      case "dashboard":
        await loadAnalyticsWorkspace();
        break;
      case "platform-analytics":
        await loadPlatformAnalyticsWorkspace();
        break;
      case "employees":
        await loadUsersWorkspace();
        break;
      case "departments":
        await loadDepartmentsWorkspace();
        break;
      case "organizations":
        await loadOrganizationsWorkspace();
        break;
      case "platform-settings":
        await loadHomepageWorkspace();
        break;
      case "tenant-health":
        await loadTenantHealthWorkspace();
        break;
      case "global-audit":
        await loadReportsWorkspace();
        break;
      case "workforce-oversight":
        await loadWorkforceOversightWorkspace();
        break;
      case "security-monitoring":
        await loadSecurityMonitoringWorkspace();
        break;
      case "system-monitoring":
      case "runtime-status":
      case "api-health":
        await loadMonitoringWorkspace();
        break;
      case "feature-flags":
        break;
      case "reports":
        await loadReportsWorkspace();
        break;
      case "attendance-presence":
        await loadAttendancePresenceWorkspace();
        break;
      case "notifications":
        await loadNotificationsWorkspace();
        break;
      case "organization-settings":
        await loadOrganizationSettingsWorkspace();
        break;
      case "visitor-access":
        break;
      case "workforce-approvals":
        await loadWorkforceApprovalsWorkspace();
        break;
      default:
        break;
    }
  } catch (error) {
    if (!preserveToasts) {
      showToast("Workspace unavailable", error.message);
    }
  }
}

async function loadAnalyticsWorkspace() {
  renderDashboardCards([]);
  renderAnalyticsLoading();
  try {
    const analytics = await request("/admin/analytics");
    renderAnalytics(analytics?.data || {});
    renderAnalyticsRecovery();
  } catch (error) {
    renderAnalytics(defaultAnalyticsPayload());
    renderAnalyticsRecovery(error.message || "Analytics are temporarily unavailable.");
    showToast("Analytics unavailable", error.message);
  }
}

async function loadPlatformAnalyticsWorkspace() {
  renderDashboardCards([]);
  renderAnalyticsLoading();
  renderLoadingList("#tenant-health-list", 3);
  renderLoadingList("#security-overview-list", 3);
  const [analyticsResult, organizationsResult, monitoringResult] = await Promise.allSettled([
    request("/admin/analytics"),
    listManagedOrganizations(),
    request("/admin/monitoring"),
  ]);

  const analyticsData = analyticsResult.status === "fulfilled" ? analyticsResult.value?.data : defaultAnalyticsPayload();
  const organizations = organizationsResult.status === "fulfilled" ? normalizeArray(organizationsResult.value?.data) : [];
  const monitoring = monitoringResult.status === "fulfilled" && isObject(monitoringResult.value?.data) ? monitoringResult.value.data : {};
  renderPlatformAnalytics(analyticsData, organizations, monitoring);

  const failures = [
    analyticsResult.status === "rejected" ? `Analytics: ${analyticsResult.reason?.message || "unavailable"}` : "",
    organizationsResult.status === "rejected" ? `Tenant health: ${organizationsResult.reason?.message || "unavailable"}` : "",
    monitoringResult.status === "rejected" ? `Platform signals: ${monitoringResult.reason?.message || "unavailable"}` : "",
  ].filter(Boolean);

  if (failures.length) {
    renderAnalyticsRecovery(failures.join(" "));
    showToast("Platform analytics partially loaded", failures[0]);
  } else {
    renderAnalyticsRecovery();
  }
}

async function loadUsersWorkspace() {
  renderLoadingList("#user-management-list", 4);
  try {
    if (hasRole("SUPER_ADMIN")) {
      await ensureManagedOrganizations();
    }
    await loadUserDepartmentOptions({ preserveSelection: true });
    const users = await request("/admin/users");
    renderUsers(users?.data || []);
  } catch (error) {
    renderWorkList("#user-management-list", [], (item) => item, "Admin data unavailable", error.message);
    showToast("User management unavailable", error.message);
  }
}

async function loadWorkforceApprovalsWorkspace() {
  renderLoadingList("#workforce-approval-list", 4);
  try {
    const response = await listWorkforceOnboardingRequests();
    renderWorkforceApprovals(response?.data || []);
  } catch (error) {
    renderWorkList("#workforce-approval-list", [], (item) => item, "Workforce approvals unavailable", error.message);
    showToast("Workforce approvals unavailable", error.message);
  }
}

async function loadWorkforceOversightWorkspace() {
  renderLoadingList("#user-management-list", 4);
  try {
    const users = await request("/admin/users");
    renderUsers(users?.data || []);
  } catch (error) {
    renderWorkList("#user-management-list", [], (item) => item, "Workforce oversight unavailable", error.message);
    showToast("Workforce oversight unavailable", error.message);
  }
}

function initWorkforceApprovalsWorkspace() {
  document.querySelector("#workforce-approval-list")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-workforce-action]");
    if (!button) {
      return;
    }
    const card = button.closest("[data-workforce-card]");
    const workerId = card?.dataset.workerId;
    const action = button.dataset.workforceAction;
    if (!workerId || !action) {
      return;
    }
    if (hasRole("SUPER_ADMIN") && !hasRole("ADMIN")) {
      showToast("Admin approval required", "SUPER_ADMIN can view requests, but organization ADMIN must approve workforce access.");
      return;
    }
    const payload = workforcePayloadFromCard(card);
    button.toggleAttribute("disabled", true);
    try {
      if (action === "save") {
        await updateWorkforceOnboarding(workerId, payload);
        showToast("Worker details saved", "Pending onboarding details were updated.");
      }
      if (action === "approve") {
        await approveWorkforceOnboarding(workerId, payload);
        showToast("Workforce access activated", "Static QR and check-in/check-out access are now active.");
      }
      if (action === "reject") {
        const reason = window.prompt("Reason for rejecting this workforce onboarding request.");
        if (!reason?.trim()) {
          showToast("Reason required", "Rejections require an audit reason.");
          return;
        }
        await rejectWorkforceOnboarding(workerId, reason.trim());
        showToast("Worker request rejected", "The decision was audit logged.");
      }
      await Promise.all([
        loadWorkforceApprovalsWorkspace(),
        currentRoute === "employees" ? loadUsersWorkspace() : Promise.resolve(),
      ]);
    } catch (error) {
      showToast("Workforce action failed", error.message);
    } finally {
      button.toggleAttribute("disabled", false);
    }
  });
}

async function loadOrganizationsWorkspace() {
  renderOrganizationWorkspaceLoading();
  try {
    const [workspaceResponse, organizationsResponse] = await Promise.all([
      listOrganizationWorkspaceItems(),
      listManagedOrganizations(),
    ]);
    organizationWorkspaceItems = workspaceResponse?.data || [];
    managedOrganizations = organizationsResponse?.data || [];
    renderOrganizations(organizationWorkspaceItems);
  } catch (error) {
    organizationWorkspaceItems = [];
    renderOrganizations([]);
    showToast("Organizations unavailable", error.message);
  }
}

async function loadDepartmentsWorkspace() {
  renderLoadingList("#departments-list", 4);
  try {
    if (hasRole("SUPER_ADMIN")) {
      await ensureManagedOrganizations();
      populateDepartmentOrganizationFilter();
    }
    const organizationId = resolveDepartmentFilterOrganizationId();
    const departments = await listDepartments({
      organizationId,
      includeInactive: true,
    });
    departmentWorkspaceItems = departments?.data || [];
    renderDepartmentWorkspaceItems();
  } catch (error) {
    departmentWorkspaceItems = [];
    renderWorkList("#departments-list", [], (item) => item, "Departments unavailable", error.message);
    showToast("Departments unavailable", error.message);
  }
}

async function loadTenantHealthWorkspace() {
  renderTenantHealthSummary([]);
  renderLoadingList("#tenant-health-list", 5);
  try {
    const organizations = (await listManagedOrganizations())?.data || [];
    renderTenantHealth(organizations);
  } catch (error) {
    renderTenantHealthSummary([]);
    renderWorkList("#tenant-health-list", [], (item) => item, "Tenant health unavailable", error.message);
    showToast("Tenant health unavailable", error.message);
  }
}

async function loadHomepageWorkspace() {
  renderHomepageSettingsState("Loading homepage controls...");
  try {
    const homepageSettings = await getHomepageSettings();
    renderHomepageSettings(homepageSettings?.data || null);
  } catch (error) {
    renderHomepageSettingsState(error.message);
    showToast("Homepage controls unavailable", error.message);
  }
}

async function loadReportsWorkspace() {
  renderLoadingList("#reports-list", 4);
  try {
    const reports = await request("/admin/reports");
    renderWorkList("#reports-list", reports?.data || [], (report) => workCard(report.title, report.status), "No audit activity yet", "Structured login and access events will appear here.");
  } catch (error) {
    renderWorkList("#reports-list", [], (item) => item, "Audit oversight unavailable", error.message);
    showToast("Reports unavailable", error.message);
  }
}

async function loadSecurityMonitoringWorkspace() {
  renderSecuritySummary([]);
  renderLoadingList("#security-monitoring-list", 4);
  try {
    const [reportsResponse, monitoringResponse] = await Promise.all([
      request("/admin/reports"),
      request("/admin/monitoring"),
    ]);
    renderSecurityMonitoring(reportsResponse?.data || [], monitoringResponse?.data || {});
  } catch (error) {
    renderSecuritySummary([]);
    renderWorkList("#security-monitoring-list", [], (item) => item, "Security monitoring unavailable", error.message);
    showToast("Security monitoring unavailable", error.message);
  }
}

async function loadAttendancePresenceWorkspace() {
  renderAttendancePresence([]);
  try {
    const response = await request("/admin/workforce-attendance");
    renderAttendancePresence(response?.data || []);
  } catch (error) {
    renderAttendancePresence([]);
    renderWorkList("#attendance-presence-table", [], (item) => item, "Attendance unavailable", error.message);
    showToast("Attendance unavailable", error.message);
  }
}

async function loadNotificationsWorkspace() {
  renderLoadingList("#notifications-workspace-list", 4);
  try {
    const response = await getNotifications(25);
    renderNotificationsWorkspace(response?.data || {});
  } catch (error) {
    renderWorkList("#notifications-workspace-list", [], (item) => item, "Notifications unavailable", error.message);
    showToast("Notifications unavailable", error.message);
  }
}

async function loadOrganizationSettingsWorkspace() {
  renderOrganizationSettings([], []);
  try {
    const [organizationsResponse, departmentsResponse] = await Promise.all([
      listManagedOrganizations(),
      listDepartments({ organizationId: currentSession?.organizationId || "", includeInactive: true }),
    ]);
    renderOrganizationSettings(organizationsResponse?.data || [], departmentsResponse?.data || []);
  } catch (error) {
    renderOrganizationSettings([], []);
    renderWorkList("#organization-settings-list", [], (item) => item, "Organization settings unavailable", error.message);
    showToast("Organization settings unavailable", error.message);
  }
}

async function loadMonitoringWorkspace() {
  renderMonitoringSummary([]);
  renderLoadingList("#monitoring-list", 4);
  try {
    const monitoring = await request("/admin/monitoring");
    renderMonitoring(monitoring?.data || {});
  } catch (error) {
    renderMonitoringSummary([]);
    renderWorkList("#monitoring-list", [], (item) => item, "Monitoring unavailable", error.message);
    showToast("Monitoring unavailable", error.message);
  }
}

function initAdminUserForm() {
  const form = document.querySelector("#admin-user-form");
  if (!form) {
    return;
  }

  const roleSelect = form.querySelector("select[name='role']");
  const companyField = form.querySelector("[data-company-code-field]");
  const companyInput = form.querySelector("input[name='companyCode']");
  const departmentInput = form.querySelector("input[name='department']");
  const departmentField = form.querySelector("[data-department-field]");
  initPhoneInput(form);
  if (roleSelect && !hasRole("SUPER_ADMIN")) {
    roleSelect.querySelector("option[value='ADMIN']")?.remove();
  }
  if (companyInput && currentSession?.organizationCode) {
    companyInput.value = currentSession.organizationCode;
  }
  if (companyField && !hasRole("SUPER_ADMIN")) {
    companyField.classList.add("is-hidden");
  }
  if (companyInput && hasRole("SUPER_ADMIN")) {
    initOrganizationSelector(companyInput, {
      loadOrganizations: ({ force = false } = {}) => ensureManagedOrganizations({ force }),
      prefetch: true,
    });
  }
  const usernameInput = form.querySelector("input[name='username']");
  const runUsernameValidation = attachFieldValidator(usernameInput, validateUsername);
  const runDepartmentValidation = attachFieldValidator(departmentInput, (value) => validateDepartmentValue(value));
  let employeeDepartmentDraft = "";

  if (hasRole("SUPER_ADMIN")) {
    companyInput?.addEventListener("input", () => {
      loadUserDepartmentOptions({ preserveSelection: true });
    });
    companyInput?.addEventListener("blur", () => {
      loadUserDepartmentOptions({ preserveSelection: true });
    });
  }

  roleSelect?.addEventListener("change", () => {
    if (roleSelect.dataset.activeRole === "EMPLOYEE") {
      employeeDepartmentDraft = departmentInput?.value || employeeDepartmentDraft;
    }
    updateInternalProvisioningRoleState(form, {
      companyField,
      companyInput,
      departmentField,
      departmentInput,
      onManualDepartmentDraft: (value) => {
        employeeDepartmentDraft = value;
      },
      employeeDepartmentDraft: () => employeeDepartmentDraft,
    });
    roleSelect.dataset.activeRole = roleSelect.value;
    runDepartmentValidation();
  });

  departmentInput?.addEventListener("input", () => {
    if (roleSelect?.value === "EMPLOYEE") {
      employeeDepartmentDraft = departmentInput.value;
    }
  });

  updateInternalProvisioningRoleState(form, {
    companyField,
    companyInput,
    departmentField,
    departmentInput,
    onManualDepartmentDraft: (value) => {
      employeeDepartmentDraft = value;
    },
    employeeDepartmentDraft: () => employeeDepartmentDraft,
  });
  if (roleSelect) {
    roleSelect.dataset.activeRole = roleSelect.value;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const department = normalizeDepartmentValue(data.department);
    const phone = phonePayload(data);
    const payload = {
      fullName: trim(data.fullName),
      username: trim(data.username),
      email: trim(data.email),
      password: data.password,
      role: data.role,
      companyCode: trim(data.companyCode) || currentSession?.organizationCode || null,
      department,
      phoneCountryCode: phone.phoneCountryCode,
      phone: phone.phone || null,
      designation: trim(data.designation),
      employeeType: trim(data.employeeType),
      shiftName: trim(data.shiftName),
      shiftStartTime: trim(data.shiftStartTime),
      shiftEndTime: trim(data.shiftEndTime),
    };
    const error = validateInternalUser(payload);
    if (error) {
      showToast("Check account", error);
      return;
    }

    setFormLoading(form, true);
    try {
      await request("/admin/users", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const previousCompanyCode = trim(companyInput?.value) || currentSession?.organizationCode || null;
      form.reset();
      if (companyInput && currentSession?.organizationCode) {
        companyInput.value = currentSession.organizationCode;
      } else if (companyInput && previousCompanyCode) {
        companyInput.value = previousCompanyCode;
      }
      employeeDepartmentDraft = "";
      updateInternalProvisioningRoleState(form, {
        companyField,
        companyInput,
        departmentField,
        departmentInput,
        onManualDepartmentDraft: (value) => {
          employeeDepartmentDraft = value;
        },
        employeeDepartmentDraft: () => employeeDepartmentDraft,
      });
      if (roleSelect) {
        roleSelect.dataset.activeRole = roleSelect.value;
      }
      runUsernameValidation();
      runDepartmentValidation();
      await loadUserDepartmentOptions({ preserveSelection: false });
      showToast("Account created", "Share the temporary password through your approved internal process.");
      await loadUsersWorkspace();
    } catch (error) {
      showToast("Account creation failed", error.message);
    } finally {
      setFormLoading(form, false);
    }
  });

  document.querySelector("#user-management-list")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-user-action]");
    if (!button) {
      return;
    }
    const id = button.dataset.userId;
    const action = button.dataset.userAction;
    const roleSelectField = button.closest(".admin-user-card")?.querySelector("[data-role-select]");
    const password = action === "reset-password" ? window.prompt("Enter a new temporary password for this account.") : null;
    if (action === "reset-password" && !password) {
      return;
    }
    const requestBody = action === "reset-password"
      ? { newPassword: password }
      : action === "role"
        ? { role: roleSelectField?.value }
        : {};

    button.toggleAttribute("disabled", true);
    try {
      await request(`/admin/users/${encodeURIComponent(id)}/${action}`, {
        method: "PATCH",
        body: JSON.stringify(requestBody),
      });
      showToast("Account updated", "User access controls were updated.");
      await loadUsersWorkspace();
    } catch (error) {
      showToast("Update failed", error.message);
    } finally {
      button.toggleAttribute("disabled", false);
    }
  });
}

function initDepartmentWorkspace() {
  const form = document.querySelector("#department-form");
  if (!form) {
    return;
  }

  const organizationSelect = form.querySelector("select[name='organizationId']");
  const departmentInput = form.querySelector("input[name='departmentName']");
  const runDepartmentValidation = attachFieldValidator(departmentInput, (value) => validateDepartmentValue(value));

  organizationSelect?.addEventListener("change", async () => {
    departmentFilterOrganizationId = trim(organizationSelect.value) || "";
    toggleDepartmentFormState();
    await loadDepartmentsWorkspace();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const departmentName = normalizeDepartmentValue(departmentInput?.value);
    const organizationId = resolveDepartmentFilterOrganizationId();

    if (!organizationId) {
      showToast("Choose organization", "Select an organization before adding a department.");
      return;
    }

    const error = validateDepartmentValue(departmentName, { required: true });
    if (error) {
      showToast("Check department", error);
      return;
    }

    setFormLoading(form, true);
    try {
      await createDepartment({ organizationId, departmentName });
      form.reset();
      populateDepartmentOrganizationFilter();
      if (organizationSelect && organizationId) {
        organizationSelect.value = organizationId;
      }
      runDepartmentValidation();
      showToast("Department added", "The department is ready for organization-scoped account assignment.");
      await Promise.all([
        loadDepartmentsWorkspace(),
        refreshDepartmentOptionsForOrganization(organizationId),
      ]);
    } catch (error) {
      showToast("Department save failed", error.message);
    } finally {
      toggleDepartmentFormState();
      setFormLoading(form, false);
    }
  });

  document.querySelector("#departments-list")?.addEventListener("click", async (event) => {
    const toggleButton = event.target.closest("[data-department-toggle]");
    if (!toggleButton) {
      return;
    }

    const department = departmentWorkspaceItems.find((item) => item.id === toggleButton.dataset.departmentId);
    if (!department) {
      return;
    }

    toggleButton.toggleAttribute("disabled", true);
    try {
      await updateDepartment(department.id, { activeStatus: !department.activeStatus });
      showToast("Department updated", department.activeStatus ? "Department deactivated for future assignments." : "Department reactivated for assignment.");
      await Promise.all([
        loadDepartmentsWorkspace(),
        refreshDepartmentOptionsForOrganization(department.organizationId),
      ]);
    } catch (error) {
      showToast("Department update failed", error.message);
    } finally {
      toggleButton.toggleAttribute("disabled", false);
    }
  });

  document.querySelector("#departments-list")?.addEventListener("submit", async (event) => {
    const editor = event.target.closest("[data-department-editor]");
    if (!editor) {
      return;
    }

    event.preventDefault();
    const departmentId = editor.dataset.departmentId;
    const input = editor.querySelector("input[name='departmentName']");
    const departmentName = normalizeDepartmentValue(input?.value);
    const error = validateDepartmentValue(departmentName, { required: true });
    if (error) {
      showToast("Check department", error);
      return;
    }

    const department = departmentWorkspaceItems.find((item) => item.id === departmentId);
    if (!department) {
      return;
    }

    setFormLoading(editor, true);
    try {
      await updateDepartment(departmentId, { departmentName });
      showToast("Department renamed", "Department updates are now reflected in organization-scoped account setup.");
      await Promise.all([
        loadDepartmentsWorkspace(),
        refreshDepartmentOptionsForOrganization(department.organizationId),
      ]);
    } catch (error) {
      showToast("Department rename failed", error.message);
    } finally {
      setFormLoading(editor, false);
    }
  });
}

function initHomepageSettingsForm() {
  const form = document.querySelector("#homepage-settings-form");
  if (!form) {
    return;
  }

  form.addEventListener("input", () => {
    syncHomepagePreviewFromForm(form);
  });
  form.addEventListener("change", () => {
    syncHomepagePreviewFromForm(form);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!hasRole("SUPER_ADMIN")) {
      showToast("Settings locked", "Only SUPER_ADMIN can update homepage controls.");
      return;
    }

    const data = new FormData(form);
    const payload = {
      statsVisible: data.get("statsVisible") === "on",
      publicCountersVisible: data.get("publicCountersVisible") === "on",
      featuredMetricsVisible: data.get("featuredMetricsVisible") === "on",
      announcementVisible: data.get("announcementVisible") === "on",
      announcementTitle: trim(data.get("announcementTitle")),
      announcementBody: trim(data.get("announcementBody")),
      featuredMetricKeys: data.getAll("featuredMetricKeys"),
      publicMetricKeys: data.getAll("publicMetricKeys"),
    };

    setFormLoading(form, true);
    try {
      const response = await updateHomepageSettings(payload);
      renderHomepageSettings(response?.data || null);
      showToast("Homepage updated", "Public homepage controls were saved.");
    } catch (error) {
      showToast("Homepage update failed", error.message);
    } finally {
      setFormLoading(form, false);
    }
  });
}

function initOrganizationsWorkspace() {
  const modal = document.querySelector("#organization-workspace-modal");
  document.querySelector("#organization-search")?.addEventListener("input", () => renderOrganizations(organizationWorkspaceItems));
  document.querySelector("#organization-status-filter")?.addEventListener("change", () => renderOrganizations(organizationWorkspaceItems));
  document.querySelector("#organization-sort")?.addEventListener("change", () => renderOrganizations(organizationWorkspaceItems));
  document.querySelector("#organization-refresh")?.addEventListener("click", async () => {
    await loadOrganizationsWorkspace();
  });
  document.querySelector("#organization-create-open")?.addEventListener("click", () => {
    openOrganizationWorkspaceModal();
  });

  document.querySelector("#organizations-list")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-organization-action]");
    if (!button) {
      return;
    }
    const organizationId = button.dataset.organizationId;
    const organization = managedOrganizations.find((item) => item.id === organizationId);
    if (!organization) {
      return;
    }
    if (button.dataset.organizationAction === "open") {
      await openOrganizationWorkspaceModal(organization.id);
      return;
    }
    if (button.dataset.organizationAction !== "toggle") {
      return;
    }
    button.toggleAttribute("disabled", true);
    try {
      await updateOrganization(organization.id, {
        companyName: organization.companyName,
        companyCode: organization.companyCode,
        contactEmail: organization.contactEmail || null,
        address: organization.address || null,
        regionCountry: organization.regionCountry || "Global",
        timezone: organization.timezone || "UTC",
        activeStatus: !organization.activeStatus,
      });
      showToast("Organization updated", organization.activeStatus ? "Organization access has been paused." : "Organization is active again.");
      await loadOrganizationsWorkspace();
      if (activeOrganizationWorkspace?.organization?.id === organization.id) {
        await openOrganizationWorkspaceModal(organization.id, { activeTab: "settings" });
      }
    } catch (error) {
      showToast("Organization update failed", error.message);
    } finally {
      button.toggleAttribute("disabled", false);
    }
  });

  modal?.addEventListener("click", async (event) => {
    if (event.target === modal || event.target.closest("[data-organization-close]")) {
      closeOrganizationWorkspaceModal();
      return;
    }

    const tabButton = event.target.closest("[data-organization-tab]");
    if (tabButton) {
      setOrganizationWorkspaceTab(tabButton.dataset.organizationTab);
      return;
    }

    const removeButton = event.target.closest("[data-department-remove]");
    if (removeButton) {
      organizationDepartmentDraft = organizationDepartmentDraft.filter((name) => departmentKey(name) !== removeButton.dataset.departmentRemove);
      renderOrganizationDepartmentEditor();
      return;
    }

    const suggestionButton = event.target.closest("[data-department-suggestion]");
    if (suggestionButton) {
      addOrganizationDepartment(suggestionButton.dataset.departmentSuggestion, { clearInput: false });
      return;
    }

    if (event.target.closest("#organization-department-add")) {
      addOrganizationDepartmentFromInput();
      return;
    }

    const adminAction = event.target.closest("[data-organization-admin-action]");
    if (adminAction && activeOrganizationWorkspace?.organization?.id) {
      await handleOrganizationAdminAction(adminAction);
      return;
    }

    const departmentToggle = event.target.closest("[data-organization-department-toggle]");
    if (departmentToggle && activeOrganizationWorkspace?.organization?.id) {
      await handleOrganizationDepartmentToggle(departmentToggle);
    }
  });

  modal?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeOrganizationWorkspaceModal();
      return;
    }
    if (event.key === "Enter" && event.target?.id === "organization-department-input") {
      event.preventDefault();
      addOrganizationDepartmentFromInput();
    }
  });

  modal?.addEventListener("submit", async (event) => {
    const form = event.target.closest("form");
    if (!form) {
      return;
    }
    event.preventDefault();

    if (form.id === "organization-form") {
      await submitOrganizationWorkspaceForm(form);
      return;
    }
    if (form.id === "organization-admin-form") {
      await submitOrganizationAdminForm(form);
      return;
    }
    if (form.id === "organization-department-form") {
      await submitOrganizationDepartmentForm(form);
      return;
    }

    const departmentEditor = form.closest("[data-organization-department-editor]");
    if (departmentEditor) {
      await submitOrganizationDepartmentRename(form, departmentEditor.dataset.departmentId);
    }
  });
}

async function openOrganizationWorkspaceModal(organizationId = "", options = {}) {
  const { activeTab = "overview" } = options;
  const modal = document.querySelector("#organization-workspace-modal");
  if (!modal) {
    return;
  }

  modal.classList.remove("is-hidden");
  modal.innerHTML = `
    <div class="visitor-modal__dialog organization-workspace organization-workspace--loading" role="dialog" aria-modal="true" aria-label="Organization workspace">
      <div class="panel__header">
        <div>
          <p class="eyebrow">Organization Workspace</p>
          <h2>${organizationId ? "Loading organization" : "Create organization"}</h2>
        </div>
        <button class="icon-button" type="button" data-organization-close aria-label="Close organization workspace">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.4 5 12.6 12.6-1.4 1.4L5 6.4Zm12.6 1.4L6.4 19 5 17.6 17.6 5Z"/></svg>
        </button>
      </div>
      <div class="empty-state empty-state--inline">
        <h3>${organizationId ? "Loading workspace" : "Preparing setup workspace"}</h3>
        <p>${organizationId ? "Fetching organization detail, activity, and admin controls." : "Opening the organization setup flow."}</p>
      </div>
    </div>
  `;

  if (!organizationId) {
    activeOrganizationWorkspace = null;
    resetOrganizationDepartmentDraft(true);
    renderOrganizationWorkspaceModal(null, { mode: "create", activeTab: "settings" });
    return;
  }

  try {
    const response = await getOrganizationWorkspace(organizationId);
    activeOrganizationWorkspace = response?.data || null;
    if (!activeOrganizationWorkspace?.organization) {
      throw new Error("Organization workspace response was empty.");
    }
    organizationDepartmentDraft = (activeOrganizationWorkspace?.departments || []).map((department) => department.departmentName);
    renderOrganizationWorkspaceModal(activeOrganizationWorkspace, { mode: "manage", activeTab });
  } catch (error) {
    modal.innerHTML = `
      <div class="visitor-modal__dialog organization-workspace" role="dialog" aria-modal="true" aria-label="Organization workspace">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Organization Workspace</p>
            <h2>Workspace unavailable</h2>
          </div>
          <button class="icon-button" type="button" data-organization-close aria-label="Close organization workspace">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.4 5 12.6 12.6-1.4 1.4L5 6.4Zm12.6 1.4L6.4 19 5 17.6 17.6 5Z"/></svg>
          </button>
        </div>
        <article class="empty-state empty-state--inline">
          <h3>Organization workspace unavailable</h3>
          <p>${escapeHtml(error.message)}</p>
        </article>
      </div>
    `;
  }
}

function closeOrganizationWorkspaceModal() {
  const modal = document.querySelector("#organization-workspace-modal");
  if (!modal) {
    return;
  }
  modal.classList.add("is-hidden");
  modal.innerHTML = "";
  activeOrganizationWorkspace = null;
}

function setOrganizationWorkspaceTab(tab) {
  const modal = document.querySelector("#organization-workspace-modal");
  if (!modal) {
    return;
  }
  modal.querySelectorAll("[data-organization-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.organizationTab === tab);
  });
  modal.querySelectorAll("[data-organization-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.organizationPanel !== tab;
  });
}

function renderOrganizationWorkspaceModal(workspace, options = {}) {
  const { mode = "manage", activeTab = "overview" } = options;
  const modal = document.querySelector("#organization-workspace-modal");
  if (!modal) {
    return;
  }

  modal.innerHTML = organizationWorkspaceModalMarkup(workspace, mode);
  renderOrganizationDepartmentEditor();
  initPhoneInput(modal.querySelector("#organization-admin-form"));

  const form = modal.querySelector("#organization-form");
  if (form && workspace?.organization) {
    populateOrganizationForm(form, workspace.organization, workspace.departments || []);
  } else if (form) {
    resetOrganizationForm(form);
  }

  setOrganizationWorkspaceTab(mode === "create" ? "settings" : activeTab);
}

async function submitOrganizationWorkspaceForm(form) {
  if (!hasRole("SUPER_ADMIN")) {
    showToast("Organizations locked", "Only SUPER_ADMIN can manage organizations.");
    return;
  }

  const data = new FormData(form);
  const organizationId = trim(data.get("organizationId"));
  const payload = {
    companyName: trim(data.get("companyName")),
    companyCode: String(data.get("companyCode") || "").trim().toUpperCase(),
    contactEmail: trim(data.get("contactEmail")),
    address: trim(data.get("address")),
    regionCountry: trim(data.get("regionCountry")),
    timezone: trim(data.get("timezone")),
    activeStatus: data.get("activeStatus") === "on",
    departmentNames: organizationDepartmentDraft.slice(),
  };
  const error = validateOrganization(payload);
  if (error) {
    showToast("Check organization", error);
    return;
  }

  setFormLoading(form, true);
  try {
    const response = organizationId
      ? await updateOrganization(organizationId, payload)
      : await createOrganization(payload);
    showToast(organizationId ? "Organization updated" : "Organization created", organizationId ? "Tenant details were saved." : "Tenant is ready for admin and visitor setup.");
    await loadOrganizationsWorkspace();
    await openOrganizationWorkspaceModal(response?.data?.id || organizationId, { activeTab: "overview" });
  } catch (submitError) {
    showToast("Organization save failed", submitError.message);
  } finally {
    setFormLoading(form, false);
  }
}

async function submitOrganizationAdminForm(form) {
  if (!activeOrganizationWorkspace?.organization?.id) {
    return;
  }

  const data = Object.fromEntries(new FormData(form).entries());
  const phone = phonePayload(data);
  const payload = {
    fullName: trim(data.fullName),
    username: trim(data.username),
    email: trim(data.email),
    password: data.password,
    role: "ADMIN",
    companyCode: activeOrganizationWorkspace.organization.companyCode,
    department: normalizeDepartmentValue(data.department),
    phoneCountryCode: phone.phoneCountryCode,
    phone: phone.phone || null,
  };
  const error = validateInternalUser(payload);
  if (error) {
    showToast("Check account", error);
    return;
  }

  setFormLoading(form, true);
  try {
    await request("/admin/users", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    form.reset();
    showToast("Admin created", "The organization admin account is ready for provisioning.");
    await loadOrganizationsWorkspace();
    await openOrganizationWorkspaceModal(activeOrganizationWorkspace.organization.id, { activeTab: "admins" });
  } catch (submitError) {
    showToast("Admin creation failed", submitError.message);
  } finally {
    setFormLoading(form, false);
  }
}

async function submitOrganizationDepartmentForm(form) {
  const organizationId = activeOrganizationWorkspace?.organization?.id;
  if (!organizationId) {
    return;
  }
  const departmentName = normalizeDepartmentValue(form.querySelector("input[name='departmentName']")?.value);
  const error = validateDepartmentValue(departmentName, { required: true });
  if (error) {
    showToast("Check department", error);
    return;
  }

  setFormLoading(form, true);
  try {
    await createDepartment({ organizationId, departmentName });
    form.reset();
    showToast("Department added", "The department is ready for organization-scoped assignment.");
    await loadOrganizationsWorkspace();
    await openOrganizationWorkspaceModal(organizationId, { activeTab: "departments" });
  } catch (submitError) {
    showToast("Department save failed", submitError.message);
  } finally {
    setFormLoading(form, false);
  }
}

async function submitOrganizationDepartmentRename(form, departmentId) {
  const departmentName = normalizeDepartmentValue(form.querySelector("input[name='departmentName']")?.value);
  const error = validateDepartmentValue(departmentName, { required: true });
  if (error) {
    showToast("Check department", error);
    return;
  }

  setFormLoading(form, true);
  try {
    await updateDepartment(departmentId, { departmentName });
    showToast("Department renamed", "Department updates are now reflected in organization setup.");
    await loadOrganizationsWorkspace();
    await openOrganizationWorkspaceModal(activeOrganizationWorkspace.organization.id, { activeTab: "departments" });
  } catch (submitError) {
    showToast("Department rename failed", submitError.message);
  } finally {
    setFormLoading(form, false);
  }
}

async function handleOrganizationDepartmentToggle(button) {
  const departmentId = button.dataset.departmentId;
  const department = activeOrganizationWorkspace?.departments?.find((item) => item.id === departmentId);
  if (!department) {
    return;
  }
  button.toggleAttribute("disabled", true);
  try {
    await updateDepartment(department.id, { activeStatus: !department.activeStatus });
    showToast("Department updated", department.activeStatus ? "Department deactivated for future assignments." : "Department reactivated for assignment.");
    await loadOrganizationsWorkspace();
    await openOrganizationWorkspaceModal(activeOrganizationWorkspace.organization.id, { activeTab: "departments" });
  } catch (error) {
    showToast("Department update failed", error.message);
  } finally {
    button.toggleAttribute("disabled", false);
  }
}

async function handleOrganizationAdminAction(button) {
  const userId = button.dataset.userId;
  const action = button.dataset.organizationAdminAction;
  const card = button.closest("[data-organization-admin-card]");
  const roleField = card?.querySelector("[data-role-select]");
  const password = action === "reset-password" ? window.prompt("Enter a new temporary password for this account.") : null;
  if (action === "reset-password" && !password) {
    return;
  }
  const requestBody = action === "reset-password"
    ? { newPassword: password }
    : action === "role"
      ? { role: roleField?.value }
      : {};

  button.toggleAttribute("disabled", true);
  try {
    await request(`/admin/users/${encodeURIComponent(userId)}/${action}`, {
      method: "PATCH",
      body: JSON.stringify(requestBody),
    });
    showToast("Account updated", "Organization admin access controls were updated.");
    await loadOrganizationsWorkspace();
    await openOrganizationWorkspaceModal(activeOrganizationWorkspace.organization.id, { activeTab: "admins" });
  } catch (error) {
    showToast("Update failed", error.message);
  } finally {
    button.toggleAttribute("disabled", false);
  }
}

function renderWorkforceApprovals(workers) {
  const list = document.querySelector("#workforce-approval-list");
  if (!list) {
    return;
  }
  const canApprove = hasRole("ADMIN");
  list.innerHTML = workers.length ? workers.map((worker) => workforceApprovalCard(worker, canApprove)).join("") : `
    <article class="empty-state empty-state--inline">
      <h3>No pending workforce requests</h3>
      <p>Security-assisted support staff onboarding requests will appear here before QR activation.</p>
    </article>
  `;
}

function workforceApprovalCard(worker, canApprove) {
  const disabled = canApprove ? "" : "disabled";
  return `
    <article class="admin-user-card workforce-approval-card" data-workforce-card data-worker-id="${escapeHtml(worker.id)}">
      <div class="admin-user-card__header">
        <div>
          <h3>${escapeHtml(worker.fullName || "Worker")}</h3>
          <p>${escapeHtml(worker.employeeType || "Support staff")} · Requested by ${escapeHtml(worker.workforceOnboardingCreatedByName || "Security")}</p>
        </div>
        ${statusBadge(worker.accountStatus || "PENDING_APPROVAL")}
      </div>
      <dl>
        <div><dt>Organization</dt><dd>${escapeHtml(worker.organizationName || worker.organizationCode || "Organization")}</dd></div>
        <div><dt>Worker ID</dt><dd>${escapeHtml(worker.employeeId || "Issued after approval")}</dd></div>
        <div><dt>QR status</dt><dd>Inactive until approval</dd></div>
        <div><dt>Requested</dt><dd>${escapeHtml(formatDateTime(worker.workforceOnboardingCreatedAt || worker.createdAt))}</dd></div>
      </dl>
      <div class="workforce-approval-card__form">
        <label class="form-field">
          <span>Department</span>
          <input name="department" type="text" value="${escapeHtml(worker.department || "")}" ${disabled} />
        </label>
        <label class="form-field">
          <span>Category</span>
          <select name="employeeType" ${disabled}>
            ${workerCategoryOptions(worker.employeeType)}
          </select>
        </label>
        <label class="form-field">
          <span>Designation</span>
          <input name="designation" type="text" value="${escapeHtml(worker.designation || "")}" ${disabled} />
        </label>
        <label class="form-field">
          <span>Shift</span>
          <input name="shiftName" type="text" value="${escapeHtml(worker.shiftName || "General Shift")}" ${disabled} />
        </label>
        <label class="form-field">
          <span>Start</span>
          <input name="shiftStartTime" type="time" value="${escapeHtml(worker.shiftStartTime || "09:00")}" ${disabled} />
        </label>
        <label class="form-field">
          <span>End</span>
          <input name="shiftEndTime" type="time" value="${escapeHtml(worker.shiftEndTime || "18:00")}" ${disabled} />
        </label>
      </div>
      <div class="admin-user-card__actions">
        <button class="button button--ghost" type="button" data-workforce-action="save" ${disabled}>Save details</button>
        <button class="button button--primary" type="button" data-workforce-action="approve" ${disabled}>Approve and activate QR</button>
        <button class="button button--ghost" type="button" data-workforce-action="reject" ${disabled}>Reject</button>
      </div>
    </article>
  `;
}

function workerCategoryOptions(selectedValue) {
  const selected = String(selectedValue || "SUPPORT_STAFF").toUpperCase();
  const options = [
    ["CLEANER", "Cleaner"],
    ["SWEEPER", "Sweeper"],
    ["GARDENER", "Gardener"],
    ["HELPER", "Helper"],
    ["MAINTENANCE", "Maintenance"],
    ["CONTRACT_LABOR", "Contract labor"],
    ["SUPPORT_STAFF", "Support staff"],
  ];
  if (selected && !options.some(([value]) => value === selected)) {
    options.push([selected, formatStatusLabel(selected)]);
  }
  return options.map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
}

function workforcePayloadFromCard(card) {
  return {
    department: trim(card.querySelector("[name='department']")?.value),
    employeeType: trim(card.querySelector("[name='employeeType']")?.value),
    designation: trim(card.querySelector("[name='designation']")?.value),
    shiftName: trim(card.querySelector("[name='shiftName']")?.value),
    shiftStartTime: trim(card.querySelector("[name='shiftStartTime']")?.value),
    shiftEndTime: trim(card.querySelector("[name='shiftEndTime']")?.value),
  };
}

function renderUsers(users) {
  const list = document.querySelector("#user-management-list");
  if (!list) {
    return;
  }

  list.innerHTML = users.length ? users.map(userCard).join("") : `
    <article class="empty-state empty-state--inline">
      <h3>No users found</h3>
      <p>Internal accounts will appear here after administrators create them.</p>
    </article>
  `;
}

function userCard(user) {
  const role = (user.roles || []).join(", ");
  const primaryRole = (user.roles || [])[0] || "";
  const oversightOnly = currentRoute === "workforce-oversight";
  const pendingApproval = user.accountStatus === "PENDING_APPROVAL";
  const rejectedApproval = user.accountStatus === "REJECTED";
  const disabled = !user.active || user.accountStatus === "DISABLED" || pendingApproval || rejectedApproval;
  const platformOwner = (user.roles || []).includes("SUPER_ADMIN");
  const canManageAdmin = !(user.roles || []).includes("ADMIN") || hasRole("SUPER_ADMIN");
  const canManage = !oversightOnly && !platformOwner && canManageAdmin && !pendingApproval && !rejectedApproval;
  const roleOptions = internalRoleOptions(primaryRole);
  const roleControls = oversightOnly ? `
      <div class="admin-user-card__role">
        <p class="form-field__message form-field__message--inline">Platform oversight is intentionally separated from organization employee operations.</p>
      </div>
  ` : platformOwner ? `
      <div class="admin-user-card__role">
        <p class="form-field__message form-field__message--inline">Platform-owner access is controlled by secure backend workflows.</p>
      </div>
  ` : `
      <div class="admin-user-card__role">
        <label class="form-field">
          <span>Portal access</span>
          <select data-role-select ${canManage ? "" : "disabled"}>
            ${roleOptions}
          </select>
        </label>
        <button class="button button--ghost" type="button" data-user-action="role" data-user-id="${escapeHtml(user.id)}" ${canManage ? "" : "disabled"}>Update access</button>
      </div>
  `;
  return `
    <article class="admin-user-card">
      <div class="admin-user-card__header">
        <div>
          <h3>${escapeHtml(user.fullName || user.email || "Unknown user")}</h3>
          <p>${escapeHtml(user.email || "No email")} · ${escapeHtml(user.username || "No username")}</p>
        </div>
        ${statusBadge(user.accountStatus || (user.active ? "ACTIVE" : "DISABLED"))}
      </div>
      <dl>
        <div><dt>Access</dt><dd>${escapeHtml(role)}</dd></div>
        <div><dt>Organization</dt><dd>${escapeHtml(user.organizationName || user.organizationCode || "Platform")}</dd></div>
        <div><dt>Department</dt><dd>${escapeHtml(user.department || "Not set")}</dd></div>
        <div><dt>Employee ID</dt><dd>${escapeHtml(user.employeeId || "Not issued")}</dd></div>
        <div><dt>Designation</dt><dd>${escapeHtml(user.designation || "Not set")}</dd></div>
        <div><dt>Shift</dt><dd>${escapeHtml(formatUserShift(user))}</dd></div>
        <div><dt>Account ID</dt><dd>${escapeHtml(user.id || "")}</dd></div>
      </dl>
      ${roleControls}
      <div class="admin-user-card__actions">
        <button class="button button--ghost" type="button" data-user-action="reset-password" data-user-id="${escapeHtml(user.id)}" ${canManage ? "" : "disabled"}>Reset password</button>
        <button class="button ${disabled ? "button--primary" : "button--ghost"}" type="button" data-user-action="${disabled ? "enable" : "disable"}" data-user-id="${escapeHtml(user.id)}" ${canManage ? "" : "disabled"}>${disabled ? "Enable account" : "Disable account"}</button>
      </div>
    </article>
  `;
}

function internalRoleOptions(selectedRole) {
  const roles = [
    ["EMPLOYEE", "Employee portal"],
    ["SECURITY_GUARD", "Security portal"],
  ];
  if (hasRole("SUPER_ADMIN")) {
    roles.push(["ADMIN", "Administration portal"]);
  }
  if (selectedRole && selectedRole !== "SUPER_ADMIN" && !roles.some(([role]) => role === selectedRole)) {
    roles.push([selectedRole, formatInternalRole(selectedRole)]);
  }
  return roles.map(([role, label]) => `<option value="${escapeHtml(role)}" ${role === selectedRole ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
}

function formatInternalRole(role) {
  return String(role || "")
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function renderMonitoring(data) {
  const entries = Object.entries(data || {});
  renderMonitoringSummary(entries);
  renderWorkList("#monitoring-list", entries, ([name, status]) => {
    const title = formatMonitoringTitle(name);
    const value = typeof status === "object" && status !== null
      ? Object.entries(status).map(([key, count]) => `${formatMonitoringTitle(key)}: ${count}`).join(" · ")
      : String(status);
    return workCard(title, value);
  }, "No monitoring signals", "System signals will appear after the API responds.");
}

function renderMonitoringSummary(entries) {
  const grid = document.querySelector("#monitoring-summary");
  if (!grid) {
    return;
  }

  const items = Array.isArray(entries) ? entries.slice(0, 4) : [];
  grid.innerHTML = items.length ? items.map(([name, status]) => `
    <article class="admin-metric-card admin-metric-card--monitor">
      <span class="metric-card__label">${escapeHtml(formatMonitoringTitle(name))}</span>
      <strong>${escapeHtml(formatMonitoringStatus(status))}</strong>
      <small>${escapeHtml(formatMonitoringDetail(status))}</small>
    </article>
  `).join("") : `
    <article class="empty-state empty-state--inline">
      <h3>No monitoring summary yet</h3>
      <p>Service indicators will appear after the API responds.</p>
    </article>
  `;
}

function formatMonitoringStatus(status) {
  if (typeof status === "object" && status !== null) {
    return String(Object.values(status).reduce((sum, value) => sum + (Number(value) || 0), 0));
  }
  return String(status ?? "Unknown");
}

function formatMonitoringDetail(status) {
  if (typeof status === "object" && status !== null) {
    return Object.entries(status).map(([key, value]) => `${formatMonitoringTitle(key)} ${value}`).join(" · ");
  }
  return "Latest platform signal";
}

function renderAnalytics(data) {
  const analytics = normalizeAnalyticsPayload(data);
  renderDashboardCards(analytics.widgets);
  renderChart("#daily-visitors-chart", barChart(analytics.dailyVisitors, "Visitors"));
  renderChart("#monthly-trends-chart", lineChart(analytics.monthlyTrends));
  renderChart("#peak-hours-chart", compactBars(analytics.peakHours));
  renderChart("#approval-rates-chart", approvalRateChart(analytics.approvalRates));
  renderOperationalAnalytics(analytics);
  renderEmployeeAnalytics(analytics.employeeAnalytics);
  renderWorkforceAttendanceAnalytics(analytics.workforceAttendance);
}

function renderAnalyticsLoading() {
  renderChart("#daily-visitors-chart", chartEmpty("Waiting for visitor activity..."));
  renderChart("#monthly-trends-chart", chartEmpty("Trends will appear as activity accumulates."));
  renderChart("#peak-hours-chart", chartEmpty("Peak-hour signals will appear after check-ins."));
  renderChart("#approval-rates-chart", chartEmpty("Decision patterns will appear after approvals."));
  renderOperationalAnalytics(defaultAnalyticsPayload());
  renderEmployeeAnalytics([]);
  renderWorkforceAttendanceAnalytics({});
}

function renderAnalyticsRecovery(message = "") {
  const panel = document.querySelector("#analytics-recovery");
  if (!panel) {
    return;
  }
  if (!message) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }
  panel.hidden = false;
  panel.innerHTML = `
    <div>
      <strong>Analytics partially unavailable</strong>
      <p>${escapeHtml(message)} The workspace is using safe defaults while live analytics recover.</p>
    </div>
    <button class="button button--ghost button--small" type="button" data-analytics-retry>Retry</button>
  `;
  panel.querySelector("[data-analytics-retry]")?.addEventListener("click", () => {
    void loadWorkspace(currentRoute, { preserveToasts: true });
  });
}

function defaultAnalyticsPayload() {
  return {
    timezone: "UTC",
    metrics: {
      activeOrganizations: 0,
      activeVisitors: 0,
      totalVisitors: 0,
      pendingApprovals: 0,
      todayCheckIns: 0,
      rejectedVisitors: 0,
    },
    organizations: [],
    visitors: [],
    workforce: [],
    alerts: [],
    widgets: [
      { label: "Total visitors", value: 0, note: "No analytics available yet" },
      { label: "Active visitors", value: 0, note: "Waiting for organization activity" },
      { label: "Pending approvals", value: 0, note: "No visitor activity recorded" },
      { label: "Today's check-ins", value: 0, note: "No check-ins recorded today" },
      { label: "Rejected visitors", value: 0, note: "No rejected visits recorded" },
    ],
    dailyVisitors: [],
    monthlyTrends: [],
    peakHours: [],
    visitorFlow: [],
    staffingInsights: [],
    approvalWorkload: [],
    checkInTrends: [],
    approvalRates: [],
    employeeAnalytics: [],
    trafficHeatmap: [],
    checkInHours: [],
    checkOutHours: [],
    workforceRushHours: [],
    weeklyPatterns: [],
    dailyPatterns: [],
    repeatVisitors: [],
    repeatOrganizations: [],
    repeatDeniedVisitors: [],
    denialTrends: [],
    denialReasons: [],
    denialAttempts: [],
    securityIncidents: [],
    incidentTrends: [],
    workforceAnomalies: [],
    liveOperations: [],
    organizationBreakdown: [],
    departmentBreakdown: [],
    visitorCategoryBreakdown: [],
    checkpointActivity: [],
    operationalInsights: [],
    exportSnapshots: [],
    workforceAttendance: {
      timezone: "UTC",
      widgets: [],
      recentLogs: [],
    },
  };
}

function normalizeAnalyticsPayload(data = {}) {
  const fallback = defaultAnalyticsPayload();
  const source = isObject(data) ? data : {};
  const workforceAttendance = isObject(source.workforceAttendance) ? source.workforceAttendance : fallback.workforceAttendance;
  return {
    ...fallback,
    ...source,
    metrics: isObject(source.metrics) ? { ...fallback.metrics, ...source.metrics } : fallback.metrics,
    organizations: normalizeArray(source.organizations),
    visitors: normalizeArray(source.visitors),
    workforce: normalizeArray(source.workforce),
    alerts: normalizeArray(source.alerts),
    widgets: normalizeMetricItems(source.widgets, fallback.widgets),
    dailyVisitors: normalizeChartSeries(source.dailyVisitors),
    monthlyTrends: normalizeChartSeries(source.monthlyTrends),
    peakHours: normalizeChartSeries(source.peakHours),
    visitorFlow: normalizeChartSeries(source.visitorFlow),
    staffingInsights: normalizeArray(source.staffingInsights),
    approvalWorkload: normalizeChartSeries(source.approvalWorkload),
    checkInTrends: normalizeChartSeries(source.checkInTrends),
    approvalRates: normalizeArray(source.approvalRates),
    employeeAnalytics: normalizeArray(source.employeeAnalytics),
    trafficHeatmap: normalizeHeatmap(source.trafficHeatmap),
    checkInHours: normalizeChartSeries(source.checkInHours),
    checkOutHours: normalizeChartSeries(source.checkOutHours),
    workforceRushHours: normalizeChartSeries(source.workforceRushHours),
    weeklyPatterns: normalizeChartSeries(source.weeklyPatterns),
    dailyPatterns: normalizeChartSeries(source.dailyPatterns),
    repeatVisitors: normalizeArray(source.repeatVisitors),
    repeatOrganizations: normalizeArray(source.repeatOrganizations),
    repeatDeniedVisitors: normalizeArray(source.repeatDeniedVisitors),
    denialTrends: normalizeChartSeries(source.denialTrends),
    denialReasons: normalizeArray(source.denialReasons),
    denialAttempts: normalizeArray(source.denialAttempts),
    securityIncidents: normalizeArray(source.securityIncidents),
    incidentTrends: normalizeChartSeries(source.incidentTrends),
    workforceAnomalies: normalizeArray(source.workforceAnomalies),
    liveOperations: normalizeArray(source.liveOperations),
    organizationBreakdown: normalizeArray(source.organizationBreakdown),
    departmentBreakdown: normalizeArray(source.departmentBreakdown),
    visitorCategoryBreakdown: normalizeArray(source.visitorCategoryBreakdown),
    checkpointActivity: normalizeArray(source.checkpointActivity),
    operationalInsights: normalizeArray(source.operationalInsights),
    exportSnapshots: normalizeArray(source.exportSnapshots),
    workforceAttendance: {
      ...fallback.workforceAttendance,
      ...workforceAttendance,
      widgets: normalizeMetricItems(workforceAttendance.widgets, []),
      recentLogs: normalizeArray(workforceAttendance.recentLogs),
    },
  };
}

function normalizeMetricItems(items, fallback = []) {
  const values = normalizeArray(items)
    .filter((item) => isObject(item))
    .map((item) => ({
      label: item.label || "Metric",
      value: item.value ?? 0,
      note: item.note || "No analytics available yet",
    }));
  return values.length ? values : fallback;
}

function normalizeChartSeries(items) {
  return normalizeArray(items)
    .filter((item) => isObject(item))
    .map((item) => ({
      label: item.label || "N/A",
      value: Number(item.value) || 0,
    }));
}

function normalizeHeatmap(items) {
  return normalizeArray(items)
    .filter((item) => isObject(item))
    .map((item) => ({
      label: item.label || "Day",
      date: item.date || "",
      hours: normalizeArray(item.hours).map((hour) => ({
        hour: hour.hour || "00:00",
        value: Number(hour.value) || 0,
      })),
    }));
}

function renderOperationalAnalytics(analytics) {
  renderOperationalTiles("#live-operations-grid", analytics.liveOperations, "No live operations yet", "Current active visitors, workforce, checkpoints, and expiration windows will appear here.");
  renderOperationalInsights(analytics.operationalInsights);
  renderChart("#traffic-heatmap-chart", heatmapChart(analytics.trafficHeatmap));
  renderChart("#workforce-rush-chart", compactBars(analytics.workforceRushHours));
  renderChart("#denial-trends-chart", lineChart(analytics.denialTrends));
  renderChart("#incident-trends-chart", lineChart(analytics.incidentTrends));
  renderOperationalSignals("#repeat-visitor-list", [
    ...analytics.repeatVisitors.map((item) => ({ ...item, group: "Frequent visitor" })),
    ...analytics.repeatOrganizations.map((item) => ({ ...item, group: "Repeat organization" })),
  ], "No repeat traffic yet", "Frequent visitors, recurring vendors, and repeated organizations will appear after activity accumulates.");
  renderOperationalSignals("#security-intelligence-list", [
    ...analytics.denialReasons.map((item) => ({ ...item, group: "Denial reason" })),
    ...analytics.repeatDeniedVisitors.map((item) => ({ ...item, group: "Repeat denial" })),
    ...analytics.denialAttempts.map((item) => ({ ...item, group: "Retry attempt" })),
    ...analytics.securityIncidents.map((item) => ({ ...item, group: "Incident" })),
  ], "No security intelligence yet", "Denied-entry reasons, retry patterns, and escalations will appear here.");
  renderOperationalSignals("#workforce-anomaly-list", analytics.workforceAnomalies, "No workforce anomalies", "Late arrivals, missing check-outs, suspicious activity, and manual overrides will appear here.");
  renderOperationalSignals("#site-scope-list", [
    ...analytics.checkpointActivity.map((item) => ({ ...item, group: "Checkpoint" })),
    ...analytics.organizationBreakdown.map((item) => ({ ...item, group: "Organization" })),
    ...analytics.departmentBreakdown.map((item) => ({ ...item, group: "Department" })),
    ...analytics.visitorCategoryBreakdown.map((item) => ({ ...item, group: "Visitor category" })),
  ], "No site activity yet", "Organization, department, site/checkpoint, and category activity will appear here.");
  renderOperationalExports(analytics.exportSnapshots, analytics);
}

function renderOperationalTiles(selector, items, emptyTitle, emptyBody) {
  const element = document.querySelector(selector);
  if (!element) {
    return;
  }
  const rows = normalizeArray(items);
  element.innerHTML = rows.length ? rows.map((item) => `
    <article class="operational-intel-card">
      <span>${escapeHtml(item.label || "Signal")}</span>
      <strong>${escapeHtml(item.value ?? 0)}</strong>
      <small>${escapeHtml(item.note || "Operational state")}</small>
    </article>
  `).join("") : emptyInline(emptyTitle, emptyBody);
}

function renderOperationalInsights(items) {
  const element = document.querySelector("#operational-insights-list");
  if (!element) {
    return;
  }
  const rows = normalizeArray(items);
  element.innerHTML = rows.length ? rows.slice(0, 6).map((item) => `
    <article class="operational-insight-card operational-insight-card--${escapeHtml(String(item.severity || "low").toLowerCase())}">
      <span>${escapeHtml(item.severity || "Signal")}</span>
      <strong>${escapeHtml(item.label || "Operational insight")}</strong>
      <small>${escapeHtml(item.detail || "Access pattern detected.")}</small>
    </article>
  `).join("") : emptyInline("No insights yet", "Actionable operational insights will appear after traffic, denial, incident, and workforce patterns accumulate.");
}

function renderOperationalSignals(selector, items, emptyTitle, emptyBody) {
  const element = document.querySelector(selector);
  if (!element) {
    return;
  }
  const rows = normalizeArray(items).filter((item) => isObject(item));
  element.innerHTML = rows.length ? rows.slice(0, 10).map((item) => `
    <article class="operational-signal-card">
      <div>
        <span>${escapeHtml(item.group || item.severity || "Signal")}</span>
        <strong>${escapeHtml(item.label || item.target || "Operational signal")}</strong>
        <small>${escapeHtml(item.note || item.reason || item.detail || item.organization || item.value || "Recorded")}</small>
      </div>
      <b>${escapeHtml(item.value ?? item.records ?? "")}</b>
    </article>
  `).join("") : emptyInline(emptyTitle, emptyBody);
}

function renderOperationalExports(items, analytics) {
  const element = document.querySelector("#operational-export-grid");
  if (!element) {
    return;
  }
  const rows = normalizeArray(items);
  element.innerHTML = rows.length ? rows.map((item) => `
    <article class="operational-export-card">
      <span>${escapeHtml(item.format || "CSV")}</span>
      <strong>${escapeHtml(item.label || "Operational report")}</strong>
      <small>${escapeHtml(item.note || "Exportable operational snapshot")}</small>
      <button class="button button--ghost button--small" type="button" data-export-snapshot="${escapeHtml(item.label || "snapshot")}" data-export-format="${escapeHtml(item.format || "CSV")}">Export ${escapeHtml(item.format || "CSV")}</button>
    </article>
  `).join("") : emptyInline("No export snapshots", "Visitor, denial, incident, workforce, and operational snapshots will appear here.");
  element.querySelectorAll("[data-export-snapshot]").forEach((button) => {
    button.addEventListener("click", () => exportOperationalSnapshot(button.dataset.exportSnapshot, button.dataset.exportFormat, analytics));
  });
}

function heatmapChart(rows) {
  if (!rows.length || !rows.some((row) => normalizeArray(row.hours).some((hour) => Number(hour.value) > 0))) {
    return chartEmpty("No hourly traffic activity yet.");
  }
  const max = Math.max(1, ...rows.flatMap((row) => normalizeArray(row.hours).map((hour) => Number(hour.value) || 0)));
  return `
    <div class="traffic-heatmap">
      ${rows.map((row) => `
        <div class="traffic-heatmap__row">
          <span>${escapeHtml(row.label)}</span>
          <div>
            ${normalizeArray(row.hours).map((hour) => {
              const alpha = 0.16 + Math.min(0.84, (Number(hour.value) || 0) / max);
              return `<i style="opacity:${alpha}" title="${escapeHtml(row.label)} ${escapeHtml(hour.hour)}: ${escapeHtml(hour.value)}"></i>`;
            }).join("")}
          </div>
        </div>
      `).join("")}
      <div class="traffic-heatmap__axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
    </div>
  `;
}

function exportOperationalSnapshot(label, format, analytics) {
  const normalizedFormat = String(format || "CSV").toUpperCase();
  const filename = `${String(label || "operational-snapshot").toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "") || "operational-snapshot"}-${new Date().toISOString().slice(0, 10)}`;
  if (normalizedFormat === "PDF") {
    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) {
      showToast("Export blocked", "Allow pop-ups to generate the PDF snapshot.");
      return;
    }
    printWindow.document.write(reportHtml(label, analytics));
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    return;
  }
  const csv = operationalCsv(label, analytics);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function operationalCsv(label, analytics) {
  const sections = [
    ["Live operations", analytics.liveOperations],
    ["Insights", analytics.operationalInsights],
    ["Repeat visitors", analytics.repeatVisitors],
    ["Denied reasons", analytics.denialReasons],
    ["Security incidents", analytics.securityIncidents],
    ["Workforce anomalies", analytics.workforceAnomalies],
    ["Checkpoint activity", analytics.checkpointActivity],
  ];
  const rows = [["Report", "Section", "Label", "Value", "Detail"]];
  sections.forEach(([section, items]) => {
    normalizeArray(items).forEach((item) => {
      rows.push([
        label || "Operational snapshot",
        section,
        item.label || item.target || "",
        item.value ?? item.records ?? item.severity ?? "",
        item.note || item.detail || item.reason || item.organization || "",
      ]);
    });
  });
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function reportHtml(label, analytics) {
  const cards = normalizeArray(analytics.liveOperations).map((item) => `
    <article><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value ?? 0)}</strong><small>${escapeHtml(item.note || "")}</small></article>
  `).join("");
  const insights = normalizeArray(analytics.operationalInsights).map((item) => `<li><strong>${escapeHtml(item.label)}</strong> ${escapeHtml(item.detail || "")}</li>`).join("");
  return `<!doctype html><html><head><title>${escapeHtml(label || "Operational snapshot")}</title><style>
    body{font-family:Inter,Arial,sans-serif;margin:32px;color:#111827} h1{margin:0 0 8px} p{color:#4b5563}
    section{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:24px 0}
    article{border:1px solid #d1d5db;border-radius:10px;padding:14px} span,small{display:block;color:#6b7280;font-size:12px;text-transform:uppercase} strong{display:block;font-size:28px;margin:8px 0}
  </style></head><body><h1>${escapeHtml(label || "Operational snapshot")}</h1><p>AccessFlow operational intelligence export generated ${escapeHtml(new Date().toLocaleString())}.</p><section>${cards}</section><h2>Actionable insights</h2><ul>${insights}</ul></body></html>`;
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function renderPlatformAnalytics(data, organizations, monitoring) {
  const analytics = normalizeAnalyticsPayload(data);
  const organizationItems = normalizeArray(organizations);
  const monitoringData = isObject(monitoring) ? monitoring : {};
  const activeOrganizations = organizationItems.filter((organization) => organization?.activeStatus !== false).length;
  const pausedOrganizations = organizationItems.length - activeOrganizations;
  const pendingApprovals = analytics.metrics?.pendingApprovals ?? findWidgetValue(analytics.widgets, "Pending approvals");
  const visitorsToday = analytics.metrics?.todayCheckIns ?? findWidgetValue(analytics.widgets, "Today's check-ins");
  const apiStatus = monitoringData.runtime || "Unknown";

  renderDashboardCards([
    { label: "Active organizations", value: activeOrganizations, note: `${organizationItems.length} total tenants` },
    { label: "Paused tenants", value: pausedOrganizations, note: "Lifecycle controls requiring review" },
    { label: "Pending approvals", value: pendingApprovals, note: "System-wide visitor workload" },
    { label: "Visitors today", value: visitorsToday, note: "Cross-organization usage" },
    { label: "Runtime", value: apiStatus, note: "Latest platform health signal" },
  ]);
  renderChart("#daily-visitors-chart", barChart(analytics.dailyVisitors, "Visitors"));
  renderChart("#monthly-trends-chart", lineChart(analytics.monthlyTrends));
  renderOperationalAnalytics(analytics);
  renderTenantHealthList("#tenant-health-list", organizationItems.slice(0, 5));
  renderPlatformSignalList("#security-overview-list", monitoringData);
}

function renderTenantHealth(organizations) {
  renderTenantHealthSummary(organizations);
  renderTenantHealthList("#tenant-health-list", organizations);
}

function renderTenantHealthSummary(organizations) {
  const grid = document.querySelector("#tenant-health-summary");
  if (!grid) {
    return;
  }
  const active = organizations.filter((organization) => organization.activeStatus !== false).length;
  const paused = organizations.length - active;
  const withAdmins = organizations.filter((organization) => Number(organization.adminCount || organization.adminsCount || 0) > 0).length;
  grid.innerHTML = [
    { label: "Organizations", value: organizations.length, note: "Total tenants under governance" },
    { label: "Active", value: active, note: "Ready for organization operations" },
    { label: "Paused", value: paused, note: "Lifecycle attention needed" },
    { label: "Admin coverage", value: withAdmins, note: "Tenants with assigned admins" },
  ].map(metricCard).join("");
}

function renderTenantHealthList(selector, organizations) {
  renderWorkList(selector, organizations, (organization) => {
    const status = organization.activeStatus === false ? "Paused" : "Active";
    const admins = organization.adminCount ?? organization.adminsCount ?? organization.totalAdmins ?? "Admin coverage pending";
    const detail = `${organization.companyCode || "No code"} · ${status} · ${organization.timezone || "Timezone pending"}`;
    return workCard(organization.companyName || "Organization", detail, `Admins: ${admins}`);
  }, "No organizations yet", "Create organizations to start tenant lifecycle governance.");
}

function renderPlatformSignalList(selector, monitoring) {
  const entries = Object.entries(monitoring || {});
  renderWorkList(selector, entries, ([name, status]) => workCard(
    formatMonitoringTitle(name),
    formatMonitoringStatus(status),
    formatMonitoringDetail(status),
  ), "No platform signals yet", "Runtime and API readiness will appear after the backend responds.");
}

function renderSecurityMonitoring(reports, monitoring) {
  const entries = [
    ...reports.map((report) => ({
      title: report.title || "Audit event",
      detail: report.status || "Security event recorded",
      meta: report.createdAt ? formatDateTime(report.createdAt) : "Latest audit signal",
    })),
    ...Object.entries(monitoring || {}).map(([name, status]) => ({
      title: formatMonitoringTitle(name),
      detail: formatMonitoringStatus(status),
      meta: formatMonitoringDetail(status),
    })),
  ];
  renderSecuritySummary(entries);
  renderWorkList("#security-monitoring-list", entries, (item) => workCard(item.title, item.detail, item.meta), "No security signals yet", "Privileged events and runtime security posture will appear here.");
}

function renderSecuritySummary(entries) {
  const grid = document.querySelector("#security-summary");
  if (!grid) {
    return;
  }
  grid.innerHTML = [
    { label: "Signals", value: entries.length, note: "Audit and runtime indicators" },
    { label: "Runtime", value: entries.some((item) => item.title === "Runtime") ? "Tracked" : "Pending", note: "Backend health visibility" },
    { label: "Audit stream", value: entries.length ? "Active" : "Quiet", note: "Privileged event feed" },
  ].map(metricCard).join("");
}

function renderAttendancePresence(items) {
  const logs = Array.isArray(items) ? items : [];
  const grid = document.querySelector("#attendance-summary");
  if (grid) {
    const checkedIn = logs.filter((item) => String(item.status || item.state || "").toUpperCase().includes("IN")).length;
    grid.innerHTML = [
      { label: "Presence logs", value: logs.length, note: "Recent workforce attendance records" },
      { label: "Currently inside", value: checkedIn, note: "Open or active attendance states" },
      { label: "Organization", value: currentSession?.organizationCode || "Scoped", note: "Admin isolation enforced server-side" },
    ].map(metricCard).join("");
  }

  const table = document.querySelector("#attendance-presence-table");
  if (!table) {
    return;
  }
  table.innerHTML = logs.length ? `
    <table>
      <thead>
        <tr><th>Employee</th><th>Status</th><th>Check in</th><th>Check out</th></tr>
      </thead>
      <tbody>
        ${logs.map((item) => `
          <tr>
            <td data-label="Employee">${escapeHtml(item.fullName || item.employeeName || item.userName || "Employee")}</td>
            <td data-label="Status">${escapeHtml(formatStatusLabel(item.status || item.state || "Unknown"))}</td>
            <td data-label="Check in">${escapeHtml(formatDateTime(item.checkInTime || item.checkedInAt || item.createdAt))}</td>
            <td data-label="Check out">${escapeHtml(formatDateTime(item.checkOutTime || item.checkedOutAt))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  ` : `
    <article class="empty-state empty-state--inline">
      <h3>No presence logs yet</h3>
      <p>Employee check-in and check-out activity will appear here as workforce QR scans occur.</p>
    </article>
  `;
}

function renderNotificationsWorkspace(data) {
  const items = Array.isArray(data.items) ? data.items : [];
  renderWorkList("#notifications-workspace-list", items, (item) => workCard(
    item.title || "Notification",
    item.message || "No message available",
    `${item.read ? "Read" : "Unread"} · ${formatDateTime(item.createdAt)}`,
  ), "No notifications", "New visitor, approval, and workforce notifications will appear here.");
}

function renderOrganizationSettings(organizations, departments) {
  const organization = organizations[0] || {};
  const grid = document.querySelector("#organization-settings-summary");
  if (grid) {
    grid.innerHTML = [
      { label: "Organization", value: organization.companyCode || currentSession?.organizationCode || "Scoped", note: organization.companyName || currentSession?.organizationName || "Current tenant" },
      { label: "Departments", value: departments.length, note: "Configured assignment groups" },
      { label: "Timezone", value: organization.timezone || currentSession?.organizationTimezone || "UTC", note: "Used for operational reporting" },
    ].map(metricCard).join("");
  }

  const items = [
    { title: organization.companyName || currentSession?.organizationName || "Organization", detail: organization.contactEmail || "Contact email not configured", meta: organization.regionCountry || organization.companyCode || currentSession?.organizationCode || "Tenant identity" },
    ...departments.slice(0, 8).map((department) => ({
      title: department.departmentName,
      detail: department.activeStatus === false ? "Inactive department" : "Active department",
      meta: "Available for employee assignment",
    })),
  ];
  renderWorkList("#organization-settings-list", items, (item) => workCard(item.title, item.detail, item.meta), "Organization settings unavailable", "Organization context will appear after the API responds.");
}

function metricCard(metric) {
  return `
    <article class="admin-metric-card">
      <span class="metric-card__label">${escapeHtml(metric.label)}</span>
      <strong>${escapeHtml(metric.value)}</strong>
      <small>${escapeHtml(metric.note)}</small>
    </article>
  `;
}

function findWidgetValue(widgets = [], label) {
  const widget = widgets.find((item) => String(item.label || "").toLowerCase() === label.toLowerCase());
  return widget?.value ?? 0;
}

function renderHomepageSettings(data) {
  homepageMetricOptions = Array.isArray(data?.availableMetrics) ? data.availableMetrics : [];
  homepagePreviewSource = data?.publicPreview || {};
  const settings = data?.settings || {};
  const form = document.querySelector("#homepage-settings-form");
  if (!form) {
    return;
  }

  form.querySelector("input[name='statsVisible']").checked = Boolean(settings.statsVisible);
  form.querySelector("input[name='publicCountersVisible']").checked = Boolean(settings.publicCountersVisible);
  form.querySelector("input[name='featuredMetricsVisible']").checked = Boolean(settings.featuredMetricsVisible);
  form.querySelector("input[name='announcementVisible']").checked = Boolean(settings.announcementVisible);
  form.querySelector("input[name='announcementTitle']").value = settings.announcementTitle || "";
  form.querySelector("textarea[name='announcementBody']").value = settings.announcementBody || "";

  renderMetricOptions("#featured-metrics-options", "featuredMetricKeys", settings.featuredMetricKeys || []);
  renderMetricOptions("#public-counters-options", "publicMetricKeys", settings.publicMetricKeys || []);
  syncHomepagePreviewFromForm(form);

  const canEdit = hasRole("SUPER_ADMIN");
  form.querySelectorAll("input, textarea, button[type='submit']").forEach((element) => {
    if (element.type === "submit") {
      element.disabled = !canEdit;
      return;
    }
    element.disabled = !canEdit;
  });

  const meta = document.querySelector("#homepage-settings-meta");
  if (meta) {
    meta.textContent = settings.updatedAt
      ? `Last updated ${formatDateTime(settings.updatedAt)}${settings.updatedBy ? ` by ${settings.updatedBy}` : ""}.`
      : canEdit
        ? "Homepage controls are ready to configure."
        : "Homepage controls are visible here, but only SUPER_ADMIN can change them.";
  }
}

function resolveAllowedRoutes() {
  return portalProfile?.routes || ["dashboard"];
}

function hasRole(role) {
  return (currentSession?.roles || []).includes(role);
}

function renderMetricOptions(selector, name, selectedKeys) {
  const container = document.querySelector(selector);
  if (!container) {
    return;
  }

  const selected = new Set(selectedKeys || []);
  container.innerHTML = homepageMetricOptions.map((metric) => `
    <label class="metric-option-card ${selected.has(metric.key) ? "is-selected" : ""}">
      <input name="${escapeHtml(name)}" type="checkbox" value="${escapeHtml(metric.key)}" ${selected.has(metric.key) ? "checked" : ""} />
      <span class="metric-option-card__body">
        <strong>${escapeHtml(metric.label)}</strong>
        <small>${escapeHtml(metric.note)}</small>
      </span>
      <span class="metric-option-card__state">${selected.has(metric.key) ? "Selected" : "Optional"}</span>
    </label>
  `).join("");
}

function renderHomepagePreview(preview) {
  const container = document.querySelector("#homepage-settings-preview");
  if (!container) {
    return;
  }

  const announcement = preview?.announcement;
  const featuredMetrics = Array.isArray(preview?.featuredMetrics) ? preview.featuredMetrics : [];
  const publicCounters = Array.isArray(preview?.publicCounters) ? preview.publicCounters : [];

  container.innerHTML = `
    <article class="homepage-preview-shell">
      <section class="homepage-preview-hero">
        <div class="homepage-preview-hero__copy">
          <p class="eyebrow">AccessFlow</p>
          <h3>Enterprise visitor access that stays structured from arrival to audit.</h3>
          <p>Visitors, hosts, and security teams move through one clean operational flow with approval visibility, tenant-aware routing, and badge validation.</p>
        </div>
        <div class="homepage-preview-counter-row">
          ${publicCounters.length ? publicCounters.map((metric) => `
            <article class="homepage-preview-counter">
              <span>${escapeHtml(metric.label)}</span>
              <strong>${escapeHtml(metric.value)}</strong>
            </article>
          `).join("") : emptyPreviewTile(preview?.publicCountersEmptyState?.message || "Hero counters are disabled or no public counter data is available yet.")}
        </div>
      </section>
      ${announcement?.title && announcement?.body ? `
        <article class="homepage-preview-card homepage-preview-card--announcement">
          <p class="eyebrow">Announcement</p>
          <h3>${escapeHtml(announcement.title)}</h3>
          <p>${escapeHtml(announcement.body)}</p>
        </article>
      ` : `
        <article class="homepage-preview-card homepage-preview-card--empty">
          <p class="eyebrow">Announcement</p>
          <h3>No public message</h3>
          <p>Enable the announcement banner when you need to communicate maintenance, onboarding, or launch guidance.</p>
        </article>
      `}
      ${previewMetricsMarkup("Featured metrics", featuredMetrics, preview?.featuredMetricsEmptyState)}
      <article class="homepage-preview-card homepage-preview-card--cta">
        <div>
          <p class="eyebrow">Portal access</p>
          <h3>Visitors request access. Teams verify in real time.</h3>
        </div>
        <p>This section keeps portal messaging, spacing, and information density visible while you tune the public homepage experience.</p>
      </article>
    </article>
  `;
}

function previewMetricsMarkup(title, items, emptyState) {
  if (!items.length) {
    return `
      <article class="homepage-preview-card">
        <h3>${escapeHtml(title)}</h3>
        <div class="homepage-preview-empty">
          <strong>Nothing selected yet</strong>
          <p>${escapeHtml(emptyState?.message || "No public metrics are currently available.")}</p>
        </div>
      </article>
    `;
  }

  return `
    <article class="homepage-preview-card">
      <h3>${escapeHtml(title)}</h3>
      <div class="homepage-preview-metrics">
        ${items.map((metric) => `
          <div>
            <span>${escapeHtml(metric.label)}</span>
            <strong>${escapeHtml(metric.value)}</strong>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function syncHomepagePreviewFromForm(form) {
  const data = new FormData(form);
  const featuredKeys = new Set(data.getAll("featuredMetricKeys"));
  const publicKeys = new Set(data.getAll("publicMetricKeys"));
  form.querySelectorAll(".metric-option-card").forEach((card) => {
    const input = card.querySelector("input[type='checkbox']");
    const selected = Boolean(input?.checked);
    card.classList.toggle("is-selected", selected);
    const state = card.querySelector(".metric-option-card__state");
    if (state) {
      state.textContent = selected ? "Selected" : "Optional";
    }
  });

  const metricValueByKey = new Map(
    [...(homepagePreviewSource?.featuredMetrics || []), ...(homepagePreviewSource?.publicCounters || [])]
      .map((metric) => [metric.key || metric.label, metric])
  );
  const metricLookup = (keys) => homepageMetricOptions
    .filter((metric) => keys.has(metric.key))
    .map((metric) => metricValueByKey.get(metric.key) || {
      key: metric.key,
      label: metric.label,
      value: "Not available yet",
      note: metric.note,
    });

  const preview = {
    announcement: data.get("announcementVisible") === "on"
      ? {
        title: trim(form.querySelector("input[name='announcementTitle']")?.value),
        body: trim(form.querySelector("textarea[name='announcementBody']")?.value),
      }
      : null,
    featuredMetrics: data.get("featuredMetricsVisible") === "on" && data.get("statsVisible") === "on"
      ? metricLookup(featuredKeys)
      : [],
    publicCounters: data.get("publicCountersVisible") === "on" && data.get("statsVisible") === "on"
      ? metricLookup(publicKeys)
      : [],
    featuredMetricsEmptyState: homepagePreviewSource?.featuredMetricsEmptyState,
    publicCountersEmptyState: homepagePreviewSource?.publicCountersEmptyState,
  };
  if (!preview.announcement?.title || !preview.announcement?.body) {
    preview.announcement = null;
  }
  renderHomepagePreview(preview);
}

function renderHomepageSettingsState(message) {
  const preview = document.querySelector("#homepage-settings-preview");
  const meta = document.querySelector("#homepage-settings-meta");
  if (preview) {
    preview.innerHTML = `
      <article class="empty-state empty-state--inline">
        <h3>Homepage controls unavailable</h3>
        <p>${escapeHtml(message || "Homepage controls could not be loaded.")}</p>
      </article>
    `;
  }
  if (meta) {
    meta.textContent = message || "Homepage controls could not be loaded.";
  }
}

function renderOrganizations(items) {
  organizationWorkspaceItems = Array.isArray(items) ? items : [];
  renderOrganizationSummary();
  const list = document.querySelector("#organizations-list");
  const empty = document.querySelector("#organizations-empty");
  if (!list || !empty) {
    return;
  }

  const visibleItems = filteredOrganizationItems();
  empty.classList.toggle("is-hidden", visibleItems.length > 0);
  list.innerHTML = visibleItems.length ? visibleItems.map(organizationCard).join("") : "";
}

function renderDepartmentWorkspaceItems() {
  const list = document.querySelector("#departments-list");
  if (!list) {
    return;
  }

  list.innerHTML = departmentWorkspaceItems.length ? departmentWorkspaceItems.map(departmentCard).join("") : `
    <article class="empty-state empty-state--inline">
      <h3>No departments configured</h3>
      <p>Create operational teams here so account creation stays fast and standardized.</p>
    </article>
  `;
}

function departmentCard(department) {
  const organizationMeta = department.organizationName
    ? `${department.organizationName}${department.organizationCode ? ` (${department.organizationCode})` : ""}`
    : department.organizationCode || currentSession?.organizationName || currentSession?.organizationCode || "Organization";
  return `
    <article class="department-card">
      <div class="department-card__header">
        <div>
          <h3>${escapeHtml(department.departmentName)}</h3>
          <p>${escapeHtml(organizationMeta)}</p>
        </div>
        <span class="status-badge status-badge--${department.activeStatus ? "approved" : "rejected"}">${department.activeStatus ? "Active" : "Inactive"}</span>
      </div>
      <form class="department-card__editor" data-department-editor data-department-id="${escapeHtml(department.id)}">
        <label class="form-field">
          <span>Rename department</span>
          <input name="departmentName" type="text" value="${escapeHtml(department.departmentName)}" autocomplete="off" />
        </label>
        <button class="button button--ghost" type="submit">Save name</button>
      </form>
      <div class="department-card__footer">
        <small>Created ${escapeHtml(formatDateTime(department.createdAt))}</small>
        <button class="button ${department.activeStatus ? "button--ghost" : "button--primary"}" type="button" data-department-toggle data-department-id="${escapeHtml(department.id)}">${department.activeStatus ? "Deactivate" : "Activate"}</button>
      </div>
    </article>
  `;
}

function organizationCard(organization) {
  return `
    <tr class="organization-row">
      <td data-label="Organization">
        <div class="organization-row__identity">
          <strong>${escapeHtml(organization.companyName)}</strong>
          <small>${escapeHtml(organization.companyCode)} · ${escapeHtml(organization.timezone || "UTC")}${organization.contactEmail ? ` · ${escapeHtml(organization.contactEmail)}` : ""}</small>
        </div>
      </td>
      <td data-label="Admins">${escapeHtml(organization.adminCount)}</td>
      <td data-label="Employees">${escapeHtml(organization.employeeCount)}</td>
      <td data-label="Visitor activity">
        <div class="organization-row__activity">
          <strong>${escapeHtml(organization.recentVisitorCount)} recent</strong>
          <small>${escapeHtml(organization.activeVisitors)} active · ${escapeHtml(organization.pendingVisitors)} pending</small>
        </div>
      </td>
      <td data-label="Status"><span class="status-badge status-badge--${organization.activeStatus ? "approved" : "rejected"}">${organization.activeStatus ? "Active" : "Inactive"}</span></td>
      <td data-label="Created">
        <div class="organization-row__activity">
          <strong>${escapeHtml(formatDateOnly(organization.createdAt))}</strong>
          <small>${escapeHtml(organization.lastVisitorActivityAt ? `Last activity ${formatRelativeTime(organization.lastVisitorActivityAt)}` : "No visitor activity yet")}</small>
        </div>
      </td>
      <td data-label="Actions">
        <div class="organization-row__actions">
          <button class="button button--ghost button--small" type="button" data-organization-action="open" data-organization-id="${escapeHtml(organization.id)}">Manage</button>
          <button class="button ${organization.activeStatus ? "button--ghost" : "button--primary"} button--small" type="button" data-organization-action="toggle" data-organization-id="${escapeHtml(organization.id)}">${organization.activeStatus ? "Disable" : "Enable"}</button>
        </div>
      </td>
    </tr>
  `;
}

function renderOrganizationWorkspaceLoading() {
  const list = document.querySelector("#organizations-list");
  const empty = document.querySelector("#organizations-empty");
  const summary = document.querySelector("#organization-summary-grid");
  if (summary) {
    summary.innerHTML = Array.from({ length: 4 }).map(() => `
      <article class="organization-summary-card organization-summary-card--skeleton">
        <span></span>
        <strong></strong>
        <small></small>
      </article>
    `).join("");
  }
  if (list) {
    list.innerHTML = Array.from({ length: 5 }).map(() => `
      <tr class="organization-row organization-row--skeleton">
        <td colspan="7"><span></span></td>
      </tr>
    `).join("");
  }
  empty?.classList.add("is-hidden");
}

function renderOrganizationSummary() {
  const summary = document.querySelector("#organization-summary-grid");
  if (!summary) {
    return;
  }
  const total = organizationWorkspaceItems.length;
  const active = organizationWorkspaceItems.filter((item) => item.activeStatus).length;
  const visitorReady = organizationWorkspaceItems.reduce((sum, item) => sum + (Number(item.activeVisitors) || 0), 0);
  const recent = organizationWorkspaceItems.reduce((sum, item) => sum + (Number(item.recentVisitorCount) || 0), 0);
  summary.innerHTML = [
    ["Organizations", total, "Managed tenant records"],
    ["Active tenants", active, "Available in the public directory"],
    ["Active visitors", visitorReady, "Checked-in visitors across organizations"],
    ["Recent activity", recent, "Visitor records created in the last 30 days"],
  ].map(([label, value, note]) => `
    <article class="organization-summary-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(note)}</small>
    </article>
  `).join("");
}

function filteredOrganizationItems() {
  const query = String(document.querySelector("#organization-search")?.value || "").trim().toLowerCase();
  const status = String(document.querySelector("#organization-status-filter")?.value || "").trim();
  const sortBy = String(document.querySelector("#organization-sort")?.value || "companyName").trim();

  return organizationWorkspaceItems
    .filter((organization) => {
      if (status === "active" && !organization.activeStatus) {
        return false;
      }
      if (status === "inactive" && organization.activeStatus) {
        return false;
      }
      if (!query) {
        return true;
      }
      const haystack = [
        organization.companyName,
        organization.companyCode,
        organization.contactEmail,
        organization.address,
      ].join(" ").toLowerCase();
      return haystack.includes(query);
    })
    .sort((left, right) => compareOrganizationSort(left, right, sortBy));
}

function compareOrganizationSort(left, right, sortBy) {
  if (sortBy === "createdAt") {
    return new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime();
  }
  if (sortBy === "recentVisitorCount" || sortBy === "adminCount") {
    return Number(right[sortBy] || 0) - Number(left[sortBy] || 0);
  }
  return String(left.companyName || "").localeCompare(String(right.companyName || ""));
}

function organizationWorkspaceModalMarkup(workspace, mode) {
  const organization = workspace?.organization || {};
  const summary = workspace?.summary || {};
  const tabs = mode === "create"
    ? ""
    : `
      <div class="organization-workspace__tabs">
        ${["overview", "admins", "departments", "activity", "audit", "settings"].map((tab) => `
          <button class="organization-tab" type="button" data-organization-tab="${tab}">${escapeHtml(formatTabLabel(tab))}</button>
        `).join("")}
      </div>
    `;

  return `
    <div class="visitor-modal__dialog organization-workspace" role="dialog" aria-modal="true" aria-label="Organization workspace">
      <div class="panel__header organization-workspace__header">
        <div>
          <p class="eyebrow">${mode === "create" ? "New tenant" : "Organization workspace"}</p>
          <h2>${escapeHtml(mode === "create" ? "Create organization" : organization.companyName || "Organization")}</h2>
          <p class="enterprise-badge-dialog__lead">${escapeHtml(mode === "create"
            ? "Create a new tenant with clean presets and activation controls."
            : `${organization.companyCode || "ORG"} · ${organization.contactEmail || "No contact email on file"}`)}</p>
        </div>
        <button class="icon-button" type="button" data-organization-close aria-label="Close organization workspace">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.4 5 12.6 12.6-1.4 1.4L5 6.4Zm12.6 1.4L6.4 19 5 17.6 17.6 5Z"/></svg>
        </button>
      </div>
      ${tabs}
      <div class="organization-workspace__body">
        <section class="organization-tab-panel" data-organization-panel="overview" ${mode === "create" ? "hidden" : ""}>
          <div class="organization-workspace__grid">
            <article class="organization-overview-card">
              <p class="eyebrow">Summary</p>
              <div class="organization-overview-card__stats">
                ${summaryCard("Admins", summary.adminCount, "Assigned organization admins")}
                ${summaryCard("Employees", summary.employeeCount, "Internal workforce accounts")}
                ${summaryCard("Departments", summary.departmentCount, `${summary.activeDepartmentCount || 0} active`)}
                ${summaryCard("Visitors", summary.totalVisitors, `${summary.recentVisitorCount || 0} in the last 30 days`)}
              </div>
            </article>
            <article class="organization-overview-card">
              <p class="eyebrow">Tenant profile</p>
              <dl class="organization-overview-list">
                <div><dt>Code</dt><dd>${escapeHtml(organization.companyCode || "Not set")}</dd></div>
                <div><dt>Status</dt><dd>${escapeHtml(organization.activeStatus ? "Active" : "Inactive")}</dd></div>
                <div><dt>Region</dt><dd>${escapeHtml(organization.regionCountry || "Global")}</dd></div>
                <div><dt>Timezone</dt><dd>${escapeHtml(organization.timezone || "UTC")}</dd></div>
                <div><dt>Created</dt><dd>${escapeHtml(formatDateTime(organization.createdAt))}</dd></div>
                <div><dt>Public directory</dt><dd>${escapeHtml(summary.publicDirectoryVisible ? "Visible while active" : "Hidden while inactive")}</dd></div>
                <div><dt>Address</dt><dd>${escapeHtml(organization.address || "No address recorded")}</dd></div>
              </dl>
            </article>
          </div>
          <article class="organization-overview-card">
            <div class="panel__header">
              <div>
                <p class="eyebrow">Recent visitor activity</p>
                <h3>Latest records</h3>
              </div>
            </div>
            <div class="organization-activity-list">
              ${(workspace?.recentVisitors || []).length ? workspace.recentVisitors.map((visitor) => `
                <article class="organization-activity-item">
                  <div>
                    <strong>${escapeHtml(visitor.fullName || "Visitor")}</strong>
                    <p>${escapeHtml(visitor.companyName || "Independent visitor")} · ${escapeHtml(visitor.hostEmployee || "Host pending")}</p>
                  </div>
                  <div class="organization-activity-item__meta">
                    ${statusBadge(visitor.status)}
                    <small>${escapeHtml(formatDateTime(visitor.updatedAt || visitor.createdAt))}</small>
                  </div>
                </article>
              `).join("") : `
                <article class="empty-state empty-state--inline">
                  <h3>No visitor activity yet</h3>
                  <p>Recent visitor records will appear here once this organization starts using AccessFlow.</p>
                </article>
              `}
            </div>
          </article>
        </section>

        <section class="organization-tab-panel" data-organization-panel="admins" hidden>
          <div class="organization-workspace__grid">
            <article class="organization-overview-card">
              <div class="panel__header">
                <div>
                  <p class="eyebrow">Admin roster</p>
                  <h3>Manage admins</h3>
                </div>
              </div>
              <div class="organization-admin-list">
                ${(workspace?.admins || []).length ? workspace.admins.map((admin) => organizationAdminCard(admin)).join("") : `
                  <article class="empty-state empty-state--inline">
                    <h3>No admins assigned</h3>
                    <p>Create the first tenant admin below so this organization can operate independently.</p>
                  </article>
                `}
              </div>
            </article>
            <article class="organization-overview-card">
              <div class="panel__header">
                <div>
                  <p class="eyebrow">Provisioning</p>
                  <h3>Create organization admin</h3>
                </div>
              </div>
              <form class="organization-admin-form" id="organization-admin-form" novalidate>
                <label class="form-field">
                  <span>Full name</span>
                  <input name="fullName" type="text" autocomplete="name" placeholder="Tenant admin name" />
                </label>
                <label class="form-field">
                  <span>Username</span>
                  <input name="username" type="text" autocomplete="username" placeholder="tenant_admin" />
                </label>
                <label class="form-field">
                  <span>Email</span>
                  <input name="email" type="email" autocomplete="email" placeholder="admin@organization.com" />
                </label>
                <label class="form-field">
                  <span>Mobile</span>
                  <input name="phone" type="tel" autocomplete="tel" placeholder="Mobile number" />
                </label>
                <label class="form-field">
                  <span>Department</span>
                  <input name="department" type="text" value="Administration" readonly aria-readonly="true" />
                  <small class="form-field__message form-field__message--inline">Organization admins are automatically assigned to the Administration department.</small>
                </label>
                <label class="form-field form-field--wide">
                  <span>Temporary password</span>
                  <input name="password" type="text" autocomplete="new-password" placeholder="Use a strong temporary password" />
                </label>
                <button class="button button--primary" type="submit">Create admin</button>
              </form>
            </article>
          </div>
        </section>

        <section class="organization-tab-panel" data-organization-panel="departments" hidden>
          <div class="organization-workspace__grid">
            <article class="organization-overview-card">
              <div class="panel__header">
                <div>
                  <p class="eyebrow">Department controls</p>
                  <h3>Manage departments</h3>
                </div>
              </div>
              <form class="organization-department-form" id="organization-department-form" novalidate>
                <label class="form-field form-field--wide">
                  <span>New department</span>
                  <input name="departmentName" type="text" autocomplete="off" placeholder="Procurement" />
                </label>
                <button class="button button--primary" type="submit">Add department</button>
              </form>
            </article>
            <article class="organization-overview-card">
              <div class="organization-department-list">
                ${(workspace?.departments || []).length ? workspace.departments.map((department) => `
                  <article class="organization-department-card" data-organization-department-editor data-department-id="${escapeHtml(department.id)}">
                    <div class="organization-department-card__header">
                      <div>
                        <strong>${escapeHtml(department.departmentName)}</strong>
                        <small>${escapeHtml(formatDateOnly(department.createdAt))}</small>
                      </div>
                      <span class="status-badge status-badge--${department.activeStatus ? "approved" : "rejected"}">${department.activeStatus ? "Active" : "Inactive"}</span>
                    </div>
                    <form novalidate>
                      <label class="form-field form-field--wide">
                        <span>Rename department</span>
                        <input name="departmentName" type="text" value="${escapeHtml(department.departmentName)}" autocomplete="off" />
                      </label>
                      <div class="organization-row__actions">
                        <button class="button button--ghost button--small" type="submit">Save name</button>
                        <button class="button ${department.activeStatus ? "button--ghost" : "button--primary"} button--small" type="button" data-organization-department-toggle data-department-id="${escapeHtml(department.id)}">${department.activeStatus ? "Disable" : "Enable"}</button>
                      </div>
                    </form>
                  </article>
                `).join("") : `
                  <article class="empty-state empty-state--inline">
                    <h3>No departments configured</h3>
                    <p>Add only the teams this organization actually uses to keep account setup clean.</p>
                  </article>
                `}
              </div>
            </article>
          </div>
        </section>

        <section class="organization-tab-panel" data-organization-panel="activity" hidden>
          <article class="organization-overview-card">
            <div class="panel__header">
              <div>
                <p class="eyebrow">Visitor activity</p>
                <h3>Latest visitor records</h3>
              </div>
            </div>
            <div class="organization-activity-list">
              ${(workspace?.recentVisitors || []).length ? workspace.recentVisitors.map((visitor) => `
                <article class="organization-activity-item">
                  <div>
                    <strong>${escapeHtml(visitor.fullName || "Visitor")}</strong>
                    <p>${escapeHtml(visitor.companyName || "Independent visitor")}</p>
                  </div>
                  <div class="organization-activity-item__meta">
                    ${statusBadge(visitor.status)}
                    <small>${escapeHtml(visitor.hostEmployee || "No host")} · ${escapeHtml(formatRelativeTime(visitor.updatedAt || visitor.createdAt))}</small>
                  </div>
                </article>
              `).join("") : `
                <article class="empty-state empty-state--inline">
                  <h3>No recent visitor activity</h3>
                  <p>Recent visitor registrations, approvals, and check-ins will appear here.</p>
                </article>
              `}
            </div>
          </article>
        </section>

        <section class="organization-tab-panel" data-organization-panel="audit" hidden>
          <article class="organization-overview-card">
            <div class="panel__header">
              <div>
                <p class="eyebrow">Audit trail</p>
                <h3>Organization audit log</h3>
              </div>
            </div>
            <div class="organization-audit-list">
              ${(workspace?.auditLogs || []).length ? workspace.auditLogs.map((entry) => `
                <article class="organization-audit-item">
                  <div>
                    <strong>${escapeHtml(entry.action)}</strong>
                    <p>${escapeHtml(entry.details || entry.outcome || "Audit event recorded.")}</p>
                  </div>
                  <div class="organization-activity-item__meta">
                    <span class="status-badge status-badge--approved">${escapeHtml(entry.outcome || "Recorded")}</span>
                    <small>${escapeHtml(entry.actorName || "System")} · ${escapeHtml(formatDateTime(entry.createdAt))}</small>
                  </div>
                </article>
              `).join("") : `
                <article class="empty-state empty-state--inline">
                  <h3>No audit events yet</h3>
                  <p>Admin and tenant operations will appear here once activity is recorded.</p>
                </article>
              `}
            </div>
          </article>
        </section>

        <section class="organization-tab-panel" data-organization-panel="settings" ${mode === "create" ? "" : "hidden"}>
          <article class="organization-overview-card">
            <div class="panel__header">
              <div>
                <p class="eyebrow">Configuration</p>
                <h3>${mode === "create" ? "Organization setup" : "Organization settings"}</h3>
              </div>
            </div>
            <form class="organization-form" id="organization-form" novalidate>
              <input name="organizationId" type="hidden" />
              <label class="form-field">
                <span>Organization name</span>
                <input name="companyName" type="text" autocomplete="organization" placeholder="Northstar Labs" required />
              </label>
              <label class="form-field">
                <span>Organization code</span>
                <input name="companyCode" type="text" autocomplete="organization" placeholder="NORTHSTAR" required />
              </label>
              <label class="form-field">
                <span>Contact email</span>
                <input name="contactEmail" type="email" autocomplete="email" placeholder="ops@northstar.com" />
              </label>
              <label class="form-field">
                <span>Organization region/country</span>
                <input name="regionCountry" type="text" autocomplete="country-name" placeholder="India" required />
              </label>
              <label class="form-field">
                <span>Organization timezone</span>
                <select name="timezone" required>
                  ${ORGANIZATION_TIMEZONES.map((timezone) => `<option value="${escapeHtml(timezone)}">${escapeHtml(timezone)}</option>`).join("")}
                </select>
              </label>
              <label class="form-field form-field--wide">
                <span>Address</span>
                <input name="address" type="text" autocomplete="street-address" placeholder="Street, city, country" />
              </label>
              <div class="form-field form-field--wide">
                <span>Department presets</span>
                <small class="form-field__message form-field__message--inline">Seed only the departments this organization uses so downstream account assignment stays clean.</small>
                <div class="department-preset-editor">
                  <div class="department-preset-editor__chips" id="organization-department-list"></div>
                  <div class="department-preset-editor__entry">
                    <input id="organization-department-input" type="text" autocomplete="off" placeholder="Add department preset" />
                    <button class="button button--ghost" id="organization-department-add" type="button">Add</button>
                  </div>
                  <div class="department-preset-editor__suggestions" id="organization-department-suggestions"></div>
                </div>
              </div>
              <label class="toggle-card form-field--wide">
                <input name="activeStatus" type="checkbox" checked />
                <span class="toggle-card__content">
                  <strong>Organization is active</strong>
                  <small>Active organizations appear in the public directory and remain available for visitor and account workflows.</small>
                </span>
                <span class="toggle-card__switch" aria-hidden="true"></span>
              </label>
              <div class="organization-form__footer">
                <p id="organization-form-meta">${escapeHtml(mode === "create" ? "Create organizations for tenant onboarding and admin assignment." : "Update tenant details, public visibility, and department presets from one place.")}</p>
                <div class="organization-form__actions">
                  ${mode === "create" ? "" : `<button class="button button--ghost" id="organization-form-reset" type="button" data-organization-tab="overview">Back to overview</button>`}
                  <button class="button button--primary" type="submit">${mode === "create" ? "Create organization" : "Save organization"}</button>
                </div>
              </div>
            </form>
          </article>
        </section>
      </div>
    </div>
  `;
}

function organizationAdminCard(user) {
  const disabled = !user.active || user.accountStatus === "DISABLED";
  const platformOwner = (user.roles || []).includes("SUPER_ADMIN");
  const roleControls = platformOwner ? `
      <div class="admin-user-card__role">
        <p class="form-field__message form-field__message--inline">Platform-owner access is controlled by secure backend workflows.</p>
      </div>
  ` : `
      <div class="admin-user-card__role">
        <label class="form-field">
          <span>Portal access</span>
          <select data-role-select>
            ${internalRoleOptions((user.roles || [])[0] || "ADMIN")}
          </select>
        </label>
        <button class="button button--ghost button--small" type="button" data-organization-admin-action="role" data-user-id="${escapeHtml(user.id)}">Update access</button>
      </div>
  `;
  return `
    <article class="organization-admin-card" data-organization-admin-card>
      <div class="organization-admin-card__header">
        <div>
          <strong>${escapeHtml(user.fullName || user.email || "Unknown user")}</strong>
          <p>${escapeHtml(user.email || "No email")} · ${escapeHtml(user.username || "No username")}</p>
        </div>
        <span class="status-badge status-badge--${disabled ? "rejected" : "approved"}">${disabled ? "Disabled" : "Active"}</span>
      </div>
      <div class="organization-admin-card__meta">
        <span>${escapeHtml(user.department || "Department not set")}</span>
        <span>${escapeHtml(formatDateOnly(user.createdAt))}</span>
      </div>
      ${roleControls}
      <div class="organization-row__actions">
        <button class="button button--ghost button--small" type="button" data-organization-admin-action="reset-password" data-user-id="${escapeHtml(user.id)}" ${platformOwner ? "disabled" : ""}>Reset password</button>
        <button class="button ${disabled ? "button--primary" : "button--ghost"} button--small" type="button" data-organization-admin-action="${disabled ? "enable" : "disable"}" data-user-id="${escapeHtml(user.id)}" ${platformOwner ? "disabled" : ""}>${disabled ? "Enable" : "Disable"}</button>
      </div>
    </article>
  `;
}

function summaryCard(label, value, note) {
  return `
    <article class="organization-summary-card organization-summary-card--modal">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value ?? 0)}</strong>
      <small>${escapeHtml(note || "")}</small>
    </article>
  `;
}

function formatTabLabel(tab) {
  return {
    overview: "Overview",
    admins: "Admins",
    departments: "Departments",
    activity: "Visitor Activity",
    audit: "Audit Logs",
    settings: "Settings",
  }[tab] || tab;
}

function renderDashboardCards(widgets) {
  const grid = document.querySelector("#metric-grid");
  if (!grid) {
    return;
  }

  if (!widgets.length) {
    grid.innerHTML = `
      <article class="empty-state empty-state--inline">
        <h3>No analytics available yet</h3>
        <p>Waiting for organization activity and visitor records.</p>
      </article>
    `;
    return;
  }

  const icons = ["M4 19h16v2H4Zm2-8h3v6H6Zm5-6h3v12h-3Zm5 3h3v9h-3Z", "M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-7 8a7 7 0 0 1 14 0Z", "m9 16.2-3.5-3.5L4 14.2 9 19 20 8l-1.5-1.5Z", "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 11h5v-2h-4V6h-2Z", "M12 2 2 20h20Zm0 6 5.2 10H6.8Z"];
  grid.innerHTML = widgets.map((metric, index) => `
    <article class="admin-metric-card">
      <span class="admin-metric-card__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${icons[index] || icons[0]}"/></svg></span>
      <span class="metric-card__label">${escapeHtml(metric.label)}</span>
      <strong>${escapeHtml(metric.value)}</strong>
      <small>${escapeHtml(metric.note)}</small>
    </article>
  `).join("");
}

function renderChart(selector, markup) {
  const element = document.querySelector(selector);
  if (element) {
    element.innerHTML = markup;
  }
}

function barChart(data, suffix) {
  if (!data.length || !hasSeriesActivity(data)) {
    return chartEmpty("No visitor activity recorded yet.");
  }
  const max = maxValue(data);
  const bars = data.map((item, index) => {
    const height = Math.max(4, Math.round((Number(item.value) / max) * 150));
    const x = 22 + index * 38;
    const y = 174 - height;
    return `
      <rect x="${x}" y="${y}" width="22" height="${height}" rx="5"></rect>
      <text x="${x + 11}" y="198" text-anchor="middle">${escapeHtml(item.label)}</text>
      <title>${escapeHtml(item.label)}: ${escapeHtml(item.value)} ${escapeHtml(suffix)}</title>
    `;
  }).join("");
  return `<svg class="chart-svg bar-chart" viewBox="0 0 560 220" role="img" aria-label="${escapeHtml(suffix)} bar chart">${bars}</svg>`;
}

function lineChart(data) {
  if (!data.length || !hasSeriesActivity(data)) {
    return chartEmpty("Waiting for organization activity.");
  }
  const max = maxValue(data);
  const points = data.map((item, index) => {
    const x = 22 + index * 46;
    const y = 174 - Math.round((Number(item.value) / max) * 145);
    return `${x},${y}`;
  }).join(" ");
  const dots = data.map((item, index) => {
    const [x, y] = points.split(" ")[index].split(",");
    return `<circle cx="${x}" cy="${y}" r="5"><title>${escapeHtml(item.label)}: ${escapeHtml(item.value)}</title></circle>`;
  }).join("");
  const labels = data.map((item, index) => `<text x="${22 + index * 46}" y="198" text-anchor="middle">${escapeHtml(item.label)}</text>`).join("");
  return `<svg class="chart-svg line-chart" viewBox="0 0 560 220" role="img" aria-label="Monthly visitor trend"><polyline points="${points}"></polyline>${dots}${labels}</svg>`;
}

function compactBars(data) {
  const filtered = data.filter((_, index) => index % 2 === 0);
  if (!filtered.length || !hasSeriesActivity(filtered)) {
    return chartEmpty("No peak-hour activity yet.");
  }
  const max = maxValue(filtered);
  return `
    <div class="hour-chart">
      ${filtered.map((item) => `
        <div class="hour-chart__row">
          <span>${escapeHtml(item.label)}</span>
          <div><i style="width: ${Math.max(4, Math.round((Number(item.value) / max) * 100))}%"></i></div>
          <strong>${escapeHtml(item.value)}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function approvalRateChart(data) {
  if (!data.length || !hasSeriesActivity(data)) {
    return chartEmpty("No approval decisions yet.");
  }
  return `
    <div class="approval-rate-chart">
      ${data.map((item) => `
        <article>
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.percentage)}%</strong>
          <div><i style="width: ${Math.max(2, Number(item.percentage))}%"></i></div>
          <small>${escapeHtml(item.value)} visitors</small>
        </article>
      `).join("")}
    </div>
  `;
}

function renderEmployeeAnalytics(items) {
  const table = document.querySelector("#employee-analytics-table");
  if (!table) {
    return;
  }
  const rows = normalizeArray(items).filter((item) => isObject(item));

  table.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Employee</th>
          <th>Total</th>
          <th>Active</th>
          <th>Pending</th>
          <th>Rejected</th>
        </tr>
      </thead>
      <tbody>
        ${rows.length ? rows.map((item) => `
          <tr>
            <td data-label="Employee"><strong>${escapeHtml(item.employee || "Unassigned")}</strong></td>
            <td data-label="Total">${escapeHtml(item.total ?? 0)}</td>
            <td data-label="Active">${escapeHtml(item.active ?? 0)}</td>
            <td data-label="Pending">${escapeHtml(item.pending ?? 0)}</td>
            <td data-label="Rejected">${escapeHtml(item.rejected ?? 0)}</td>
          </tr>
        `).join("") : `<tr><td colspan="5"><div class="empty-state empty-state--inline"><h3>No employee activity</h3><p>Host-level analytics will appear after visitor records are created.</p></div></td></tr>`}
      </tbody>
    </table>
  `;
}

function renderWorkforceAttendanceAnalytics(data) {
  const table = document.querySelector("#workforce-attendance-table");
  if (!table) {
    return;
  }
  const widgets = normalizeMetricItems(data?.widgets, []);
  const recentLogs = normalizeArray(data?.recentLogs).filter((log) => isObject(log));
  table.innerHTML = `
    <div class="workforce-summary-grid">
      ${widgets.length ? widgets.map((item) => `
        <article class="homepage-preview-counter">
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.value)}</strong>
          <small>${escapeHtml(item.note)}</small>
        </article>
      `).join("") : `<div class="empty-state empty-state--inline"><h3>No workforce presence yet</h3><p>Presence metrics appear after employees scan or security records overrides.</p></div>`}
    </div>
    <table>
      <thead>
        <tr>
          <th>Employee</th>
          <th>Status</th>
          <th>Shift</th>
          <th>Guard</th>
        </tr>
      </thead>
      <tbody>
        ${recentLogs.length ? recentLogs.slice(0, 8).map((log) => `
          <tr>
            <td data-label="Employee"><strong>${escapeHtml(log.employeeName || "Unknown employee")}</strong></td>
            <td data-label="Status">${escapeHtml(formatStatusLabel(log.status))}</td>
            <td data-label="Shift">${escapeHtml(log.shiftName || "Shift")}</td>
            <td data-label="Guard">${escapeHtml(log.securityGuardName || "System")}</td>
          </tr>
        `).join("") : `<tr><td colspan="4"><div class="empty-state empty-state--inline"><h3>No workforce presence yet</h3><p>Waiting for employee scan activity.</p></div></td></tr>`}
      </tbody>
    </table>
  `;
}

function populateOrganizationForm(form, organization, departments = []) {
  form.querySelector("input[name='organizationId']").value = organization.id || "";
  form.querySelector("input[name='companyName']").value = organization.companyName || "";
  form.querySelector("input[name='companyCode']").value = organization.companyCode || "";
  form.querySelector("input[name='contactEmail']").value = organization.contactEmail || "";
  form.querySelector("input[name='regionCountry']").value = organization.regionCountry || "";
  form.querySelector("select[name='timezone']").value = organization.timezone || "UTC";
  form.querySelector("input[name='address']").value = organization.address || "";
  form.querySelector("input[name='activeStatus']").checked = Boolean(organization.activeStatus);
  organizationDepartmentDraft = (departments || []).map((department) => department.departmentName);
  renderOrganizationDepartmentEditor();
  const meta = document.querySelector("#organization-form-meta");
  if (meta) {
    meta.textContent = `Editing ${organization.companyName}. Save to update this tenant.`;
  }
}

function resetOrganizationForm(form) {
  form.reset();
  form.querySelector("input[name='organizationId']").value = "";
  form.querySelector("input[name='activeStatus']").checked = true;
  form.querySelector("select[name='timezone']").value = "Asia/Kolkata";
  resetOrganizationDepartmentDraft(true);
  renderOrganizationDepartmentEditor();
  const meta = document.querySelector("#organization-form-meta");
  if (meta) {
    meta.textContent = "Create organizations for tenant onboarding and admin assignment.";
  }
}

async function ensureManagedOrganizations(options = {}) {
  const { force = false } = options;
  if (managedOrganizations.length && !force) {
    return managedOrganizations;
  }

  const response = await listManagedOrganizations();
  managedOrganizations = response?.data || [];
  return managedOrganizations;
}

function populateDepartmentOrganizationFilter() {
  const select = document.querySelector("#department-organization-filter");
  if (!select) {
    return;
  }

  const selectedValue = departmentFilterOrganizationId || trim(select.value) || "";
  select.innerHTML = `<option value="">All organizations</option>${managedOrganizations.map((organization) => `
    <option value="${escapeHtml(organization.id)}">${escapeHtml(organization.companyName)} (${escapeHtml(organization.companyCode)})</option>
  `).join("")}`;

  if (selectedValue && managedOrganizations.some((organization) => organization.id === selectedValue)) {
    select.value = selectedValue;
    departmentFilterOrganizationId = selectedValue;
  } else if (!selectedValue && managedOrganizations.length === 1) {
    select.value = managedOrganizations[0].id;
    departmentFilterOrganizationId = managedOrganizations[0].id;
  } else {
    select.value = "";
    if (!managedOrganizations.some((organization) => organization.id === departmentFilterOrganizationId)) {
      departmentFilterOrganizationId = "";
    }
  }

  toggleDepartmentFormState();
}

function resolveDepartmentFilterOrganizationId() {
  if (!hasRole("SUPER_ADMIN")) {
    return currentSession?.organizationId || "";
  }
  return departmentFilterOrganizationId || trim(document.querySelector("#department-organization-filter")?.value) || "";
}

function toggleDepartmentFormState() {
  const form = document.querySelector("#department-form");
  const meta = document.querySelector("#department-management-meta");
  if (!form) {
    return;
  }

  const input = form.querySelector("input[name='departmentName']");
  const submit = form.querySelector("button[type='submit']");
  const organizationId = resolveDepartmentFilterOrganizationId();
  const locked = hasRole("SUPER_ADMIN") && !organizationId;

  if (input) {
    input.disabled = locked;
  }
  if (submit) {
    submit.disabled = locked;
  }
  if (meta) {
    meta.textContent = locked
      ? "Viewing all departments. Select one organization to add a new department."
      : "Departments stay isolated to each organization and remain available for fast account setup.";
  }
}

async function loadUserDepartmentOptions(options = {}) {
  const { preserveSelection = false } = options;
  const form = document.querySelector("#admin-user-form");
  if (!form) {
    return;
  }

  const companyInput = form.querySelector("input[name='companyCode']");
  const departmentInput = form.querySelector("input[name='department']");
  const datalist = document.querySelector("#department-options");
  const meta = document.querySelector("#department-field-meta");
  const role = form.querySelector("select[name='role']")?.value || "EMPLOYEE";
  const rule = provisioningRuleForRole(role);
  if (!departmentInput || !datalist) {
    return;
  }

  if (rule.mode !== "manual") {
    userDepartmentOptions = [];
    datalist.innerHTML = "";
    departmentInput.disabled = false;
    return;
  }

  if (hasRole("SUPER_ADMIN") && !managedOrganizations.length) {
    await ensureManagedOrganizations();
  }

  const organizationId = hasRole("SUPER_ADMIN")
    ? resolveOrganizationIdFromCode(companyInput?.value)
    : (currentSession?.organizationId || "");
  const previousValue = preserveSelection ? departmentInput.value : "";
  const organizationChanged = Boolean(userDepartmentOrganizationId && userDepartmentOrganizationId !== organizationId);

  if (!organizationId) {
    userDepartmentOptions = [];
    userDepartmentOrganizationId = "";
    datalist.innerHTML = "";
    if (meta) {
      meta.textContent = hasRole("SUPER_ADMIN")
        ? "Select an organization first to load organization departments."
        : "No organization departments are available yet. You can still add one here.";
    }
    departmentInput.disabled = hasRole("SUPER_ADMIN");
    return;
  }

  try {
    const response = await listDepartments({ organizationId });
    userDepartmentOptions = response?.data || [];
    userDepartmentOrganizationId = organizationId;
    datalist.innerHTML = userDepartmentOptions.map((department) => `<option value="${escapeHtml(department.departmentName)}"></option>`).join("");
    if (meta) {
      meta.textContent = userDepartmentOptions.length
        ? "Search an organization department or type a new one to create it inline."
        : "No departments exist yet for this organization. Type one to create it inline.";
    }
    departmentInput.disabled = false;
    if (organizationChanged) {
      departmentInput.value = "";
    } else if (preserveSelection && previousValue) {
      departmentInput.value = previousValue;
    }
  } catch (error) {
    userDepartmentOptions = [];
    userDepartmentOrganizationId = organizationId;
    datalist.innerHTML = "";
    departmentInput.disabled = false;
    if (meta) {
      meta.textContent = "Department options are temporarily unavailable. You can still type a department name.";
    }
    showToast("Departments unavailable", error.message);
  }
}

async function refreshDepartmentOptionsForOrganization(organizationId) {
  const activeOrganizationId = hasRole("SUPER_ADMIN")
    ? resolveOrganizationIdFromCode(document.querySelector("#admin-user-form input[name='companyCode']")?.value)
    : currentSession?.organizationId;
  if (organizationId && activeOrganizationId === organizationId) {
    await loadUserDepartmentOptions({ preserveSelection: true });
  }
}

function resolveOrganizationIdFromCode(companyCode) {
  const normalizedCode = String(companyCode || "").trim().toUpperCase();
  if (!normalizedCode) {
    return "";
  }
  return managedOrganizations.find((organization) => organization.companyCode === normalizedCode)?.id || "";
}

function updateInternalProvisioningRoleState(form, context = {}) {
  const roleSelect = form.querySelector("select[name='role']");
  const departmentInput = context.departmentInput || form.querySelector("input[name='department']");
  const departmentField = context.departmentField || form.querySelector("[data-department-field]");
  const departmentMeta = form.querySelector("#department-field-meta");
  const departmentLabel = form.querySelector("#department-field-label");
  const companyField = context.companyField || form.querySelector("[data-company-code-field]");
  const companyInput = context.companyInput || form.querySelector("input[name='companyCode']");
  const employeeWorkforceFields = form.querySelectorAll("[data-employee-workforce-field]");
  const previousRole = roleSelect?.dataset.activeRole || roleSelect?.value || "EMPLOYEE";
  const rule = provisioningRuleForRole(roleSelect?.value);
  const previousManualValue = typeof context.employeeDepartmentDraft === "function"
    ? context.employeeDepartmentDraft()
    : "";

  if (!departmentInput || !departmentField || !departmentMeta || !departmentLabel) {
    return;
  }

  if (roleSelect?.value === "EMPLOYEE" && typeof context.onManualDepartmentDraft === "function") {
    context.onManualDepartmentDraft(departmentInput.value);
  }

  departmentLabel.textContent = rule.label;
  departmentInput.placeholder = rule.placeholder || "";
  departmentInput.readOnly = rule.mode === "locked";
  departmentInput.classList.toggle("is-readonly", rule.mode === "locked");
  departmentInput.setAttribute("aria-readonly", String(rule.mode === "locked"));
  departmentField.classList.toggle("is-hidden", rule.mode === "hidden");

  if (rule.mode === "locked") {
    departmentInput.value = rule.department;
    departmentMeta.textContent = rule.meta;
    departmentInput.disabled = false;
    departmentInput.setAttribute("list", "");
  } else if (rule.mode === "hidden") {
    departmentInput.value = "";
    departmentMeta.textContent = rule.meta;
    departmentInput.disabled = false;
    departmentInput.removeAttribute("list");
  } else {
    departmentInput.value = previousRole === "EMPLOYEE"
      ? (previousManualValue || departmentInput.value || "")
      : (previousManualValue || "");
    departmentMeta.textContent = rule.meta;
    departmentInput.removeAttribute("list");
    departmentInput.setAttribute("list", "department-options");
    void loadUserDepartmentOptions({ preserveSelection: true });
  }

  if (companyField && companyInput) {
    companyField.classList.toggle("is-hidden", !hasRole("SUPER_ADMIN"));
    companyInput.required = hasRole("SUPER_ADMIN");
    if (!hasRole("SUPER_ADMIN") && currentSession?.organizationCode) {
      companyInput.value = currentSession.organizationCode;
    }
  }

  employeeWorkforceFields.forEach((field) => {
    const enabled = roleSelect?.value === "EMPLOYEE";
    field.classList.toggle("is-hidden", !enabled);
    field.querySelectorAll("input, select").forEach((input) => {
      input.disabled = !enabled;
    });
  });
}

function provisioningRuleForRole(role) {
  return INTERNAL_ROLE_DEPARTMENT_RULES[role] || INTERNAL_ROLE_DEPARTMENT_RULES.EMPLOYEE;
}

function resetOrganizationDepartmentDraft(useDefaults) {
  organizationDepartmentDraft = useDefaults ? DEFAULT_DEPARTMENT_PRESETS.slice() : [];
}

function addOrganizationDepartmentFromInput() {
  const input = document.querySelector("#organization-department-input");
  if (!input) {
    return;
  }
  addOrganizationDepartment(input.value);
}

function addOrganizationDepartment(value, options = {}) {
  const { clearInput = true } = options;
  const input = document.querySelector("#organization-department-input");
  const normalized = normalizeDepartmentValue(value);
  const error = validateDepartmentValue(normalized, { required: true });
  if (error) {
    showToast("Check department", error);
    return;
  }
  const key = departmentKey(normalized);
  if (organizationDepartmentDraft.some((departmentName) => departmentKey(departmentName) === key)) {
    showToast("Duplicate department", "That department is already in this organization's preset list.");
    return;
  }
  organizationDepartmentDraft = [...organizationDepartmentDraft, normalized];
  renderOrganizationDepartmentEditor();
  if (input && clearInput) {
    input.value = "";
    input.focus();
  }
}

function renderOrganizationDepartmentEditor() {
  const list = document.querySelector("#organization-department-list");
  const suggestions = document.querySelector("#organization-department-suggestions");
  if (list) {
    list.innerHTML = organizationDepartmentDraft.length ? organizationDepartmentDraft.map((departmentName) => `
      <span class="department-chip">
        <span>${escapeHtml(departmentName)}</span>
        <button type="button" data-department-remove="${escapeHtml(departmentKey(departmentName))}" aria-label="Remove ${escapeHtml(departmentName)}">Remove</button>
      </span>
    `).join("") : `<p class="department-chip__empty">No presets selected yet. Add only the teams this organization actually uses.</p>`;
  }
  if (suggestions) {
    const selected = new Set(organizationDepartmentDraft.map((departmentName) => departmentKey(departmentName)));
    const availableSuggestions = DEFAULT_DEPARTMENT_PRESETS.filter((departmentName) => !selected.has(departmentKey(departmentName)));
    suggestions.innerHTML = availableSuggestions.map((departmentName) => `
      <button class="button button--ghost button--small" type="button" data-department-suggestion="${escapeHtml(departmentName)}">${escapeHtml(departmentName)}</button>
    `).join("");
  }
}

function normalizeDepartmentValue(value) {
  const compact = String(value || "").trim().replaceAll(/\s+/g, " ");
  if (!compact) {
    return "";
  }
  return compact
    .split(" ")
    .map((word) => formatDepartmentWord(word))
    .join(" ");
}

function formatDepartmentWord(word) {
  const upper = word.toUpperCase();
  if (["HR", "IT", "QA", "HSE", "R&D"].includes(upper)) {
    return upper;
  }
  return word
    .split(/([/&-])/)
    .map((segment) => {
      if (!segment || ["/", "&", "-"].includes(segment)) {
        return segment;
      }
      const segmentUpper = segment.toUpperCase();
      if (["HR", "IT", "QA", "HSE", "R&D"].includes(segmentUpper)) {
        return segmentUpper;
      }
      if (/^\d+$/.test(segment)) {
        return segment;
      }
      return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
    })
    .join("");
}

function departmentKey(value) {
  return normalizeDepartmentValue(value).toUpperCase();
}

function validateDepartmentValue(value, options = {}) {
  const { required = false } = options;
  const normalized = normalizeDepartmentValue(value);
  if (!normalized) {
    return required ? "Enter a department name." : "";
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9 &/-]{1,79}$/.test(normalized)) {
    return "Department names must be 2-80 characters and use letters, numbers, spaces, hyphens, slashes, or ampersands.";
  }
  return "";
}

function maxValue(data) {
  return Math.max(1, ...data.map((item) => Number(item.value) || 0));
}

function hasSeriesActivity(data) {
  return normalizeArray(data).some((item) => Number(item?.value) > 0);
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function chartEmpty(message) {
  return `<div class="empty-state empty-state--inline"><h3>No analytics available yet</h3><p>${escapeHtml(message)}</p></div>`;
}

function emptyInline(title, body) {
  return `<div class="empty-state empty-state--inline"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p></div>`;
}

function validateOrganization(payload) {
  if (!payload.companyName || payload.companyName.length < 2) {
    return "Enter the organization name.";
  }
  if (!/^[A-Z0-9_-]{2,24}$/.test(payload.companyCode || "")) {
    return "Use a 2-24 character organization code with letters, numbers, hyphens, or underscores.";
  }
  if (payload.contactEmail && !isEmail(payload.contactEmail)) {
    return "Use a valid contact email.";
  }
  if (!payload.regionCountry || payload.regionCountry.length < 2) {
    return "Enter the organization region or country.";
  }
  if (!payload.timezone || !ORGANIZATION_TIMEZONES.includes(payload.timezone)) {
    return "Choose a supported organization timezone.";
  }
  for (const departmentName of payload.departmentNames || []) {
    const error = validateDepartmentValue(departmentName, { required: true });
    if (error) {
      return error;
    }
  }
  return "";
}

function validateInternalUser(payload) {
  if (!payload.fullName || payload.fullName.length < 2) {
    return "Enter the person's full name.";
  }
  const usernameError = validateUsername(payload.username);
  if (usernameError) {
    return usernameError;
  }
  if (!isEmail(payload.email || "")) {
    return "Use a valid work email.";
  }
  const phoneError = validatePhonePayload(payload, { required: false });
  if (phoneError) {
    return phoneError;
  }
  if (!["EMPLOYEE", "SECURITY_GUARD", "ADMIN"].includes(payload.role)) {
    return "Choose an internal access type.";
  }
  const rule = provisioningRuleForRole(payload.role);
  if (hasRole("SUPER_ADMIN") && !payload.companyCode) {
    return "Select the organization for this account.";
  }
  if (rule.mode === "locked") {
    if (payload.department && departmentKey(payload.department) !== departmentKey(rule.department)) {
      return `${formatInternalRole(payload.role)} must use the ${rule.department} department.`;
    }
  } else if (payload.department) {
    const departmentError = validateDepartmentValue(payload.department);
    if (departmentError) {
      return departmentError;
    }
  }
  if (payload.role === "EMPLOYEE") {
    if (!payload.designation || payload.designation.length < 2) {
      return "Enter the employee designation.";
    }
    if (!payload.employeeType) {
      return "Choose the employee type.";
    }
    if (!payload.shiftName || payload.shiftName.length < 2) {
      return "Enter the shift name.";
    }
    if (!/^\d{2}:\d{2}$/.test(payload.shiftStartTime || "") || !/^\d{2}:\d{2}$/.test(payload.shiftEndTime || "")) {
      return "Choose shift start and end times.";
    }
  }
  if (!/[a-z]/.test(payload.password || "")
      || !/[A-Z]/.test(payload.password || "")
      || !/\d/.test(payload.password || "")
      || !/[^A-Za-z0-9]/.test(payload.password || "")
      || String(payload.password || "").length < 12) {
    return "Temporary password must be 12+ characters with uppercase, lowercase, number, and symbol.";
  }
  return "";
}

function setFormLoading(form, loading) {
  const button = form.querySelector("button[type='submit']");
  button?.toggleAttribute("disabled", loading);
  button?.classList.toggle("is-loading", loading);
  button?.toggleAttribute("aria-busy", loading);
}

function trim(value) {
  const next = String(value || "").trim();
  return next || null;
}

function formatDateTime(value) {
  return value ? formatOrgDate(value, { dateStyle: "medium", timeStyle: "short" }) : "Not available";
}

function formatDateOnly(value) {
  return value ? formatOrgDate(value, { dateStyle: "medium" }) : "Not available";
}

function formatUserShift(user = {}) {
  if (!user.shiftName && !user.shiftStartTime && !user.shiftEndTime) {
    return "Not configured";
  }
  const timing = user.shiftStartTime && user.shiftEndTime ? `${user.shiftStartTime}-${user.shiftEndTime}` : "timing pending";
  return `${user.shiftName || "General Shift"} · ${timing}`;
}

function formatRelativeTime(value) {
  if (!value) {
    return "not available";
  }
  const deltaMs = Date.now() - new Date(value).getTime();
  const deltaHours = Math.max(0, Math.round(deltaMs / (1000 * 60 * 60)));
  if (deltaHours < 1) {
    return "just now";
  }
  if (deltaHours < 24) {
    return `${deltaHours}h ago`;
  }
  const deltaDays = Math.round(deltaHours / 24);
  return `${deltaDays}d ago`;
}

function statusBadge(status) {
  const normalized = String(status || "").toLowerCase().replaceAll("_", "-") || "approved";
  return `<span class="status-badge status-badge--${escapeHtml(normalized)}">${escapeHtml(formatStatusLabel(status))}</span>`;
}

function formatStatusLabel(status) {
  return String(status || "")
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ") || "Unknown";
}

function emptyPreviewTile(message) {
  return `
    <article class="homepage-preview-counter homepage-preview-counter--empty">
      <span>Empty state</span>
      <strong>No live counters</strong>
      <small>${escapeHtml(message)}</small>
    </article>
  `;
}

function formatMonitoringTitle(value) {
  return String(value || "")
    .replaceAll(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replaceAll(/\b\w/g, (char) => char.toUpperCase());
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) {
    element.textContent = value;
  }
}
