import { logout } from "./authApi.js";
import { getHealth } from "./healthApi.js";
import { $, $$, setText } from "./dom.js";
import { LOGIN_FROM_PORTAL } from "./config.js";
import { clearSession, getRefreshToken } from "./session.js";
import { showToast } from "./toast.js";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "./notificationApi.js";
import { formatDate, formatStatus, setDefaultTimezone, timezoneLabel } from "./formatters.js";
import { initWebLocalization, localizedHtml, translateFragment } from "./localization.js";
import { createNonOverlappingPoller, renderHtmlIfChanged, renderMappedList } from "./performance.js";

let notificationPoller;
let notificationHydrated = false;
let notificationLoading = false;
const seenNotificationIds = new Set();
const browserNotificationIds = new Set();
const OPERATIONAL_NOTIFICATION_FRESH_MS = 10 * 60 * 1000;

export function initPortalShell(session, options = {}) {
  setDefaultTimezone(session.organizationTimezone || session.user?.organizationTimezone || "UTC");
  safeShellInit("sidebar", initSidebar);
  safeShellInit("logout", initLogout);
  safeShellInit("route navigation", () => initRouteNavigation(options));
  safeShellInit("notifications", initNotifications);
  safeShellInit("refresh control", () => initRefreshControl(options.onRefresh));
  safeShellInit("localization", initWebLocalization);

  renderIdentityChip(session, options.portalProfile);
  refreshHealth(false);
}

export function renderMetrics(metrics = []) {
  const grid = $("#metric-grid");
  if (!grid) {
    return;
  }

  const html = metrics.length ? metrics.map((metric) => `
    <article class="metric-card">
      <span class="metric-card__label">${localizedHtml(metric.label)}</span>
      <strong>${escapeHtml(metric.value)}</strong>
      <small>${localizedHtml(metric.note)}</small>
    </article>
  `).join("") : emptyMarkup("No metrics yet", "Dashboard metrics will appear after visitor activity starts.");
  if (renderHtmlIfChanged(grid, html)) {
    translateFragment(grid);
  }
}

export function renderLoadingList(selector, count = 3) {
  const list = $(selector);
  if (!list) {
    return;
  }

  renderHtmlIfChanged(list, Array.from({ length: count }).map(() => `
    <article class="work-card work-card--skeleton" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
    </article>
  `).join(""));
}

export function renderWorkList(selector, items = [], mapper, emptyTitle = "Nothing to show", emptyMessage = "New activity will appear here.") {
  const list = $(selector);
  if (!list) {
    return;
  }

  renderMappedList(list, items, mapper, {
    emptyHtml: emptyMarkup(emptyTitle, emptyMessage),
    afterRender: translateFragment,
  });
}

