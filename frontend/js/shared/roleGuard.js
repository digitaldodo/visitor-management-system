import { handleUnauthorizedSession } from "./appRuntime.js";
import { LOGIN_FROM_PORTAL, ROLE_PORTALS, ROLE_PORTALS_FROM_PORTAL } from "./config.js";
import { clearSession, getPrimaryRole, getSession, getTokenRoles, isAuthenticated } from "./session.js";

export function redirectToPortal(role, fromPortal = false) {
  const target = fromPortal ? ROLE_PORTALS_FROM_PORTAL[role] : ROLE_PORTALS[role];
  navigateOnce(target || (fromPortal ? LOGIN_FROM_PORTAL : "./index.html"));
}

export function redirectToLogin() {
  navigateOnce(LOGIN_FROM_PORTAL);
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
    handleUnauthorizedSession("missing-session", {
      message: "Your AccessFlow session is no longer valid. Returning to sign in...",
    });
    return null;
  }

  const sessionRoles = Array.isArray(session.roles) ? session.roles : [];
  const tokenRoles = getTokenRoles(session?.accessToken);
  const hasRequiredSessionRole = hasEffectiveRole(sessionRoles, requiredRole);
  const tokenHasRoles = tokenRoles.length > 0;
  const hasRequiredTokenRole = tokenHasRoles ? hasEffectiveRole(tokenRoles, requiredRole) : true;

  if (hasRequiredSessionRole && hasRequiredTokenRole) {
    return session;
  }

  if (hasRequiredSessionRole && tokenHasRoles && !rolesOverlap(sessionRoles, tokenRoles)) {
    logRoleGuardWarning("Stored session role no longer matches token claims; clearing session.", {
      requiredRole,
      sessionRoles,
      tokenRoles,
    });
    clearSession();
    handleUnauthorizedSession("stale-session", {
      message: "Your AccessFlow session is out of date. Returning to sign in...",
    });
    return null;
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
  handleUnauthorizedSession("invalid-session", {
    message: "Your AccessFlow session is no longer valid. Returning to sign in...",
  });
  return null;
}

function hasEffectiveRole(roles, requiredRole) {
  if (requiredRole === "EMPLOYEE" && roles.some((role) => ["RECEPTION", "OPERATOR", "MANAGER"].includes(role))) {
    return true;
  }
  return roles.includes(requiredRole) || (requiredRole === "ADMIN" && roles.includes("SUPER_ADMIN"));
}

function resolvePortalRole(roles = []) {
  const priority = ["SUPER_ADMIN", "ADMIN", "MANAGER", "OPERATOR", "RECEPTION", "EMPLOYEE", "SECURITY_GUARD", "VISITOR"];
  return priority.find((role) => roles.includes(role) && ROLE_PORTALS_FROM_PORTAL[role]) || null;
}

function rolesOverlap(left = [], right = []) {
  return left.some((role) => right.includes(role));
}

function logRoleGuardWarning(message, details) {
  void message;
  void details;
}

function navigateOnce(target) {
  const nextUrl = resolveUrl(target);
  if (!nextUrl || sameDocumentLocation(nextUrl)) {
    return false;
  }

  window.location.assign(nextUrl);
  return true;
}

function sameDocumentLocation(target) {
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

function resolveUrl(target) {
  try {
    return new URL(target, window.location.href).toString();
  } catch {
    return "";
  }
}
