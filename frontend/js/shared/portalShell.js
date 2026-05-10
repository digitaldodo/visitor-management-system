import { logout } from "./authApi.js";
import { getHealth } from "./healthApi.js";
import { $, $$, setText } from "./dom.js";
import { LOGIN_FROM_PORTAL } from "./config.js";
import { clearSession, getRefreshToken } from "./session.js";
import { showToast } from "./toast.js";

export function initPortalShell(session, options = {}) {
  initSidebar();
  initLogout();
  initRouteTabs(options.allowedRoutes || []);
  $("#refresh-health")?.addEventListener("click", () => refreshHealth(true));

  setText("#user-chip", `${session.fullName || session.email} · ${formatRole(session.roles?.[0])}`);
  refreshHealth(false);
}

export function renderMetrics(metrics = []) {
  const grid = $("#metric-grid");
  if (!grid) {
    return;
  }

  grid.innerHTML = metrics.map((metric) => `
    <article class="metric-card">
      <span class="metric-card__label">${escapeHtml(metric.label)}</span>
      <strong>${escapeHtml(metric.value)}</strong>
      <small>${escapeHtml(metric.note)}</small>
    </article>
  `).join("");
}

export function renderWorkList(selector, items, mapper) {
  const list = $(selector);
  if (!list) {
    return;
  }

  list.innerHTML = items.map(mapper).join("");
}

export function workCard(title, detail, meta = "") {
  return `
    <article class="work-card">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(detail)}</p>
      ${meta ? `<small>${escapeHtml(meta)}</small>` : ""}
    </article>
  `;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function initSidebar() {
  const shell = $(".portal-shell");
  const toggle = $("#sidebar-toggle");
  const collapse = $("#sidebar-collapse");
  const backdrop = $("#sidebar-backdrop");
  const mobileQuery = window.matchMedia("(max-width: 760px)");

  toggle?.addEventListener("click", () => {
    if (mobileQuery.matches) {
      const isOpen = shell.dataset.sidebarState === "open";
      shell.dataset.sidebarState = isOpen ? "closed" : "open";
    } else {
      const isCollapsed = shell.dataset.sidebarState === "collapsed";
      shell.dataset.sidebarState = isCollapsed ? "expanded" : "collapsed";
    }
  });

  collapse?.addEventListener("click", () => {
    const isCollapsed = shell.dataset.sidebarState === "collapsed";
    shell.dataset.sidebarState = isCollapsed ? "expanded" : "collapsed";
    collapse.setAttribute("aria-label", isCollapsed ? "Collapse sidebar" : "Expand sidebar");
  });

  backdrop?.addEventListener("click", () => {
    shell.dataset.sidebarState = "closed";
  });

  mobileQuery.addEventListener("change", () => {
    shell.dataset.sidebarState = mobileQuery.matches ? "closed" : "expanded";
  });
}

function initRouteTabs(allowedRoutes) {
  const validRoutes = new Set(allowedRoutes);
  const links = $$("#sidebar-nav .nav-link");

  links.forEach((link) => {
    link.addEventListener("click", () => {
      links.forEach((item) => item.classList.remove("is-active"));
      link.classList.add("is-active");
      if (window.matchMedia("(max-width: 760px)").matches) {
        $(".portal-shell").dataset.sidebarState = "closed";
      }
    });
  });

  const syncHash = () => {
    const route = window.location.hash.replace("#", "") || allowedRoutes[0];
    if (!validRoutes.has(route)) {
      window.location.hash = allowedRoutes[0];
      return;
    }
    links.forEach((link) => link.classList.toggle("is-active", link.dataset.route === route));
  };

  window.addEventListener("hashchange", syncHash);
  syncHash();
}

function initLogout() {
  $("#logout-button")?.addEventListener("click", async () => {
    const refreshToken = getRefreshToken();
    try {
      if (refreshToken) {
        await logout(refreshToken);
      }
    } finally {
      clearSession();
      window.location.assign(LOGIN_FROM_PORTAL);
    }
  });
}

async function refreshHealth(showSuccessToast) {
  setHealthLoading();

  try {
    const response = await getHealth();
    setHealthOnline(response?.data?.status || "UP");
    if (showSuccessToast) {
      showToast("API online", "Backend health check completed.");
    }
  } catch (error) {
    setHealthOffline(error.message);
    showToast("API unavailable", error.message);
  }
}

function setHealthLoading() {
  setText("#api-status-text", "API checking");
  $("#api-status-dot")?.classList.remove("is-online", "is-offline");
  const card = $("#health-card");
  if (card) {
    card.innerHTML = "<strong>Checking</strong><span>Contacting backend health endpoint.</span>";
  }
}

function setHealthOnline(status) {
  setText("#api-status-text", "API online");
  $("#api-status-dot")?.classList.add("is-online");
  const card = $("#health-card");
  if (card) {
    card.innerHTML = `
      <span class="status-dot is-online" aria-hidden="true"></span>
      <div>
        <strong>${escapeHtml(status)}</strong>
        <span>/api/v1/health</span>
      </div>
    `;
  }
}

function setHealthOffline(message) {
  setText("#api-status-text", "API offline");
  $("#api-status-dot")?.classList.add("is-offline");
  const card = $("#health-card");
  if (card) {
    card.innerHTML = `
      <span class="status-dot is-offline" aria-hidden="true"></span>
      <div>
        <strong>Offline</strong>
        <span>${escapeHtml(message)}</span>
      </div>
    `;
  }
}

function formatRole(role) {
  return String(role || "USER").replaceAll("_", " ");
}
