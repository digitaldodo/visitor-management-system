export const API_BASE_URL =
  window.VISITOR_API_BASE_URL || "http://localhost:8080/api/v1";

export const ROLE_PORTALS = {
  ADMIN: "./pages/admin/index.html",
  EMPLOYEE: "./pages/employee/index.html",
  SECURITY_GUARD: "./pages/security/index.html",
};

export const ROLE_PORTALS_FROM_PORTAL = {
  ADMIN: "../admin/index.html",
  EMPLOYEE: "../employee/index.html",
  SECURITY_GUARD: "../security/index.html",
};

export const LOGIN_FROM_PORTAL = "../../index.html";
