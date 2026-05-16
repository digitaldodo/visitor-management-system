import { logout } from "./authApi.js";
import { getHealth } from "./healthApi.js";
import { $, $$, setText } from "./dom.js";
import { LOGIN_FROM_PORTAL } from "./config.js";
import { clearSession, getRefreshToken } from "./session.js";
import { showToast } from "./toast.js";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "./notificationApi.js";
import { formatDate, formatStatus, setDefaultTimezone, timezoneLabel } from "./formatters.js";

let notificationPollTimer;
let latestNotificationSeenAt = "";

export function initPortalShell(session, options = {}) {
  setDefaultTimezone(session.organizationTimezone || session.user?.organizationTimezone || "UTC");
  safeShellInit("sidebar", initSidebar);
  safeShellInit("logout", initLogout);
  safeShellInit("route navigation", () => initRouteNavigation(options));
  safeShellInit("notifications", initNotifications);
  safeShellInit("refresh control", () => initRefreshControl(options.onRefresh));

  const organization = session.organizationName || session.organizationCode;
  const timezone = organization ? `${timezoneLabel(session.organizationTimezone || session.user?.organizationTimezone || "UTC")} · ` : "";
  const context = organization ? `${organization} · ${timezone}` : "Platform · ";
  setText("#user-chip", `${session.fullName || session.email || "Signed in"} · ${context}${formatRole(session.roles?.[0])}`);
  refreshHealth(false);
}

export function renderMetrics(metrics = []) {
  const grid = $("#metric-grid");
  if (!grid) {
    return;
  }

  grid.innerHTML = metrics.length ? metrics.map((metric) => `
    <article class="metric-card">
      <span class="metric-card__label">${escapeHtml(metric.label)}</span>
      <strong>${escapeHtml(metric.value)}</strong>
      <small>${escapeHtml(metric.note)}</small>
    </article>
  `).join("") : emptyMarkup("No metrics yet", "Dashboard metrics will appear after visitor activity starts.");
}

export function renderLoadingList(selector, count = 3) {
  const list = $(selector);
  if (!list) {
    return;
  }

  list.innerHTML = Array.from({ length: count }).map(() => `
    <article class="work-card work-card--skeleton" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
    </article>
  `).join("");
}

export function renderWorkList(selector, items = [], mapper, emptyTitle = "Nothing to show", emptyMessage = "New activity will appear here.") {
  const list = $(selector);
  if (!list) {
    return;
  }

  const safeItems = Array.isArray(items) ? items : [];
  list.innerHTML = safeItems.length ? safeItems.map(mapper).join("") : emptyMarkup(emptyTitle, emptyMessage);
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
  const mobileQuery = window.matchMedia("(max-width: 1024px)");

  if (shell && backdrop && backdrop.parentElement !== shell) {
    shell.append(backdrop);
  }
  const storageKey = `accessflow.sidebar:${resolveShellStorageScope()}`;

  const readSidebarPreference = () => {
    try {
      return window.sessionStorage.getItem(storageKey);
    } catch {
      return null;
    }
  };

  const persistSidebarPreference = (value) => {
    try {
      window.sessionStorage.setItem(storageKey, value);
    } catch {
      // Ignore storage access issues and fall back to in-memory UI state.
    }
  };

  const closeMobileSidebar = () => {
    setSidebarState("closed", { persist: false });
  };

  const setSidebarState = (nextState, options = {}) => {
    const { persist = true } = options;
    if (!shell) {
      return;
    }

    shell.dataset.sidebarState = nextState;
    document.body.classList.toggle("has-mobile-sidebar", mobileQuery.matches && nextState === "open");
    if (!mobileQuery.matches && persist) {
      persistSidebarPreference(nextState === "collapsed" ? "collapsed" : "expanded");
    }
  };

  const syncSidebarMode = () => {
    if (!shell) {
      return;
    }

    if (mobileQuery.matches) {
      closeMobileSidebar();
      return;
    }

    document.body.classList.remove("has-mobile-sidebar");
    const preferredState = readSidebarPreference();
    const desktopState = preferredState === "collapsed" ? "collapsed" : "expanded";
    setSidebarState(desktopState, { persist: false });
  };

  toggle?.addEventListener("click", () => {
    if (!shell) {
      return;
    }
    if (mobileQuery.matches) {
      const isOpen = shell.dataset.sidebarState === "open";
      setSidebarState(isOpen ? "closed" : "open");
    } else {
      const isCollapsed = shell.dataset.sidebarState === "collapsed";
      setSidebarState(isCollapsed ? "expanded" : "collapsed");
    }
  });

  collapse?.addEventListener("click", () => {
    if (!shell) {
      return;
    }
    const isCollapsed = shell.dataset.sidebarState === "collapsed";
    setSidebarState(isCollapsed ? "expanded" : "collapsed");
    collapse.setAttribute("aria-label", isCollapsed ? "Collapse sidebar" : "Expand sidebar");
  });

  backdrop?.addEventListener("click", () => {
    closeMobileSidebar();
  });

  bindMediaQuery(mobileQuery, "change", syncSidebarMode);

  syncSidebarMode();
}