export function workCard(title, detail, meta = "") {
  return `
    <article class="work-card">
      <h3>${localizedHtml(title)}</h3>
      <p>${localizedHtml(detail)}</p>
      ${meta ? `<small>${localizedHtml(meta)}</small>` : ""}
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

    replaceShellLocation(LOGIN_FROM_PORTAL);
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
      openNotificationTarget(button.dataset);
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

  notificationPoller?.stop();
  notificationPoller = createNonOverlappingPoller(() => loadNotifications(true), {
    intervalMs: 30000,
    backgroundIntervalMs: 120000,
    immediate: false,
  });
  void loadNotifications(false);
  notificationPoller.start();
  window.addEventListener("beforeunload", () => notificationPoller?.stop(), { once: true });
}

async function loadNotifications(showNewToast) {
  if (notificationLoading) {
    return;
  }
  notificationLoading = true;
  try {
    const response = await getNotifications(20);
    renderNotifications(response?.data, showNewToast);
  } catch {
    renderNotifications({ unreadCount: 0, items: [] }, false);
  } finally {
    notificationLoading = false;
  }
}

function renderNotifications(data, showNewToast) {
  const badge = $("#notification-badge");
  const list = $("#notification-list");
  const unreadCount = Number(data?.unreadCount) || 0;
  const items = Array.isArray(data?.items) ? data.items : [];

  if (badge) {
    const nextText = unreadCount > 9 ? "9+" : String(unreadCount);
    if (badge.textContent !== nextText) {
      badge.textContent = nextText;
    }
    badge.classList.toggle("is-hidden", unreadCount === 0);
  }

  if (list) {
    renderMappedList(list, items, notificationItem, {
      emptyHtml: `
      <article class="notification-empty">
        <strong>No notifications</strong>
        <span>New visitor activity will appear here.</span>
      </article>
    `,
    });
  }

  const newUnreadItems = items.filter((item) => item?.id && !item.read && !seenNotificationIds.has(item.id) && isFreshOperationalNotification(item));
  if (notificationHydrated && showNewToast && newUnreadItems.length) {
    announceNewNotifications(newUnreadItems);
  }
  items.forEach((item) => {
    if (item?.id) {
      seenNotificationIds.add(item.id);
    }
  });
  notificationHydrated = true;
}

function notificationItem(item) {
  return `
    <button
      class="notification-item ${item.read ? "" : "is-unread"}"
      type="button"
      data-notification-id="${escapeHtml(item.id)}"
      data-notification-type="${escapeHtml(item.type || "")}"
      data-notification-category="${escapeHtml(item.category || "")}"
      data-notification-priority="${escapeHtml(item.priority || "")}"
      data-notification-action-url="${escapeHtml(item.actionUrl || "")}"
      data-notification-target-type="${escapeHtml(item.targetType || "")}"
      data-notification-target-id="${escapeHtml(item.targetId || item.visitorId || "")}"
      data-notification-deep-link="${escapeHtml(item.deepLink || "")}"
    >
      <span>
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.message)}</small>
      </span>
      <time>${escapeHtml(formatDate(item.createdAt, { dateStyle: "short", timeStyle: "short" }))}</time>
    </button>
  `;
}

function announceNewNotifications(items) {
  const actionableItems = items.filter(shouldAnnounceNotification);
  const toastItem = actionableItems[0];
  if (toastItem) {
    showToast(toastItem.title, toastItem.message);
  }

  actionableItems.slice(0, 2).forEach((item) => {
    maybeShowBrowserNotification(item);
  });
}

function shouldAnnounceNotification(item) {
  const priority = String(item.priority || "").toUpperCase();
  const category = String(item.category || "").toUpperCase();
  return priority === "CRITICAL" || priority === "HIGH" || category === "SECURITY";
}

function isFreshOperationalNotification(item) {
  const createdAt = Date.parse(item.createdAt || "");
  if (!Number.isFinite(createdAt)) {
    return true;
  }
  return Date.now() - createdAt <= OPERATIONAL_NOTIFICATION_FRESH_MS;
}

function maybeShowBrowserNotification(item) {
  if (!("Notification" in window) || Notification.permission !== "granted" || browserNotificationIds.has(item.id)) {
    return;
  }
  browserNotificationIds.add(item.id);
  try {
    const notification = new Notification(item.title || "AccessFlow update", {
      body: item.message || "Operational notification",
      tag: item.id,
      renotify: false,
      silent: String(item.priority || "").toUpperCase() !== "CRITICAL",
    });
    notification.onclick = () => {
      window.focus();
      openNotificationTarget(item);
      notification.close();
    };
  } catch {
    // Browser notification support varies; the in-app center remains authoritative.
  }
}

function openNotificationTarget(item) {
  const actionUrl = item.actionUrl || item.notificationActionUrl || item.dataset?.notificationActionUrl;
  const type = item.type || item.notificationType || item.dataset?.notificationType;
  const targetType = item.targetType || item.notificationTargetType || item.dataset?.notificationTargetType;
  const targetId = item.targetId || item.notificationTargetId || item.dataset?.notificationTargetId;
  const deepLink = item.deepLink || item.notificationDeepLink || item.dataset?.notificationDeepLink;
  const resolved = resolveNotificationTarget({ actionUrl, type, targetType, targetId, deepLink });
  if (!resolved) {
    return;
  }
  if (resolved.startsWith("#")) {
    window.location.hash = resolved;
    return;
  }
  assignShellLocation(resolved);
}

function resolveNotificationTarget({ actionUrl, type, targetType, targetId, deepLink }) {
  const route = routeFromActionUrl(actionUrl);
  if (route) {
    return route;
  }
  const parsedDeepLink = parseOperationalDeepLink(deepLink);

  const normalized = `${type || ""} ${targetType || parsedDeepLink.targetType || ""}`.toUpperCase();
  const resolvedTargetId = targetId || parsedDeepLink.targetId;
  const portalPath = window.location.pathname.toLowerCase();
  if (normalized.includes("INVITE")) {
    if (portalPath.includes("/admin")) {
      return adminTarget("visitor-access");
    }
    if (portalPath.includes("/security")) {
      return securityTarget("approvals");
    }
    if (portalPath.includes("/visitor")) {
      return "/visitor/requests";
    }
    return employeeTarget("requests");
  }
  if (normalized.includes("BADGE")) {
    if (portalPath.includes("/admin")) {
      return adminTarget("visitor-access");
    }
    if (portalPath.includes("/security")) {
      return securityTarget("verification");
    }
    if (portalPath.includes("/employee") && normalized.includes("EMPLOYEE")) {
      return employeeTarget("badge");
    }
    return portalPath.includes("/visitor") ? "/visitor/badge" : employeeTarget("requests");
  }
  if (normalized.includes("EMERGENCY") || normalized.includes("INCIDENT") || normalized.includes("SUSPICIOUS")) {
    if (portalPath.includes("/admin")) {
      return adminTarget("emergency-ops");
    }
    return portalPath.includes("/security") ? securityTarget("incidents") : employeeTarget("notifications");
  }
  if (normalized.includes("WORKFORCE") || normalized.includes("EMPLOYEE")) {
    if (portalPath.includes("/admin")) {
      return adminTarget("workforce-approvals");
    }
    return portalPath.includes("/security")
      ? securityTarget(normalized.includes("APPROVAL") || normalized.includes("ONBOARDING") ? "approvals" : "checkins")
      : employeeTarget("presence");
  }
  if (normalized.includes("APPROVAL")) {
    if (portalPath.includes("/admin")) {
      return adminTarget("visitor-access");
    }
    return portalPath.includes("/security") ? securityTarget("approvals") : employeeTarget("requests");
  }
  if (normalized.includes("VISITOR") || normalized.includes("BADGE") || resolvedTargetId) {
    if (portalPath.includes("/admin")) {
      return adminTarget("visitor-access");
    }
    if (portalPath.includes("/security")) {
      return securityTarget("visitors");
    }
    if (portalPath.includes("/visitor")) {
      return "/visitor/requests";
    }
    return employeeTarget("requests");
  }
  if (portalPath.includes("/admin")) {
    return adminTarget("notifications");
  }
  return portalPath.includes("/security") ? securityTarget("notifications") : employeeTarget("notifications");
}

function adminTarget(route) {
  return window.location.pathname.toLowerCase().includes("/pages/admin") ? `#${route}` : `/admin/${route}`;
}

