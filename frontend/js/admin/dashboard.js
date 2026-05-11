import { request } from "../shared/httpClient.js";
import { initAppErrorBoundary } from "../shared/appErrorBoundary.js";
import { createDepartment, listDepartments, updateDepartment } from "../shared/departmentApi.js";
import { getHomepageSettings, updateHomepageSettings } from "../shared/homepageApi.js";
import { createOrganization, listManagedOrganizations, updateOrganization } from "../shared/organizationApi.js";
import { requireRole } from "../shared/roleGuard.js";
import { initPortalShell, renderLoadingList, renderWorkList, workCard, escapeHtml } from "../shared/portalShell.js";
import { initVisitorModule } from "../shared/visitorModule.js";
import { showToast } from "../shared/toast.js";
import { attachFieldValidator, isEmail, validateUsername } from "../shared/validation.js";

const ROUTE_DEFINITIONS = {
  analytics: {
    slug: "analytics",
    navLabel: "Analytics",
    eyebrow: "Operations Insight",
    title: "Analytics Workspace",
    description: "Track visitor demand, approval patterns, and host activity in one focused operational view.",
    badges: ["Admin access", "Organization-aware", "Performance overview"],
  },
  users: {
    slug: "users",
    navLabel: "User Management",
    eyebrow: "Identity Operations",
    title: "User Management Workspace",
    description: "Create workforce accounts, adjust portal access, and keep internal identity controls contained to one place.",
    badges: ["Admin access", "Scoped account issuance", "RBAC protected"],
  },
  departments: {
    slug: "departments",
    navLabel: "Departments",
    eyebrow: "Workforce Structure",
    title: "Department Workspace",
    description: "Keep department options clean, tenant-scoped, and fast to manage without drifting into HR complexity.",
    badges: ["Admin access", "Tenant isolated", "Operational setup"],
  },
  organizations: {
    slug: "organizations",
    navLabel: "Organizations",
    eyebrow: "Tenant Operations",
    title: "Organization Management Workspace",
    description: "Create and maintain tenant records for onboarding, assignment, and platform-level oversight.",
    badges: ["Super admin only", "Multi-tenant control", "Platform scope"],
  },
  "homepage-controls": {
    slug: "homepage-controls",
    navLabel: "Homepage Controls",
    eyebrow: "Public Experience",
    title: "Homepage Controls Workspace",
    description: "Manage public-facing homepage content and preview the output without mixing it into internal operations.",
    badges: ["Super admin only", "Public site controls", "Preview included"],
  },
  reports: {
    slug: "reports",
    navLabel: "Reports",
    eyebrow: "Audit Exports",
    title: "Reports Workspace",
    description: "Review reporting and export activity in a dedicated oversight area designed for audit workflows.",
    badges: ["Super admin only", "Audit oversight", "Export visibility"],
  },
  monitoring: {
    slug: "monitoring",
    navLabel: "System Monitoring",
    eyebrow: "Platform Health",
    title: "Monitoring Workspace",
    description: "Keep system status, service signals, and operational health visible without crowding the rest of the admin experience.",
    badges: ["Admin access", "Service health", "Operational signals"],
  },
  "visitor-access": {
    slug: "visitor-access",
    navLabel: "Visitor Access",
    eyebrow: "Live Operations",
    title: "Visitor Access Workspace",
    description: "Run live visitor operations, registration, and record management inside one dedicated operational workspace.",
    badges: ["Admin access", "Frontline workflows", "Live records"],
  },
};

const ROUTE_ALIASES = {
  analytics: "analytics",
  users: "users",
  departments: "departments",
  organizations: "organizations",
  reports: "reports",
  monitoring: "monitoring",
  visitors: "visitor-access",
  "visitor-access": "visitor-access",
  "homepage-settings": "homepage-controls",
  "homepage-controls": "homepage-controls",
};

let currentSession;
let currentRoute = "";
let homepageMetricOptions = [];
let managedOrganizations = [];
let organizationDepartmentDraft = [];
let departmentWorkspaceItems = [];
let departmentFilterOrganizationId = "";
let userDepartmentOptions = [];
let userDepartmentOrganizationId = "";
let adminRouteState = null;

const DEFAULT_DEPARTMENT_PRESETS = [
  "Operations",
  "Security",
  "HR",
  "IT",
  "Reception",
  "Facilities",
  "Management",
];

