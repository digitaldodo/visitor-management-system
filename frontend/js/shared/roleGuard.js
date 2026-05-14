import { LOGIN_FROM_PORTAL, ROLE_PORTALS, ROLE_PORTALS_FROM_PORTAL } from "./config.js";
import { clearSession, getPrimaryRole, getSession, getTokenRoles, isAuthenticated } from "./session.js";

export function redirectToPortal(role, fromPortal = false) {
  const target = fromPortal ? ROLE_PORTALS_FROM_PORTAL[role] : ROLE_PORTALS[role];
  window.location.assign(target || (fromPortal ? LOGIN_FROM_PORTAL : "./index.html"));
}

export function redirectToLogin() {
  window.location.assign(LOGIN_FROM_PORTAL);
}

export function redirectAuthenticatedFromLogin() {
  if (!isAuthenticated()) {
    return false;
  }

  const role = getPrimaryRole();
  if (ROLE_PORTALS[role]) {
    redirectToPortal(role, false);
    return true;
  }

  clearSession();
  return false;
}

export function requireRole(requiredRole) {
  const session = getSession();
  if (!session || !isAuthenticated()) {
    redirectToLogin();
    return null;
  }

  const sessionRoles = Array.isArray(session.roles) ? session.roles : [];
  const tokenRoles = getTokenRoles(session?.accessToken);
  const hasRequiredSessionRole = hasEffectiveRole(sessionRoles, requiredRole);
  const hasRequiredTokenRole = hasEffectiveRole(tokenRoles, requiredRole);

  if (hasRequiredSessionRole && hasRequiredTokenRole) {
    return session;
  }

  const fallbackRole = resolvePortalRole(tokenRoles) || resolvePortalRole(sessionRoles);
  if (fallbackRole) {
    logRoleGuardWarning("Redirecting to the portal matching the authenticated role.", {
      requiredRole,
      fallbackRole,
      sessionRoles,
      tokenRoles,
    });
    redirectToPortal(fallbackRole, true);
    return null;
  }

  logRoleGuardWarning("Stored session has no usable role; clearing session.", {
    requiredRole,
    sessionRoles,
    tokenRoles,
  });
  clearSession();
  redirectToLogin();
  return null;
}

function hasEffectiveRole(roles, requiredRole) {
  return roles.includes(requiredRole) || (requiredRole === "ADMIN" && roles.includes("SUPER_ADMIN"));
}

function resolvePortalRole(roles = []) {
  const priority = ["SUPER_ADMIN", "ADMIN", "EMPLOYEE", "SECURITY_GUARD", "VISITOR"];
  return priority.find((role) => roles.includes(role) && ROLE_PORTALS_FROM_PORTAL[role]) || null;
}

function logRoleGuardWarning(message, details) {
  if (typeof console === "undefined" || typeof console.warn !== "function") {
    return;
  }
  console.warn(`[auth] ${message}`, details);
}