function securityTarget(route) {
  return `/security/${route}`;
}

function employeeTarget(route) {
  return `/employee/${route}`;
}

function parseOperationalDeepLink(value) {
  const normalized = String(value || "").trim();
  if (!normalized.startsWith("accessflow://operations/")) {
    return { targetType: "", targetId: "" };
  }
  const [targetType, ...targetId] = normalized.replace("accessflow://operations/", "").split("/");
  return {
    targetType,
    targetId: targetId.join("/"),
  };
}

function routeFromActionUrl(actionUrl) {
  const value = String(actionUrl || "").trim();
  if (!value || value.startsWith("accessflow://")) {
    return "";
  }
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) {
      return "";
    }
    if (url.pathname.includes("/pages/admin")) {
      const mapped = adminRouteFromLegacyHash(url.hash.replace("#", ""));
      return mapped ? adminTarget(mapped) : adminTarget("notifications");
    }
    if (!url.pathname.includes("/pages/") && ["/visitor", "/employee", "/security"].some((prefix) => url.pathname.startsWith(prefix))) {
      return "";
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "";
  }
}

function adminRouteFromLegacyHash(hash) {
  const normalized = String(hash || "").trim().toLowerCase();
  const aliases = {
    approvals: "visitor-access",
    visitors: "visitor-access",
    requests: "visitor-access",
    workforce: "workforce-approvals",
    "workforce-onboarding": "workforce-approvals",
    emergency: "emergency-ops",
    incidents: "emergency-ops",
    notifications: "notifications",
  };
  return aliases[normalized] || normalized;
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

function renderIdentityChip(session, portalProfile) {
  const chip = $("#user-chip");
  if (!chip) {
    return;
  }

  chip.classList.remove("user-chip--platform", "user-chip--organization");
  if (portalProfile?.identityClass) {
    chip.classList.add(portalProfile.identityClass);
  }

  const displayName = session.fullName || session.email || "Signed in";
  const scope = typeof portalProfile?.contextLabel === "function"
    ? portalProfile.contextLabel(session)
    : (session.organizationName || session.organizationCode || "Platform");
  const role = portalProfile?.identityScope || formatRole(session.roles?.[0]);
  const timezone = session.organizationName || session.organizationCode
    ? timezoneLabel(session.organizationTimezone || session.user?.organizationTimezone || "UTC")
    : "Global";
  const parts = [displayName, scope, timezone, role].filter(Boolean);
  chip.title = parts.join(" · ");
  chip.dataset.i18nIgnore = "true";
  chip.setAttribute("role", "button");
  chip.setAttribute("tabindex", "0");
  chip.setAttribute("aria-haspopup", "menu");
  chip.setAttribute("aria-expanded", "false");
  chip.setAttribute("aria-controls", "profile-menu");
  chip.setAttribute("aria-label", `Profile for ${displayName}`);
  chip.innerHTML = WorkspaceProfileChip({ displayName });
  ensureIdentityChipAnchor(chip);
  renderIdentityMenu(chip, { displayName, scope, timezone, role });
  bindIdentityMenu(chip);
}

function ensureIdentityChipAnchor(chip) {
  if (chip.parentElement?.classList.contains("profile-chip-shell")) {
    return chip.parentElement;
  }
  const anchor = document.createElement("span");
  anchor.className = "profile-chip-shell";
  chip.parentElement?.insertBefore(anchor, chip);
  anchor.append(chip);
  return anchor;
}

function AvatarChip(value, options = {}) {
  const safeInitials = initials(value);
  const label = options.label || `${value || "AccessFlow"} profile`;
  const imageUrl = String(options.imageUrl || "").trim();
  const sizeClass = options.size ? ` avatar-chip--${options.size}` : "";
  const imageMarkup = imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" alt="" loading="lazy" />`
    : `<span class="avatar-chip__initials" aria-hidden="true">${escapeHtml(safeInitials)}</span>`;
  return `
    <span class="avatar-chip${sizeClass}" aria-label="${escapeHtml(label)}" data-initial-count="${escapeHtml(String(graphemeLength(safeInitials)))}">
      ${imageMarkup}
    </span>
  `;
}

function UserIdentityBadge(identity) {
  return `
    <div class="user-identity-badge">
      ${AvatarChip(identity.displayName, { size: "lg", label: `${identity.displayName} profile`, imageUrl: identity.imageUrl })}
      <div class="user-identity-badge__copy">
        <strong data-i18n-ignore title="${escapeHtml(identity.displayName)}">${escapeHtml(identity.displayName)}</strong>
        <span data-i18n-ignore title="${escapeHtml(identity.scope || "Platform")}">${escapeHtml(identity.scope || "Platform")}</span>
      </div>
    </div>
  `;
}

function WorkspaceProfileChip(identity) {
  return `
    ${AvatarChip(identity.displayName, { label: `${identity.displayName} profile`, imageUrl: identity.imageUrl })}
    <span class="user-chip__primary" title="${escapeHtml(identity.displayName)}">${escapeHtml(identity.displayName)}</span>
    <span class="user-chip__chevron" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="m7 9 5 5 5-5 1.4 1.4L12 16.8l-6.4-6.4Z"/></svg>
    </span>
  `;
}

function renderIdentityMenu(chip, identity) {
  const anchor = ensureIdentityChipAnchor(chip);
  let menu = $("#profile-menu");
  if (!menu) {
    anchor.insertAdjacentHTML("beforeend", `<section class="profile-menu is-hidden" id="profile-menu" role="menu" aria-label="Profile context"></section>`);
    menu = $("#profile-menu");
  } else if (menu.parentElement !== anchor) {
    anchor.append(menu);
  }
  delete menu.dataset.i18nIgnore;
  menu.setAttribute("aria-labelledby", "user-chip");
  menu.innerHTML = `
    <div class="profile-menu__header">
      ${UserIdentityBadge(identity)}
    </div>
    <dl class="profile-menu__meta">
      <div><dt>Organization</dt><dd data-i18n-ignore title="${escapeHtml(identity.scope || "Platform")}">${escapeHtml(identity.scope || "Platform")}</dd></div>
      <div><dt>Role</dt><dd data-i18n-ignore title="${escapeHtml(identity.role || "User")}">${escapeHtml(identity.role || "User")}</dd></div>
      <div><dt>Timezone</dt><dd data-i18n-ignore title="${escapeHtml(identity.timezone || "UTC")}">${escapeHtml(identity.timezone || "UTC")}</dd></div>
    </dl>
  `;
}

function bindIdentityMenu(chip) {
  if (chip.dataset.menuBound === "true") {
    return;
  }
  chip.dataset.menuBound = "true";
  const closeMenu = () => {
    $("#profile-menu")?.classList.add("is-hidden");
    chip.setAttribute("aria-expanded", "false");
  };
  const toggleMenu = () => {
    const menu = $("#profile-menu");
    if (!menu) {
      return;
    }
    const nextOpen = menu.classList.toggle("is-hidden") === false;
    chip.setAttribute("aria-expanded", String(nextOpen));
    if (nextOpen) {
      positionIdentityMenu(chip, menu);
    }
  };
  const syncMenuPosition = () => {
    const menu = $("#profile-menu");
    if (menu && !menu.classList.contains("is-hidden")) {
      positionIdentityMenu(chip, menu);
    }
  };
  chip.addEventListener("click", toggleMenu);
  chip.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleMenu();
    }
    if (event.key === "Escape") {
      closeMenu();
    }
  });
  window.addEventListener("resize", syncMenuPosition);
  document.addEventListener("click", (event) => {
    if (!event.target.closest("#user-chip") && !event.target.closest("#profile-menu")) {
      closeMenu();
    }
  });
}