document.addEventListener("DOMContentLoaded", async () => {
  initAppErrorBoundary();

  currentSession = requireRole("ADMIN");
  if (!currentSession) {
    return;
  }

  const allowedRoutes = resolveAllowedRoutes();
  const routeContext = resolveRouteContext(allowedRoutes);
  if (routeContext.redirectTo) {
    window.location.replace(routeContext.redirectTo);
    return;
  }

  currentRoute = routeContext.routeKey;
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
    onRefresh: () => loadWorkspace(currentRoute, { preserveToasts: true }),
  });

  initAdminRouteLifecycle();
  await activateAdminRoute(currentRoute);
});

function resolveRouteContext(allowedRoutes) {
  const defaultRoute = allowedRoutes[0];
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
    return { redirectTo: routeMap[targetRoute]?.href || routeMap[defaultRoute]?.href || "/admin/analytics", routeMap, legacyMode };
  }

  if (normalizedPath.startsWith("/admin/")) {
    const slug = normalizedPath.slice("/admin/".length).split("/")[0];
    const routeKey = resolveAlias(slug);
    if (allowedRoutes.includes(routeKey)) {
      return { routeKey, routeMap, legacyMode };
    }
    return { redirectTo: routeMap[defaultRoute]?.href || "/admin/analytics", routeMap, legacyMode };
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
  return ROUTE_ALIASES[String(value || "").trim().toLowerCase()] || "";
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
    case "analytics":
      return analyticsTemplate();
    case "users":
      return usersTemplate();
    case "departments":
      return departmentsTemplate();
    case "organizations":
      return organizationsTemplate();
    case "homepage-controls":
      return homepageControlsTemplate();
    case "reports":
      return reportsTemplate();
    case "monitoring":
      return monitoringTemplate();
    case "visitor-access":
      return visitorsTemplate();
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

      <section class="panel employee-analytics-panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Host Performance</p>
            <h3>Employee-wise Analytics</h3>
          </div>
        </div>
        <div class="employee-analytics-table" id="employee-analytics-table"></div>
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
            <span>Organization code</span>
            <input name="companyCode" type="text" autocomplete="organization" placeholder="ACME" />
          </label>
          <label class="form-field form-field--wide">
            <span>Department</span>
            <input name="department" type="text" list="department-options" autocomplete="off" placeholder="Search or add a department" />
            <datalist id="department-options"></datalist>
            <small class="form-field__message form-field__message--inline" id="department-field-meta">Choose an organization department or enter a new one.</small>
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
    <section class="workspace-grid workspace-grid--split">
      <article class="panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Platform Tenancy</p>
            <h3>Organization Setup</h3>
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
          <label class="form-field form-field--wide">
            <span>Address</span>
            <input name="address" type="text" autocomplete="street-address" placeholder="Street, city, country" />
          </label>
          <div class="form-field form-field--wide">
            <span>Department presets</span>
            <small class="form-field__message form-field__message--inline">Seed common departments now so admins can assign people from a clean dropdown later.</small>
            <div class="department-preset-editor">
              <div class="department-preset-editor__chips" id="organization-department-list"></div>
              <div class="department-preset-editor__entry">
                <input id="organization-department-input" type="text" autocomplete="off" placeholder="Add department preset" />
                <button class="button button--ghost" id="organization-department-add" type="button">Add</button>
              </div>
              <div class="department-preset-editor__suggestions" id="organization-department-suggestions"></div>
            </div>
          </div>
          <label class="checkbox-field form-field--wide">
            <input name="activeStatus" type="checkbox" checked />
            <span>Organization is active</span>
          </label>
          <div class="organization-form__footer">
            <p id="organization-form-meta">Create organizations for tenant onboarding and admin assignment.</p>
            <div class="organization-form__actions">
              <button class="button button--ghost" id="organization-form-reset" type="button">Clear</button>
              <button class="button button--primary" type="submit">Save organization</button>
            </div>
          </div>
        </form>
      </article>

      <article class="panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Tenant Directory</p>
            <h3>Managed Organizations</h3>
          </div>
        </div>
        <div class="work-list" id="organizations-list"></div>
      </article>
    </section>
  `;
}

function homepageControlsTemplate() {
  return `
    <section class="workspace-grid workspace-grid--split">
      <article class="panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Public Website</p>
            <h3>Homepage Controls</h3>
          </div>
        </div>
        <form class="homepage-settings-form" id="homepage-settings-form" novalidate>
          <label class="checkbox-field">
            <input name="statsVisible" type="checkbox" />
            <span>Show homepage stats</span>
          </label>
          <label class="checkbox-field">
            <input name="featuredMetricsVisible" type="checkbox" />
            <span>Show featured metrics section</span>
          </label>
          <label class="checkbox-field">
            <input name="publicCountersVisible" type="checkbox" />
            <span>Show public counters in the hero area</span>
          </label>
          <label class="checkbox-field">
            <input name="announcementVisible" type="checkbox" />
            <span>Show homepage announcement</span>
          </label>
          <label class="form-field form-field--wide">
            <span>Announcement title</span>
            <input name="announcementTitle" type="text" maxlength="80" placeholder="Platform update" />
          </label>
          <label class="form-field form-field--wide">
            <span>Announcement body</span>
            <textarea name="announcementBody" rows="3" maxlength="240" placeholder="Use this space for scheduled maintenance, launch updates, or onboarding guidance."></textarea>
          </label>
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
          <div class="homepage-settings-form__footer">
            <p id="homepage-settings-meta">Homepage controls are ready to configure.</p>
            <button class="button button--primary" type="submit">Save homepage settings</button>
          </div>
        </form>
      </article>

      <aside class="panel homepage-preview-panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Preview</p>
            <h3>Public Homepage Output</h3>
          </div>
        </div>
        <div class="homepage-preview" id="homepage-settings-preview"></div>
      </aside>
    </section>
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

  const fallbackHref = adminRouteState.routeMap?.[adminRouteState.allowedRoutes[0]]?.href || "/admin/analytics";
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
  initWorkspace(routeKey);
  window.scrollTo(0, 0);
  await loadWorkspace(routeKey, options);
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
    case "users":
      initAdminUserForm();
      break;
    case "departments":
      initDepartmentWorkspace();
      break;
    case "organizations":
      initOrganizationForm();
      break;
    case "homepage-controls":
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
    default:
      break;
  }
}

