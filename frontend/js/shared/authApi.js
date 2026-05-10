import { request } from "./httpClient.js";

export function login(credentials) {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials),
    auth: false,
  });
}

export function registerAccount(payload) {
  return request("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function logout(refreshToken) {
  return request("/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
    auth: false,
  });
}

export function forgotPassword(email) {
  return request("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
    auth: false,
  });
}

export function currentUser() {
  return request("/auth/me");
}