function positionIdentityMenu(chip, menu) {
  const anchor = chip.closest(".profile-chip-shell") || chip;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportPadding = 12;
  if (!viewportWidth) {
    return;
  }

  menu.style.left = "";
  menu.style.right = "";
  menu.style.width = "";
  menu.style.minWidth = "";

  const anchorRect = anchor.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const maxMenuWidth = viewportWidth - (viewportPadding * 2);
  if (menuRect.width > maxMenuWidth) {
    menu.style.width = `${maxMenuWidth}px`;
    menu.style.minWidth = "0";
  }

  const resolvedMenuWidth = Math.min(menuRect.width, maxMenuWidth);
  const leftEdgeWithDefaultRight = anchorRect.right - resolvedMenuWidth;
  if (leftEdgeWithDefaultRight < viewportPadding) {
    menu.style.right = `${anchorRect.right - resolvedMenuWidth - viewportPadding}px`;
    return;
  }

  if (anchorRect.right > viewportWidth - viewportPadding) {
    menu.style.right = `${anchorRect.right - viewportWidth + viewportPadding}px`;
  }
}

function initials(value) {
  const source = String(value || "").trim();
  const displaySource = source.includes("@") ? source.split("@")[0] : source;
  const words = displaySource
    .replace(/[_.,;:()[\]{}<>/\\|+="'`~!?@#$%^&*-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  const letters = words.map((part) => firstGrapheme(part).toLocaleUpperCase()).join("");
  if (letters) {
    return letters;
  }
  return firstGrapheme(displaySource).toLocaleUpperCase() || "AF";
}

function firstGrapheme(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const first = segmenter.segment(text)[Symbol.iterator]().next();
    return first?.value?.segment || "";
  }
  return Array.from(text)[0] || "";
}

function graphemeLength(value) {
  const text = String(value || "");
  if (!text) {
    return 0;
  }
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)).length;
  }
  return Array.from(text).length;
}

