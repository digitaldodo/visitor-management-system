import { API_BASE_URL } from "./config.js";
import { clearSession, getAccessToken, getRefreshToken, setSession } from "./session.js";

const REQUEST_TIMEOUT_MS = 20000;

export async function request(path, options = {}) {
  const { auth = true, retry = true, headers: customHeaders = {}, timeoutMs = REQUEST_TIMEOUT_MS, ...fetchOptions } = options;
  const isFormData = typeof FormData !== "undefined" && fetchOptions.body instanceof FormData;
  const headers = {
    Accept: "application/json",
    ...customHeaders,
  };

  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }

  if (auth) {
    const token = getAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    throw networkError(error);
  } finally {
    window.clearTimeout(timeout);
  }

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
    error.details = payload?.errors || [];
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

function networkError(error) {
  if (error?.name === "AbortError") {
    return new Error("The request timed out. Check the connection and try again.");
  }
  return new Error("The API is unreachable. Check the backend URL and network connection.");
}
