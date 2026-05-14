const SESSION_KEY = "visitor_management_session";
const ROLE_PRIORITY = ["SUPER_ADMIN", "ADMIN", "EMPLOYEE", "SECURITY_GUARD", "VISITOR"];

export function getSession() {
  try {
    const stored = JSON.parse(localStorage.getItem(SESSION_KEY));
    return normalizeAuthResponse(stored, { context: "stored session", log: false });
  } catch {
    return null;
  }
}

export function setSession(session) {
  const normalizedSession = normalizeAuthResponse(session, { context: "session persistence" });
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

export function normalizeAuthResponse(response, options = {}) {
  const { context = "auth response", log = true } = options;
  const payload = unwrapAuthPayload(response);

  if (!payload || typeof payload !== "object") {
    logAuthWarning(log, context, "Auth response payload is empty or not an object.", response);
    return null;
  }

  const source = payload;
  const user = source.user && typeof source.user === "object" ? source.user : {};
  const accessToken = typeof source.accessToken === "string" ? source.accessToken.trim() : "";
  const refreshToken = typeof source.refreshToken === "string" ? source.refreshToken.trim() : "";

  if (!accessToken || !refreshToken) {
    logAuthWarning(log, context, "Auth response is missing accessToken or refreshToken.", source);
    return null;
  }

  if (!source.user || typeof source.user !== "object") {
    logAuthWarning(log, context, "Auth response did not include a user object; using flat user fields.", source);
  }

  const responseRoles = normalizeRoles(source.roles || user.roles || source.role || user.role);
  const tokenRoles = getTokenRoles(accessToken);
  const roles = mergeRoles(responseRoles, tokenRoles);
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

export function normalizeSessionPayload(payload) {
  return normalizeAuthResponse(payload);
}

function unwrapAuthPayload(response) {
  if (!response || typeof response !== "object") {
    return null;
  }

  const payload = response.data && typeof response.data === "object" ? response.data : response;
  if (hasAuthTokens(payload)) {
    return payload;
  }

  if (payload.data && typeof payload.data === "object" && hasAuthTokens(payload.data)) {
    return payload.data;
  }

  return payload;
}

function hasAuthTokens(value) {
  return Boolean(value && typeof value === "object" && (value.accessToken || value.refreshToken));
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

function mergeRoles(...roleSets) {
  const seen = new Set();
  const roles = [];
  roleSets.flat().forEach((role) => {
    if (typeof role !== "string") {
      return;
    }
    const normalizedRole = role.trim();
    if (normalizedRole && !seen.has(normalizedRole)) {
      seen.add(normalizedRole);
      roles.push(normalizedRole);
    }
  });
  return roles.sort((left, right) => {
    const leftIndex = ROLE_PRIORITY.indexOf(left);
    const rightIndex = ROLE_PRIORITY.indexOf(right);
    return (leftIndex === -1 ? ROLE_PRIORITY.length : leftIndex) - (rightIndex === -1 ? ROLE_PRIORITY.length : rightIndex);
  });
}

function logAuthWarning(shouldLog, context, message, payload) {
  if (!shouldLog || typeof console === "undefined" || typeof console.warn !== "function") {
    return;
  }

  console.warn(`[auth] ${message}`, {
    context,
    payloadKeys: payload && typeof payload === "object" ? Object.keys(payload) : [],
    hasDataEnvelope: Boolean(payload?.data && typeof payload.data === "object"),
    hasUser: Boolean(payload?.user && typeof payload.user === "object"),
    hasAccessToken: Boolean(payload?.accessToken),
    hasRefreshToken: Boolean(payload?.refreshToken),
  });
}