function emptyMarkup(title, message) {
  return `
    <article class="empty-state empty-state--inline">
      <h3>${localizedHtml(title)}</h3>
      <p>${localizedHtml(message)}</p>
    </article>
  `;
}

function safeShellInit(label, callback) {
  try {
    callback();
  } catch {
    void label;
  }
}

function bindMediaQuery(query, eventName, listener) {
  if (typeof query?.addEventListener === "function") {
    query.addEventListener(eventName, listener);
  } else if (typeof query?.addListener === "function") {
    query.addListener(listener);
  }
}

function assignShellLocation(target) {
  const nextUrl = resolveShellUrl(target);
  if (!nextUrl || sameShellLocation(nextUrl)) {
    return false;
  }
  window.location.assign(nextUrl);
  return true;
}

function replaceShellLocation(target) {
  const nextUrl = resolveShellUrl(target);
  if (!nextUrl || sameShellLocation(nextUrl)) {
    return false;
  }
  window.location.replace(nextUrl);
  return true;
}

function sameShellLocation(target) {
  try {
    const current = new URL(window.location.href);
    const next = new URL(target, window.location.href);
    current.searchParams.delete("afv");
    next.searchParams.delete("afv");
    return current.toString() === next.toString();
  } catch {
    return false;
  }
}

function resolveShellUrl(target) {
  try {
    return new URL(target, window.location.href).toString();
  } catch {
    return "";
  }
}
