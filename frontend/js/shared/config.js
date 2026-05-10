export const API_BASE_URL =
  window.API_BASE_URL ||
  "http://localhost:8080/api/v1";

export const ROLE_PORTALS = {
  SUPER_ADMIN: "./pages/admin/index.html",
  ADMIN: "./pages/admin/index.html",
  EMPLOYEE: "./pages/employee/index.html",
  SECURITY_GUARD: "./pages/security/index.html",
};

export const ROLE_PORTALS_FROM_PORTAL = {
  SUPER_ADMIN: "../admin/index.html",
  ADMIN: "../admin/index.html",
  EMPLOYEE: "../employee/index.html",
  SECURITY_GUARD: "../security/index.html",
};

export const LOGIN_FROM_PORTAL = "../../index.html";
