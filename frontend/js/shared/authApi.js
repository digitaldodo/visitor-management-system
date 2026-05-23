import { buildApiUrl } from "./config.js";
import { request, warmUpApi } from "./httpClient.js";
import { normalizeAuthResponse } from "./session.js";

export async function login(credentials) {
  await warmUpApi();
  const response = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials),
    auth: false,
    timeoutMs: 45000,
    maxRetries: 0,
  });
  return normalizeAuthResponse(response?.raw || response, { context: "login response" });
}

export function registerAccount(payload) {
  return request("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
    auth: false,
  });
}

export function logout(refreshToken, options = {}) {
  const { keepalive = false } = options;
  if (keepalive && typeof fetch === "function") {
    return fetch(buildApiUrl("/auth/logout"), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken }),
      keepalive: true,
    }).catch(() => null);
  }

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

export function resendVerificationEmail(identifier) {
  return request("/auth/resend-verification", {
    method: "POST",
    body: JSON.stringify({ identifier }),
    auth: false,
  });
}

export function verifyEmailToken(token) {
  const query = new URLSearchParams({ token });
  return request(`/auth/verify-email?${query.toString()}`, {
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
