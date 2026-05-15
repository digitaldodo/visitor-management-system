const SESSION_KEY = "visitor_management_session";
const ROLE_PRIORITY = ["SUPER_ADMIN", "ADMIN", "EMPLOYEE", "SECURITY_GUARD", "VISITOR"];
const ROLE_ALIASES = {
  SECURITY: "SECURITY_GUARD",
  SECURITY_ADMIN: "SECURITY_GUARD",
};

export function getSession() {
  try {
    const rawSession = localStorage.getItem(SESSION_KEY);
    if (!rawSession) {
      return null;
    }
    const stored = JSON.parse(rawSession);
    const session = normalizeAuthResponse(stored, { context: "stored session", log: false });
    if (!session) {
      localStorage.removeItem(SESSION_KEY);
    }
    return session;
  } catch {
    localStorage.removeItem(SESSION_KEY);
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
    return normalizeRoles(claims.roles);
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
  const accessToken = firstString(source.accessToken, source.token, source.jwt, source.access_token);
  const refreshToken = firstString(source.refreshToken, source.refresh_token);

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
    organizationId: firstNullable(source.organizationId, user.organizationId),
    organizationName: firstNullable(source.organizationName, user.organizationName),
    organizationCode: firstNullable(source.organizationCode, user.organizationCode),
    organizationTimezone: firstNullable(source.organizationTimezone, user.organizationTimezone),
    organizationRegionCountry: firstNullable(source.organizationRegionCountry, user.organizationRegionCountry),
    roles,
    user: {
      id: user.id || source.userId || null,
      username: user.username || source.username || null,
      email: user.email || source.email || null,
      role: user.role || roles[0] || null,
      organizationCode: firstNullable(user.organizationCode, source.organizationCode),
      organizationName: firstNullable(user.organizationName, source.organizationName),
      organizationTimezone: firstNullable(user.organizationTimezone, source.organizationTimezone),
      organizationRegionCountry: firstNullable(user.organizationRegionCountry, source.organizationRegionCountry),
      fullName: user.fullName || source.fullName || null,
      organizationId: firstNullable(user.organizationId, source.organizationId),
      roles,
    },
  };
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
    return value
      .filter((role) => typeof role === "string" && role.trim())
      .map(normalizeRole)
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return [normalizeRole(value)].filter(Boolean);
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
    const normalizedRole = normalizeRole(role);
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

function normalizeRole(role) {
  const normalized = String(role || "").trim().toUpperCase();
  return ROLE_ALIASES[normalized] || normalized;
}

function firstString(...values) {
  const value = values.find((item) => typeof item === "string" && item.trim());
  return value ? value.trim() : "";
}

function firstNullable(...values) {
  const value = values.find((item) => item !== undefined && item !== null);
  return value ?? null;
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
