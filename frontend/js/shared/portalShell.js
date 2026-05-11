import { logout } from "./authApi.js";
import { getHealth } from "./healthApi.js";
import { $, $$, setText } from "./dom.js";
import { LOGIN_FROM_PORTAL } from "./config.js";
import { clearSession, getRefreshToken } from "./session.js";
import { showToast } from "./toast.js";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "./notificationApi.js";
import { formatDate, formatStatus } from "./formatters.js";

let notificationPollTimer;
let latestNotificationSeenAt = "";

export function initPortalShell(session, options = {}) {
  initSidebar();
  initLogout();
  initRouteTabs(options.allowedRoutes || []);
  initNotifications();
  $("#refresh-health")?.addEventListener("click", () => refreshHealth(true));

  const organization = session.organizationName || session.organizationCode;
  const context = organization ? `${organization} · ` : "";
  setText("#user-chip", `${session.fullName || session.email} · ${context}${formatRole(session.roles?.[0])}`);
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

  toggle?.addEventListener("click", () => {
    if (!shell) {
      return;
    }
    if (mobileQuery.matches) {
      const isOpen = shell.dataset.sidebarState === "open";
      shell.dataset.sidebarState = isOpen ? "closed" : "open";
    } else {
      const isCollapsed = shell.dataset.sidebarState === "collapsed";
      shell.dataset.sidebarState = isCollapsed ? "expanded" : "collapsed";
    }
  });

  collapse?.addEventListener("click", () => {
    if (!shell) {
      return;
    }
    const isCollapsed = shell.dataset.sidebarState === "collapsed";
    shell.dataset.sidebarState = isCollapsed ? "expanded" : "collapsed";
    collapse.setAttribute("aria-label", isCollapsed ? "Collapse sidebar" : "Expand sidebar");
  });

  backdrop?.addEventListener("click", () => {
    if (shell) {
      shell.dataset.sidebarState = "closed";
    }
  });

  mobileQuery.addEventListener("change", () => {
    if (shell) {
      shell.dataset.sidebarState = mobileQuery.matches ? "closed" : "expanded";
    }
  });
}

function initRouteTabs(allowedRoutes) {
  const validRoutes = new Set(allowedRoutes);
  const links = $$("#sidebar-nav .nav-link");

  links.forEach((link) => {
    link.addEventListener("click", () => {
      links.forEach((item) => item.classList.remove("is-active"));
      link.classList.add("is-active");
      if (window.matchMedia("(max-width: 1024px)").matches) {
        const shell = $(".portal-shell");
        if (shell) {
          shell.dataset.sidebarState = "closed";
        }
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
    renderNotifications(response.data, showNewToast);
  } catch {
    renderNotifications({ unreadCount: 0, items: [] }, false);
  }
}

function renderNotifications(data, showNewToast) {
  const badge = $("#notification-badge");
  const list = $("#notification-list");
  const unreadCount = data?.unreadCount || 0;
  const items = data?.items || [];

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