function initRouteNavigation(options) {
  const { allowedRoutes = [], routeMap = null, activeRoute = "", defaultHref = "" } = options;

  if (routeMap) {
    initPathRoutes(allowedRoutes, routeMap, activeRoute, defaultHref);
    return;
  }

  initHashRoutes(allowedRoutes);
}

function initHashRoutes(allowedRoutes) {
  const validRoutes = new Set(allowedRoutes);
  const links = $$("#sidebar-nav .nav-link");
  const firstAllowedRoute = allowedRoutes[0];

  if (!firstAllowedRoute) {
    return;
  }

  links.forEach((link) => {
    const route = link.dataset.route;
    const allowed = validRoutes.has(route);
    link.hidden = !allowed;
    link.setAttribute("aria-hidden", String(!allowed));
    const section = route ? document.getElementById(route) : null;
    if (section) {
      section.hidden = !allowed;
    }
  });

  links.forEach((link) => {
    link.addEventListener("click", () => {
      links.forEach((item) => item.classList.remove("is-active"));
      link.classList.add("is-active");
      links.forEach((item) => item.removeAttribute("aria-current"));
      link.setAttribute("aria-current", "page");
      if (window.matchMedia("(max-width: 1024px)").matches) {
        const shell = $(".portal-shell");
        if (shell) {
          shell.dataset.sidebarState = "closed";
        }
        document.body.classList.remove("has-mobile-sidebar");
      }
    });
  });

  const syncHash = () => {
    const route = window.location.hash.replace("#", "") || firstAllowedRoute;
    if (!validRoutes.has(route)) {
      window.location.hash = firstAllowedRoute;
      return;
    }
    links.forEach((link) => {
      const isActive = link.dataset.route === route;
      link.classList.toggle("is-active", isActive);
      if (isActive) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  };

  window.addEventListener("hashchange", syncHash);
  syncHash();
}

function initPathRoutes(allowedRoutes, routeMap, activeRoute, defaultHref) {
  const validRoutes = new Set(allowedRoutes);
  const links = $$("#sidebar-nav .nav-link");

  links.forEach((link) => {
    const route = link.dataset.route;
    const allowed = validRoutes.has(route);
    link.hidden = !allowed;
    link.setAttribute("aria-hidden", String(!allowed));
    if (allowed && routeMap[route]?.href) {
      link.setAttribute("href", routeMap[route].href);
    }
    const isActive = route === activeRoute;
    link.classList.toggle("is-active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  const fallbackHref = defaultHref || routeMap[allowedRoutes[0]]?.href || "/";
  $$("[data-default-admin-link]").forEach((link) => {
    link.setAttribute("href", fallbackHref);
  });
}

function initLogout() {
  const button = $("#logout-button");
  if (!button || button.dataset.bound === "true") {
    return;
  }

  button.dataset.bound = "true";
  button.addEventListener("click", () => {
    if (button.disabled) {
      return;
    }

    const refreshToken = getRefreshToken();
    button.disabled = true;
    button.classList.add("is-loading");
    clearSession();

    if (refreshToken) {
      void logout(refreshToken, { keepalive: true });
    }

    window.location.replace(LOGIN_FROM_PORTAL);
  });
}

function initNotifications() {
  const actions = $(".topbar__actions");
  if (!actions || $("#notification-button")) {
    return;
  }

  actions.insertAdjacentHTML("afterbegin", `
    <div class="notification-menu" id="notification-menu">
      <button class="icon-button notification-button" id="notification-button" type="button" aria-label="Notifications" aria-expanded="false">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22a2.4 2.4 0 0 0 2.3-1.8H9.7A2.4 2.4 0 0 0 12 22Zm7-5-2-2v-4a5 5 0 0 0-10 0v4l-2 2v1h14Z"/></svg>
        <span class="notification-badge is-hidden" id="notification-badge">0</span>
      </button>
      <section class="notification-popover is-hidden" id="notification-popover" aria-label="Notifications">
        <div class="notification-popover__header">
          <strong>Notifications</strong>
          <button class="button button--ghost" id="notification-read-all" type="button">Mark all read</button>
        </div>
        <div class="notification-list" id="notification-list"></div>
      </section>
    </div>
  `);

  $("#notification-button")?.addEventListener("click", () => {
    const popover = $("#notification-popover");
    const isHidden = popover?.classList.toggle("is-hidden");
    $("#notification-button")?.setAttribute("aria-expanded", String(!isHidden));
  });

  $("#notification-read-all")?.addEventListener("click", async () => {
    try {
      renderNotifications((await markAllNotificationsRead()).data, false);
    } catch (error) {
      showToast("Notifications unavailable", error.message);
    }
  });

  $("#notification-list")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-notification-id]");
    if (!button) {
      return;
    }
    try {
      const response = await markNotificationRead(button.dataset.notificationId);
      renderNotifications(response.data, false);
    } catch (error) {
      showToast("Notification update failed", error.message);
    }
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest("#notification-menu")) {
      $("#notification-popover")?.classList.add("is-hidden");
      $("#notification-button")?.setAttribute("aria-expanded", "false");
    }
  });

  loadNotifications(false);
  window.clearInterval(notificationPollTimer);
  notificationPollTimer = window.setInterval(() => loadNotifications(true), 20000);
  window.addEventListener("beforeunload", () => window.clearInterval(notificationPollTimer), { once: true });
}

async function loadNotifications(showNewToast) {
  try {
    const response = await getNotifications(10);
    renderNotifications(response?.data, showNewToast);
  } catch {
    renderNotifications({ unreadCount: 0, items: [] }, false);
  }
}

function renderNotifications(data, showNewToast) {
  const badge = $("#notification-badge");
  const list = $("#notification-list");
  const unreadCount = Number(data?.unreadCount) || 0;
  const items = Array.isArray(data?.items) ? data.items : [];

  if (badge) {
    badge.textContent = unreadCount > 9 ? "9+" : String(unreadCount);
    badge.classList.toggle("is-hidden", unreadCount === 0);
  }

  if (list) {
    list.innerHTML = items.length ? items.map(notificationItem).join("") : `
      <article class="notification-empty">
        <strong>No notifications</strong>
        <span>New visitor activity will appear here.</span>
      </article>
    `;
  }

  const newest = items[0];
  if (showNewToast && newest && newest.createdAt && newest.createdAt !== latestNotificationSeenAt && !newest.read) {
    showToast(newest.title, newest.message);
  }
  if (newest?.createdAt) {
    latestNotificationSeenAt = newest.createdAt;
  }
}

function notificationItem(item) {
  return `
    <button class="notification-item ${item.read ? "" : "is-unread"}" type="button" data-notification-id="${escapeHtml(item.id)}">
      <span>
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.message)}</small>
      </span>
      <time>${escapeHtml(formatDate(item.createdAt, { dateStyle: "short", timeStyle: "short" }))}</time>
    </button>
  `;
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

function initRefreshControl(onRefresh) {
  const button = $("#refresh-health");
  if (!button) {
    return;
  }

  button.onclick = null;
  button.addEventListener("click", async () => {
    if (button.disabled) {
      return;
    }

    button.disabled = true;
    button.classList.add("is-loading");
    button.setAttribute("aria-busy", "true");

    try {
      const tasks = [refreshHealth(false)];
      if (typeof onRefresh === "function") {
        tasks.push(Promise.resolve().then(() => onRefresh()).catch((error) => {
          showToast("Workspace refresh failed", error?.message || "Workspace data could not be refreshed.");
        }));
      }
      await Promise.all(tasks);
      showToast(
        typeof onRefresh === "function" ? "Dashboard refreshed" : "API online",
        typeof onRefresh === "function" ? "Latest workspace data loaded." : "Backend health check completed.",
      );
    } catch (error) {
      showToast("Refresh interrupted", error?.message || "Some dashboard data could not be refreshed.");
    } finally {
      button.disabled = false;
      button.classList.remove("is-loading");
      button.removeAttribute("aria-busy");
    }
  });
}

function resolveShellStorageScope() {
  const path = window.location.pathname || "portal";
  const segments = path.split("/").filter(Boolean);
  return segments.slice(0, 2).join(":") || "portal";
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
  return formatStatus(role || "USER");
}

function emptyMarkup(title, message) {
  return `
    <article class="empty-state empty-state--inline">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
    </article>
  `;
}

function safeShellInit(label, callback) {
  try {
    callback();
  } catch (error) {
    if (typeof console !== "undefined" && typeof console.warn === "function") {
      console.warn(`[portal] ${label} initialization failed`, {
        message: error?.message || String(error),
      });
    }
  }
}

function bindMediaQuery(query, eventName, listener) {
  if (typeof query?.addEventListener === "function") {
    query.addEventListener(eventName, listener);
  } else if (typeof query?.addListener === "function") {
    query.addListener(listener);
  }
}
