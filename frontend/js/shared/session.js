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
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  window.dispatchEvent(new CustomEvent("session:changed", { detail: session }));
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
