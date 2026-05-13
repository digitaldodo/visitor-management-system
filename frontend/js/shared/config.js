export const API_BASE_URL =
  window.API_BASE_URL ||
  "https://accessflow-api.onrender.com/api/v1";

export const ROLE_PORTALS = {
  SUPER_ADMIN: "/admin/analytics",
  ADMIN: "/admin/analytics",
  EMPLOYEE: "/employee",
  SECURITY_GUARD: "/security",
  VISITOR: "/pages/visitor/index.html",
};

export const ROLE_PORTALS_FROM_PORTAL = ROLE_PORTALS;

export const LOGIN_FROM_PORTAL = "/";