async function loadWorkspace(routeKey, options = {}) {
  const { preserveToasts = false } = options;

  try {
    switch (routeKey) {
      case "analytics":
        await loadAnalyticsWorkspace();
        break;
      case "users":
        await loadUsersWorkspace();
        break;
      case "departments":
        await loadDepartmentsWorkspace();
        break;
      case "organizations":
        await loadOrganizationsWorkspace();
        break;
      case "homepage-controls":
        await loadHomepageWorkspace();
        break;
      case "reports":
        await loadReportsWorkspace();
        break;
      case "monitoring":
        await loadMonitoringWorkspace();
        break;
      case "visitor-access":
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
    renderAnalytics(analytics.data);
  } catch (error) {
    renderAnalytics({});
    showToast("Analytics unavailable", error.message);
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
    renderUsers(users.data || []);
  } catch (error) {
    renderWorkList("#user-management-list", [], (item) => item, "Admin data unavailable", error.message);
    showToast("User management unavailable", error.message);
  }
}

async function loadOrganizationsWorkspace() {
  renderLoadingList("#organizations-list", 4);
  try {
    await ensureManagedOrganizations({ force: true });
    renderOrganizations(managedOrganizations);
  } catch (error) {
    renderWorkList("#organizations-list", [], (item) => item, "Organizations unavailable", error.message);
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
    departmentWorkspaceItems = departments.data || [];
    renderDepartmentWorkspaceItems();
  } catch (error) {
    departmentWorkspaceItems = [];
    renderWorkList("#departments-list", [], (item) => item, "Departments unavailable", error.message);
    showToast("Departments unavailable", error.message);
  }
}

async function loadHomepageWorkspace() {
  renderHomepageSettingsState("Loading homepage controls...");
  try {
    const homepageSettings = await getHomepageSettings();
    renderHomepageSettings(homepageSettings.data);
  } catch (error) {
    renderHomepageSettingsState(error.message);
    showToast("Homepage controls unavailable", error.message);
  }
}

async function loadReportsWorkspace() {
  renderLoadingList("#reports-list", 4);
  try {
    const reports = await request("/admin/reports");
    renderWorkList("#reports-list", reports.data, (report) => workCard(report.title, report.status), "No audit activity yet", "Structured login and access events will appear here.");
  } catch (error) {
    renderWorkList("#reports-list", [], (item) => item, "Audit oversight unavailable", error.message);
    showToast("Reports unavailable", error.message);
  }
}

async function loadMonitoringWorkspace() {
  renderMonitoringSummary([]);
  renderLoadingList("#monitoring-list", 4);
  try {
    const monitoring = await request("/admin/monitoring");
    renderMonitoring(monitoring.data);
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
  if (roleSelect && !hasRole("SUPER_ADMIN")) {
    roleSelect.querySelector("option[value='ADMIN']")?.remove();
  }
  if (companyInput && currentSession?.organizationCode) {
    companyInput.value = currentSession.organizationCode;
  }
  if (companyField && !hasRole("SUPER_ADMIN")) {
    companyField.classList.add("is-hidden");
  }
  const usernameInput = form.querySelector("input[name='username']");
  const runUsernameValidation = attachFieldValidator(usernameInput, validateUsername);
  const runDepartmentValidation = attachFieldValidator(departmentInput, (value) => validateDepartmentValue(value));

  if (hasRole("SUPER_ADMIN")) {
    companyInput?.addEventListener("input", () => {
      loadUserDepartmentOptions({ preserveSelection: true });
    });
    companyInput?.addEventListener("blur", () => {
      loadUserDepartmentOptions({ preserveSelection: true });
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const department = normalizeDepartmentValue(data.department);
    const payload = {
      fullName: trim(data.fullName),
      username: trim(data.username),
      email: trim(data.email),
      password: data.password,
      role: data.role,
      companyCode: trim(data.companyCode) || currentSession?.organizationCode || null,
      department,
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
      renderHomepageSettings(response.data);
      showToast("Homepage updated", "Public homepage controls were saved.");
    } catch (error) {
      showToast("Homepage update failed", error.message);
    } finally {
      setFormLoading(form, false);
    }
  });
}

function initOrganizationForm() {
  const form = document.querySelector("#organization-form");
  if (!form) {
    return;
  }

  resetOrganizationDepartmentDraft(true);
  renderOrganizationDepartmentEditor();

  document.querySelector("#organization-form-reset")?.addEventListener("click", () => {
    resetOrganizationForm(form);
  });

  document.querySelector("#organization-department-add")?.addEventListener("click", () => {
    addOrganizationDepartmentFromInput();
  });

  document.querySelector("#organization-department-input")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    addOrganizationDepartmentFromInput();
  });

  document.querySelector("#organization-department-list")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-department-remove]");
    if (!button) {
      return;
    }
    organizationDepartmentDraft = organizationDepartmentDraft.filter((name) => departmentKey(name) !== button.dataset.departmentRemove);
    renderOrganizationDepartmentEditor();
  });

  document.querySelector("#organization-department-suggestions")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-department-suggestion]");
    if (!button) {
      return;
    }
    addOrganizationDepartment(button.dataset.departmentSuggestion, { clearInput: false });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
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
      if (organizationId) {
        await updateOrganization(organizationId, payload);
        showToast("Organization updated", "Tenant details were saved.");
      } else {
        await createOrganization(payload);
        showToast("Organization created", "Tenant is ready for admin and visitor setup.");
      }
      resetOrganizationForm(form);
      await loadOrganizationsWorkspace();
    } catch (error) {
      showToast("Organization save failed", error.message);
    } finally {
      setFormLoading(form, false);
    }
  });

  document.querySelector("#organizations-list")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-organization-action]");
    if (!button) {
      return;
    }

    const organization = managedOrganizations.find((item) => item.id === button.dataset.organizationId);
    if (!organization) {
      return;
    }

    if (button.dataset.organizationAction === "edit") {
      button.toggleAttribute("disabled", true);
      try {
        const departments = await listDepartments({ organizationId: organization.id });
        populateOrganizationForm(form, organization, departments.data || []);
        document.querySelector("#workspace-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (error) {
        showToast("Departments unavailable", error.message);
      } finally {
        button.toggleAttribute("disabled", false);
      }
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
        activeStatus: !organization.activeStatus,
      });
      showToast("Organization updated", organization.activeStatus ? "Organization access has been paused." : "Organization is active again.");
      await loadOrganizationsWorkspace();
    } catch (error) {
      showToast("Organization update failed", error.message);
    } finally {
      button.toggleAttribute("disabled", false);
    }
  });
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
  const disabled = !user.active || user.accountStatus === "DISABLED";
  const canManageAdmin = !(user.roles || []).includes("ADMIN") || hasRole("SUPER_ADMIN");
  const canManage = !(user.roles || []).includes("SUPER_ADMIN") && canManageAdmin;
  const roleOptions = internalRoleOptions(primaryRole);
  return `
    <article class="admin-user-card">
      <div class="admin-user-card__header">
        <div>
          <h3>${escapeHtml(user.fullName || user.email || "Unknown user")}</h3>
          <p>${escapeHtml(user.email || "No email")} · ${escapeHtml(user.username || "No username")}</p>
        </div>
        <span class="status-badge status-badge--${disabled ? "rejected" : "approved"}">${disabled ? "Disabled" : "Active"}</span>
      </div>
      <dl>
        <div><dt>Access</dt><dd>${escapeHtml(role)}</dd></div>
        <div><dt>Organization</dt><dd>${escapeHtml(user.organizationName || user.organizationCode || "Platform")}</dd></div>
        <div><dt>Department</dt><dd>${escapeHtml(user.department || "Not set")}</dd></div>
        <div><dt>Account ID</dt><dd>${escapeHtml(user.id || "")}</dd></div>
      </dl>
      <div class="admin-user-card__role">
        <label class="form-field">
          <span>Portal access</span>
          <select data-role-select ${canManage ? "" : "disabled"}>
            ${roleOptions}
          </select>
        </label>
        <button class="button button--ghost" type="button" data-user-action="role" data-user-id="${escapeHtml(user.id)}" ${canManage ? "" : "disabled"}>Update access</button>
      </div>
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
  if (selectedRole && !roles.some(([role]) => role === selectedRole)) {
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
  renderDashboardCards(data.widgets || []);
  renderChart("#daily-visitors-chart", barChart(data.dailyVisitors || [], "Visitors"));
  renderChart("#monthly-trends-chart", lineChart(data.monthlyTrends || []));
  renderChart("#peak-hours-chart", compactBars(data.peakHours || []));
  renderChart("#approval-rates-chart", approvalRateChart(data.approvalRates || []));
  renderEmployeeAnalytics(data.employeeAnalytics || []);
}

function renderAnalyticsLoading() {
  renderChart("#daily-visitors-chart", chartEmpty("Loading daily visitor activity..."));
  renderChart("#monthly-trends-chart", chartEmpty("Loading monthly trend activity..."));
  renderChart("#peak-hours-chart", chartEmpty("Loading peak-hour activity..."));
  renderChart("#approval-rates-chart", chartEmpty("Loading approval decisions..."));
  renderEmployeeAnalytics([]);
}

function renderHomepageSettings(data) {
  homepageMetricOptions = Array.isArray(data?.availableMetrics) ? data.availableMetrics : [];
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
  renderHomepagePreview(data?.publicPreview || {});

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
      ? `Last updated ${new Date(settings.updatedAt).toLocaleString()}${settings.updatedBy ? ` by ${settings.updatedBy}` : ""}.`
      : canEdit
        ? "Homepage controls are ready to configure."
        : "Homepage controls are visible here, but only SUPER_ADMIN can change them.";
  }
}

function resolveAllowedRoutes() {
  return hasRole("SUPER_ADMIN")
    ? ["analytics", "users", "departments", "organizations", "homepage-controls", "reports", "monitoring", "visitor-access"]
    : ["analytics", "users", "departments", "monitoring", "visitor-access"];
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
    <label class="checkbox-field">
      <input name="${escapeHtml(name)}" type="checkbox" value="${escapeHtml(metric.key)}" ${selected.has(metric.key) ? "checked" : ""} />
      <span>
        <strong>${escapeHtml(metric.label)}</strong>
        <small>${escapeHtml(metric.note)}</small>
      </span>
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
    ${announcement?.title && announcement?.body ? `
      <article class="homepage-preview-card homepage-preview-card--announcement">
        <p class="eyebrow">Announcement</p>
        <h3>${escapeHtml(announcement.title)}</h3>
        <p>${escapeHtml(announcement.body)}</p>
      </article>
    ` : ""}
    ${previewMetricsMarkup("Featured metrics", featuredMetrics, preview?.featuredMetricsEmptyState)}
    ${previewMetricsMarkup("Public counters", publicCounters, preview?.publicCountersEmptyState)}
  `;
}

