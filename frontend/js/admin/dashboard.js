import { request } from "../shared/httpClient.js";
import { initAppErrorBoundary } from "../shared/appErrorBoundary.js";
import { createDepartment, listDepartments, updateDepartment } from "../shared/departmentApi.js";
import { getHomepageSettings, updateHomepageSettings } from "../shared/homepageApi.js";
import { createOrganization, getOrganizationWorkspace, listManagedOrganizations, listOrganizationWorkspaceItems, updateOrganization } from "../shared/organizationApi.js";
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
  SUPER_ADMIN: {
    mode: "hidden",
    label: "Department",
    meta: "Super admin access is platform-level and does not use an organization department.",
    placeholder: "",
    department: "",
  },
};

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
  const routeMap = buildRouteMap();
  const hashRoute = resolveAlias(window.location.hash.replace("#", ""));

  if (normalizedPath === "/admin") {
    const targetRoute = allowedRoutes.includes(hashRoute) ? hashRoute : defaultRoute;
    return { redirectTo: routeMap[targetRoute]?.href || routeMap[defaultRoute]?.href || "/admin/analytics", routeMap };
  }

  if (normalizedPath.startsWith("/admin/")) {
    const slug = normalizedPath.slice("/admin/".length).split("/")[0];
    const routeKey = resolveAlias(slug);
    if (allowedRoutes.includes(routeKey)) {
      return { routeKey, routeMap };
    }
    return { redirectTo: routeMap[defaultRoute]?.href || "/admin/analytics", routeMap };
  }

  const routeKey = allowedRoutes.includes(hashRoute) ? hashRoute : defaultRoute;
  return { routeKey, routeMap };
}

function buildRouteMap() {
  return Object.fromEntries(
    Object.entries(ROUTE_DEFINITIONS).map(([key, route]) => [
      key,
      {
        href: `/admin/${route.slug}`,
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
              <option value="SUPER_ADMIN">Super admin</option>
            </select>
          </label>
          <label class="form-field" data-company-code-field>
            <span>Organization code</span>
            <input name="companyCode" type="text" autocomplete="organization" placeholder="ACME" />
          </label>
          <label class="form-field form-field--wide" data-department-field>
            <span id="department-field-label">Department</span>
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

function visitorsTemplate() {
  return `<article class="panel workspace-visitor-panel" data-admin-visitors></article>`;
}

function initAdminRouteLifecycle() {
  if (!adminRouteState || adminRouteState.routeLifecycleBound) {
    return;
  }

  adminRouteState.routeLifecycleBound = true;

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
      initOrganizationsWorkspace();
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
  renderOrganizationWorkspaceLoading();
  try {
    const [workspaceResponse, organizationsResponse] = await Promise.all([
      listOrganizationWorkspaceItems(),
      listManagedOrganizations(),
    ]);
    organizationWorkspaceItems = workspaceResponse.data || [];
    managedOrganizations = organizationsResponse.data || [];
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
  const departmentField = form.querySelector("[data-department-field]");
  if (roleSelect && !hasRole("SUPER_ADMIN")) {
    roleSelect.querySelector("option[value='ADMIN']")?.remove();
    roleSelect.querySelector("option[value='SUPER_ADMIN']")?.remove();
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
      renderHomepageSettings(response.data);
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
    activeOrganizationWorkspace = response.data;
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
    await openOrganizationWorkspaceModal(response.data?.id || organizationId, { activeTab: "overview" });
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
  const payload = {
    fullName: trim(data.fullName),
    username: trim(data.username),
    email: trim(data.email),
    password: data.password,
    role: "ADMIN",
    companyCode: activeOrganizationWorkspace.organization.companyCode,
    department: normalizeDepartmentValue(data.department),
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
          <small>${escapeHtml(organization.companyCode)}${organization.contactEmail ? ` · ${escapeHtml(organization.contactEmail)}` : ""}</small>
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
      <div class="admin-user-card__role">
        <label class="form-field">
          <span>Portal access</span>
          <select data-role-select>
            ${internalRoleOptions((user.roles || [])[0] || "ADMIN")}
          </select>
        </label>
        <button class="button button--ghost button--small" type="button" data-organization-admin-action="role" data-user-id="${escapeHtml(user.id)}">Update access</button>
      </div>
      <div class="organization-row__actions">
        <button class="button button--ghost button--small" type="button" data-organization-admin-action="reset-password" data-user-id="${escapeHtml(user.id)}">Reset password</button>
        <button class="button ${disabled ? "button--primary" : "button--ghost"} button--small" type="button" data-organization-admin-action="${disabled ? "enable" : "disable"}" data-user-id="${escapeHtml(user.id)}">${disabled ? "Enable" : "Disable"}</button>
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

function updateInternalProvisioningRoleState(form, context = {}) {
  const roleSelect = form.querySelector("select[name='role']");
  const departmentInput = context.departmentInput || form.querySelector("input[name='department']");
  const departmentField = context.departmentField || form.querySelector("[data-department-field]");
  const departmentMeta = form.querySelector("#department-field-meta");
  const departmentLabel = form.querySelector("#department-field-label");
  const companyField = context.companyField || form.querySelector("[data-company-code-field]");
  const companyInput = context.companyInput || form.querySelector("input[name='companyCode']");
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
    const hideCompanyField = hasRole("SUPER_ADMIN") && roleSelect?.value === "SUPER_ADMIN";
    companyField.classList.toggle("is-hidden", !hasRole("SUPER_ADMIN") || hideCompanyField);
    companyInput.required = hasRole("SUPER_ADMIN") && roleSelect?.value !== "SUPER_ADMIN";
    if (hideCompanyField) {
      companyInput.value = "";
    } else if (!hasRole("SUPER_ADMIN") && currentSession?.organizationCode) {
      companyInput.value = currentSession.organizationCode;
    }
  }
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
  if (!["EMPLOYEE", "SECURITY_GUARD", "ADMIN", "SUPER_ADMIN"].includes(payload.role)) {
    return "Choose an internal access type.";
  }
  const rule = provisioningRuleForRole(payload.role);
  if (payload.role === "SUPER_ADMIN" && !hasRole("SUPER_ADMIN")) {
    return "Only SUPER_ADMIN can issue super admin access.";
  }
  if (payload.role !== "SUPER_ADMIN" && hasRole("SUPER_ADMIN") && !payload.companyCode) {
    return "Enter the organization code for this account.";
  }
  if (rule.mode === "locked") {
    if (payload.department && departmentKey(payload.department) !== departmentKey(rule.department)) {
      return `${formatInternalRole(payload.role)} must use the ${rule.department} department.`;
    }
  } else if (rule.mode === "hidden") {
    if (payload.department) {
      return "Super admin access does not use a department.";
    }
  } else if (payload.department) {
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

function formatDateOnly(value) {
  return value ? new Date(value).toLocaleDateString() : "Not available";
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
