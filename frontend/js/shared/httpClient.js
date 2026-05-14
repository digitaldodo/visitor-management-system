import { API_BASE_URL } from "./config.js";
import { clearSession, getAccessToken, getRefreshToken, normalizeAuthResponse, setSession } from "./session.js";

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

  const payload = await parseResponsePayload(response);

  if (!response.ok) {
    const message = payload?.message || payload?.error || `Request failed with ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.details = payload?.errors || [];
    error.payload = payload;
    throw error;
  }

  return normalizeApiResponse(payload, response);
}

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return false;
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken }),
      signal: controller.signal,
    });
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }

  const payload = await parseResponsePayload(response);
  const session = normalizeAuthResponse(payload, { context: "token refresh" });
  if (!response.ok || !session) {
    if (typeof console !== "undefined" && typeof console.warn === "function") {
      console.warn("[auth] Token refresh failed; clearing stored session.", {
        status: response.status,
        payloadKeys: payload && typeof payload === "object" ? Object.keys(payload) : [],
      });
    }
    clearSession();
    return false;
  }

  setSession(session);
  return true;
}

function networkError(error) {
  if (error?.name === "AbortError") {
    return new Error("The request timed out. Check the connection and try again.");
  }
  if (String(error?.message || "").includes("ERR_BLOCKED_BY_CLIENT")) {
    return new Error("A browser extension blocked an optional network request.");
  }
  return new Error("The API is unreachable. Check the backend URL and network connection.");
}

async function parseResponsePayload(response) {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json().catch(() => null);
  }

  const text = await response.text().catch(() => "");
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return {
      message: text,
    };
  }
}

function normalizeApiResponse(payload, response) {
  if (payload && typeof payload === "object" && ("data" in payload || "success" in payload || "message" in payload)) {
    return {
      success: payload.success !== false,
      message: payload.message || "",
      data: payload.data ?? null,
      timestamp: payload.timestamp || null,
      status: response.status,
      raw: payload,
    };
  }

  return {
    success: true,
    message: payload == null ? "The server returned an empty response." : "",
    data: payload ?? null,
    timestamp: null,
    status: response.status,
    raw: payload,
  };
}