function previewMetricsMarkup(title, items, emptyState) {
  if (!items.length) {
    return `
      <article class="homepage-preview-card">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(emptyState?.message || "No public metrics are currently available.")}</p>
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
  managedOrganizations = Array.isArray(items) ? items : [];
  const list = document.querySelector("#organizations-list");
  if (!list) {
    return;
  }

  list.innerHTML = managedOrganizations.length ? managedOrganizations.map(organizationCard).join("") : `
    <article class="empty-state empty-state--inline">
      <h3>No organizations yet</h3>
      <p>Create the first tenant to start assigning admins and visitor workflows.</p>
    </article>
  `;
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
    <article class="organization-card">
      <div class="organization-card__header">
        <div>
          <h3>${escapeHtml(organization.companyName)}</h3>
          <p>${escapeHtml(organization.companyCode)} · ${escapeHtml(organization.contactEmail || "No contact email")}</p>
        </div>
        <span class="status-badge status-badge--${organization.activeStatus ? "approved" : "rejected"}">${organization.activeStatus ? "Active" : "Inactive"}</span>
      </div>
      <dl>
        <div><dt>Address</dt><dd>${escapeHtml(organization.address || "No address recorded")}</dd></div>
        <div><dt>Created</dt><dd>${escapeHtml(formatDateTime(organization.createdAt))}</dd></div>
        <div><dt>Updated</dt><dd>${escapeHtml(formatDateTime(organization.updatedAt))}</dd></div>
      </dl>
      <div class="organization-card__actions">
        <button class="button button--ghost" type="button" data-organization-action="edit" data-organization-id="${escapeHtml(organization.id)}">Edit</button>
        <button class="button ${organization.activeStatus ? "button--ghost" : "button--primary"}" type="button" data-organization-action="toggle" data-organization-id="${escapeHtml(organization.id)}">${organization.activeStatus ? "Deactivate" : "Activate"}</button>
      </div>
    </article>
  `;
}

function renderDashboardCards(widgets) {
  const grid = document.querySelector("#metric-grid");
  if (!grid) {
    return;
  }

  if (!widgets.length) {
    grid.innerHTML = `
      <article class="empty-state empty-state--inline">
        <h3>No analytics yet</h3>
        <p>Visitor metrics will appear after activity starts.</p>
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
  if (!data.length) {
    return chartEmpty("No daily visitor data yet.");
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
  if (!data.length) {
    return chartEmpty("No monthly trend data yet.");
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
  if (!filtered.length) {
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
  if (!data.length) {
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
        ${items.length ? items.map((item) => `
          <tr>
            <td data-label="Employee"><strong>${escapeHtml(item.employee)}</strong></td>
            <td data-label="Total">${escapeHtml(item.total)}</td>
            <td data-label="Active">${escapeHtml(item.active)}</td>
            <td data-label="Pending">${escapeHtml(item.pending)}</td>
            <td data-label="Rejected">${escapeHtml(item.rejected)}</td>
          </tr>
        `).join("") : `<tr><td colspan="5"><div class="empty-state empty-state--inline"><h3>No employee activity</h3><p>Host-level analytics will appear after visitor records are created.</p></div></td></tr>`}
      </tbody>
    </table>
  `;
}

function populateOrganizationForm(form, organization, departments = []) {
  form.querySelector("input[name='organizationId']").value = organization.id || "";
  form.querySelector("input[name='companyName']").value = organization.companyName || "";
  form.querySelector("input[name='companyCode']").value = organization.companyCode || "";
  form.querySelector("input[name='contactEmail']").value = organization.contactEmail || "";
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
  managedOrganizations = response.data || [];
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
  if (!departmentInput || !datalist) {
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
        ? "Enter an organization code first to load organization departments."
        : "No organization departments are available yet. You can still add one here.";
    }
    departmentInput.disabled = hasRole("SUPER_ADMIN");
    return;
  }

  try {
    const response = await listDepartments({ organizationId });
    userDepartmentOptions = response.data || [];
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

function chartEmpty(message) {
  return `<div class="empty-state empty-state--inline"><h3>No chart data</h3><p>${escapeHtml(message)}</p></div>`;
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
  if (!["EMPLOYEE", "SECURITY_GUARD", "ADMIN"].includes(payload.role)) {
    return "Choose an internal access type.";
  }
  if (hasRole("SUPER_ADMIN") && !payload.companyCode) {
    return "Enter the organization code for this account.";
  }
  if (payload.department) {
    const departmentError = validateDepartmentValue(payload.department);
    if (departmentError) {
      return departmentError;
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
  return value ? new Date(value).toLocaleString() : "Not available";
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
