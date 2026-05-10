import { API_BASE_URL } from "./config.js";
import { clearSession, getAccessToken, getRefreshToken, setSession } from "./session.js";

export async function request(path, options = {}) {
  const { auth = true, retry = true, headers: customHeaders = {}, ...fetchOptions } = options;
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...customHeaders,
  };

  if (auth) {
    const token = getAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...fetchOptions,
    headers,
  });

  if (response.status === 401 && auth && retry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return request(path, { ...options, retry: false });
    }
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.message || `Request failed with ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return false;
  }

  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refreshToken }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.data) {
    clearSession();
    return false;
  }

  setSession(payload.data);
  return true;
}
