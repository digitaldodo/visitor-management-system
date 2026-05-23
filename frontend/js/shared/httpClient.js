import { buildApiUrl } from "./config.js";
import { handleUnauthorizedSession, reportRuntimeError } from "./appRuntime.js";
import { clearSession, getAccessToken, getRefreshToken, normalizeAuthResponse, setSession } from "./session.js";

const REQUEST_TIMEOUT_MS = 30000;
const TRANSIENT_STATUS_CODES = new Set([408, 425, 429, 502, 503, 504]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
let refreshPromise = null;

export async function request(path, options = {}) {
  const {
    auth = true,
    retry = true,
    headers: customHeaders = {},
    timeoutMs = REQUEST_TIMEOUT_MS,
    maxRetries,
    retryDelayMs = 450,
    retryUnsafeTransientStatus = false,
    ...fetchOptions
  } = options;
  const method = String(fetchOptions.method || "GET").toUpperCase();
  const retryBudget = resolveRetryBudget({ maxRetries, method, retry, retryUnsafeTransientStatus });
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

  const url = buildApiUrl(path);
  const requestOptions = {
    ...fetchOptions,
    method,
    headers,
  };
  const response = await fetchWithRetry(url, requestOptions, {
    maxRetries: retryBudget,
    retryDelayMs,
    timeoutMs,
  });

  if (response.status === 401 && auth && retry) {
    const refreshResult = await refreshAccessTokenOnce();
    if (refreshResult.refreshed) {
      return request(path, { ...options, retry: false });
    }
    if (refreshResult.transient) {
      throw refreshResult.error || apiError("Connection interrupted", "Your session is still saved. Check the connection and try again.", {
        code: "AUTH_REFRESH_TRANSIENT",
        retryable: true,
      });
    }
  }

  const payload = await parseResponsePayload(response);

  if (response.status === 401 && auth) {
    handleUnauthorizedSession("unauthorized-response", {
      message: "Your AccessFlow session expired. Returning to sign in...",
    });
  }

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

export function warmUpApi(options = {}) {
  return request("/health/live", {
    auth: false,
    method: "GET",
    maxRetries: 2,
    retryDelayMs: 700,
    timeoutMs: 15000,
    ...options,
  });
}

async function refreshAccessTokenOnce() {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken();
  }

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return { refreshed: false, terminal: true };
  }

  let response;
  try {
    response = await fetchWithRetry(buildApiUrl("/auth/refresh"), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken }),
    }, {
      maxRetries: 0,
      timeoutMs: REQUEST_TIMEOUT_MS,
    });
  } catch (error) {
    reportRuntimeError("refresh-access-token", error, {
      stage: "auth-refresh",
    });
    return { refreshed: false, transient: true, error };
  }

  const payload = await parseResponsePayload(response);
  const session = normalizeAuthResponse(payload, { context: "token refresh" });
  if (!response.ok || !session) {
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      clearSession();
      return { refreshed: false, terminal: true };
    }
    return {
      refreshed: false,
      transient: true,
      error: apiError("Connection interrupted", "AccessFlow could not renew the session right now. Try again in a moment.", {
        status: response.status,
        code: "AUTH_REFRESH_FAILED",
        retryable: true,
        payload,
      }),
    };
  }

  setSession(session);
  return { refreshed: true };
}

async function fetchWithRetry(url, options, retryOptions) {
  const { maxRetries, retryDelayMs = 450, timeoutMs } = retryOptions;
  let attempt = 0;
  let lastError = null;

  while (attempt <= maxRetries) {
    try {
      const response = await fetchWithTimeout(url, options, timeoutMs);
      if (!shouldRetryResponse(response, attempt, maxRetries)) {
        return response;
      }
      lastError = apiError("Connection interrupted", "AccessFlow is still connecting. Trying again...", {
        status: response.status,
        code: "TRANSIENT_RESPONSE",
        retryable: true,
      });
    } catch (error) {
      lastError = networkError(error);
      if (!lastError.retryable || attempt >= maxRetries) {
        throw lastError;
      }
    }

    attempt += 1;
    await delay(backoffDelay(retryDelayMs, attempt));
  }

  throw lastError || apiError("Connection interrupted", "AccessFlow could not reach the API. Try again in a moment.", {
    code: "NETWORK_RETRY_EXHAUSTED",
    retryable: true,
  });
}

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, {
    ...options,
    signal: controller.signal,
  }).finally(() => {
    window.clearTimeout(timeout);
  });
}

function shouldRetryResponse(response, attempt, maxRetries) {
  return attempt < maxRetries && TRANSIENT_STATUS_CODES.has(response.status);
}

function resolveRetryBudget({ maxRetries, method, retry, retryUnsafeTransientStatus }) {
  if (!retry) {
    return 0;
  }
  if (Number.isInteger(maxRetries) && maxRetries >= 0) {
    return maxRetries;
  }
  if (SAFE_METHODS.has(method)) {
    return 2;
  }
  return retryUnsafeTransientStatus ? 1 : 0;
}

function networkError(error) {
  if (error?.name === "AbortError") {
    return apiError("Connection interrupted", "AccessFlow took too long to respond. Try again in a moment.", {
      code: "REQUEST_TIMEOUT",
      retryable: true,
      cause: error,
    });
  }
  if (String(error?.message || "").includes("ERR_BLOCKED_BY_CLIENT")) {
    return apiError("Connection interrupted", "A browser extension blocked the network request.", {
      code: "REQUEST_BLOCKED",
      retryable: false,
      cause: error,
    });
  }
  return apiError("Connection interrupted", "AccessFlow could not reach the API. Check the connection and try again.", {
    code: "NETWORK_UNREACHABLE",
    retryable: true,
    cause: error,
  });
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
  if (isAuthPayload(payload)) {
    return payload;
  }

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

function isAuthPayload(payload) {
  return Boolean(
    payload
      && typeof payload === "object"
      && (payload.accessToken || payload.access_token)
      && (payload.refreshToken || payload.refresh_token),
  );
}

function apiError(message, userMessage, details = {}) {
  const error = new Error(message);
  error.userMessage = userMessage || message;
  Object.assign(error, details);
  return error;
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function backoffDelay(baseDelayMs, attempt) {
  const jitter = Math.floor(Math.random() * 120);
  return Math.min(3000, baseDelayMs * (2 ** Math.max(0, attempt - 1)) + jitter);
}
