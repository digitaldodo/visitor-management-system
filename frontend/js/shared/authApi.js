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
    auth: false,
  });
}

export function logout(refreshToken) {
  return request("/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
    auth: false,
  });
}

export function forgotPassword(identifier) {
  return request("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ identifier }),
    auth: false,
  });
}

export function verifyOtp(identifier, otp) {
  return request("/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ identifier, otp }),
    auth: false,
  });
}

export function resetPassword(resetToken, newPassword) {
  return request("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ resetToken, newPassword }),
    auth: false,
  });
}

export function currentUser() {
  return request("/auth/me");
}
