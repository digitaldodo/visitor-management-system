const SESSION_KEY = "visitor_management_session";
const ROLE_PRIORITY = ["SUPER_ADMIN", "ADMIN", "EMPLOYEE", "SECURITY_GUARD", "VISITOR"];

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

export function setSession(session) {
  const normalizedSession = normalizeSessionPayload(session);
  if (!normalizedSession) {
    clearSession();
    throw new Error("Authentication response is missing token or user data.");
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(normalizedSession));
  window.dispatchEvent(new CustomEvent("session:changed", { detail: normalizedSession }));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new CustomEvent("session:changed", { detail: null }));
}

export function getAccessToken() {
  return getSession()?.accessToken || null;
}

export function getRefreshToken() {
  return getSession()?.refreshToken || null;
}

export function getPrimaryRole() {
  const roles = getSession()?.roles || [];
  return ROLE_PRIORITY.find((role) => roles.includes(role)) || roles[0] || null;
}

export function isAuthenticated() {
  return Boolean(getAccessToken() && getRefreshToken());
}

export function getTokenRoles(token = getAccessToken()) {
  if (!token) {
    return [];
  }

  try {
    const [, payload] = token.split(".");
    const normalized = payload.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const claims = JSON.parse(atob(padded));
    return Array.isArray(claims.roles) ? claims.roles : [];
  } catch {
    return [];
  }
}

export function normalizeSessionPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const source = payload.data && typeof payload.data === "object" ? payload.data : payload;
  const user = source.user && typeof source.user === "object" ? source.user : {};
  const accessToken = source.accessToken;
  const refreshToken = source.refreshToken;

  if (!accessToken || !refreshToken) {
    return null;
  }

  const roles = normalizeRoles(source.roles || user.roles || source.role || user.role);
  return {
    accessToken,
    refreshToken,
    tokenType: source.tokenType || "Bearer",
    expiresAt: source.expiresAt || null,
    userId: source.userId || user.id || null,
    username: source.username || user.username || null,
    email: source.email || user.email || null,
    fullName: source.fullName || user.fullName || user.username || user.email || null,
    organizationId: source.organizationId || user.organizationId || null,
    organizationName: source.organizationName || user.organizationName || null,
    organizationCode: source.organizationCode || user.organizationCode || null,
    roles,
    user: {
      id: user.id || source.userId || null,
      username: user.username || source.username || null,
      email: user.email || source.email || null,
      role: user.role || roles[0] || null,
      organizationCode: user.organizationCode || source.organizationCode || null,
      organizationName: user.organizationName || source.organizationName || null,
      fullName: user.fullName || source.fullName || null,
      organizationId: user.organizationId || source.organizationId || null,
      roles,
    },
  };
}

function normalizeRoles(value) {
  if (Array.isArray(value)) {
    return value.filter((role) => typeof role === "string" && role.trim()).map((role) => role.trim());
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}
