export const PRODUCTION_API_BASE_URL = "https://accessflow-api-goww.onrender.com/api/v1";
export const PRODUCTION_FRONTEND_ORIGIN = "https://accessflow-web.onrender.com";

const API_VERSION_PATH = "/api/v1";
const API_CONFIG_STORAGE_KEY = "accessflow.api.config";
const PRODUCTION_API_HOST = hostFromUrl(PRODUCTION_API_BASE_URL);

ensureRuntimeEnvironmentSnapshot();
const resolvedApiConfig = resolveApiBaseUrl(readRuntimeApiBaseUrl());

export const API_BASE_URL = resolvedApiConfig.apiBaseUrl;
export const API_CONFIG_DIAGNOSTIC = Object.freeze({ ...resolvedApiConfig });

publishResolvedApiBaseUrl(resolvedApiConfig);
logApiDiagnostics(resolvedApiConfig);

export function validateApiConfiguration() {
  const currentResolvedApiConfig = resolveCurrentApiConfig();
  const currentApiBaseUrl = currentResolvedApiConfig.apiBaseUrl;
  const previousConfig = readStoredApiConfig();
  const previousApiBaseUrl = normalizeApiBaseUrl(previousConfig?.apiBaseUrl || "");
  const previousWasInvalid = Boolean(previousApiBaseUrl && isUnexpectedProductionApiBaseUrl(previousApiBaseUrl));
  const apiBaseChanged = Boolean(previousApiBaseUrl && previousApiBaseUrl !== currentApiBaseUrl);
  const productionOrigin = getCurrentOrigin() === PRODUCTION_FRONTEND_ORIGIN;
  const productionUsingLocalApi = productionOrigin && isLocalApiBaseUrl(currentApiBaseUrl);
  const runtimeValue = normalizeApiBaseUrl(readRuntimeApiBaseUrl());
  const runtimeVersion = readRuntimeAppVersion();
  const appVersion = readAppVersion();

  persistApiConfig({
    apiBaseUrl: currentApiBaseUrl,
    apiHost: hostFromUrl(currentApiBaseUrl),
    appVersion,
    runtimeVersion,
    source: currentResolvedApiConfig.source,
    reason: currentResolvedApiConfig.reason,
  });

  return Object.freeze({
    ...currentResolvedApiConfig,
    apiBaseChanged,
    previousApiBaseUrl,
    previousWasInvalid,
    productionOrigin,
    productionUsingLocalApi,
    runtimeValue,
    runtimeVersion,
    appVersion,
    currentOrigin: getCurrentOrigin(),
    apiHost: hostFromUrl(currentApiBaseUrl),
    runtimeMissing: !runtimeValue,
    needsRecovery: currentResolvedApiConfig.usedFallback || previousWasInvalid || productionUsingLocalApi,
  });
}

export function buildApiUrl(path = "") {
  const apiBaseUrl = getApiBaseUrl();
  const normalizedPath = String(path || "").trim();
  if (!normalizedPath) {
    return apiBaseUrl;
  }

  const url = new URL(`${apiBaseUrl}/`);
  const relativePath = `.${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`;
  return new URL(relativePath, url).toString();
}

export function getApiBaseUrl() {
  return resolveCurrentApiConfig().apiBaseUrl;
}

export function normalizeApiBaseUrl(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return "";
  }

  let url;
  try {
    url = new URL(rawValue);
  } catch {
    return "";
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return "";
  }

  const path = url.pathname.replace(/\/+$/, "");
  if (!path || path === "/") {
    url.pathname = API_VERSION_PATH;
  } else if (path !== API_VERSION_PATH) {
    return "";
  } else {
    url.pathname = API_VERSION_PATH;
  }

  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function resolveApiBaseUrl(runtimeValue) {
  const normalizedRuntimeUrl = normalizeApiBaseUrl(runtimeValue);

  if (!runtimeValue) {
    return fallbackApiConfig("missing-runtime-config", runtimeValue);
  }

  if (!normalizedRuntimeUrl) {
    return fallbackApiConfig("malformed-runtime-config", runtimeValue);
  }

  if (getCurrentOrigin() === PRODUCTION_FRONTEND_ORIGIN && hostFromUrl(normalizedRuntimeUrl) !== PRODUCTION_API_HOST) {
    return fallbackApiConfig(
      isLocalApiBaseUrl(normalizedRuntimeUrl) ? "local-api-in-production" : "unexpected-production-api-host",
      runtimeValue,
    );
  }

  return {
    apiBaseUrl: normalizedRuntimeUrl,
    source: "runtime",
    reason: "runtime-config-valid",
    runtimeValue,
    usedFallback: false,
    unexpectedRuntimeValue: false,
    malformedRuntimeValue: false,
  };
}

function resolveCurrentApiConfig() {
  const config = resolveApiBaseUrl(readRuntimeApiBaseUrl());
  publishResolvedApiBaseUrl(config);
  return config;
}

function fallbackApiConfig(reason, runtimeValue) {
  return {
    apiBaseUrl: PRODUCTION_API_BASE_URL,
    source: "production-fallback",
    reason,
    runtimeValue,
    usedFallback: true,
    unexpectedRuntimeValue: isUnexpectedProductionApiBaseUrl(runtimeValue),
    malformedRuntimeValue: Boolean(runtimeValue) && !normalizeApiBaseUrl(runtimeValue),
  };
}

function readRuntimeApiBaseUrl() {
  if (typeof window === "undefined") {
    return "";
  }

  if (window.ACCESSFLOW_RUNTIME_ENV && typeof window.ACCESSFLOW_RUNTIME_ENV === "object") {
    if (Object.prototype.hasOwnProperty.call(window.ACCESSFLOW_RUNTIME_ENV, "apiBaseUrl")) {
      return typeof window.ACCESSFLOW_RUNTIME_ENV.apiBaseUrl === "string" ? window.ACCESSFLOW_RUNTIME_ENV.apiBaseUrl : "";
    }
  }

  if (window.ACCESSFLOW_ENV && typeof window.ACCESSFLOW_ENV === "object") {
    if (Object.prototype.hasOwnProperty.call(window.ACCESSFLOW_ENV, "apiBaseUrl")) {
      return typeof window.ACCESSFLOW_ENV.apiBaseUrl === "string" ? window.ACCESSFLOW_ENV.apiBaseUrl : "";
    }
    if (typeof window.ACCESSFLOW_ENV.API_BASE_URL === "string" && window.ACCESSFLOW_ENV.API_BASE_URL.trim()) {
      return window.ACCESSFLOW_ENV.API_BASE_URL;
    }
  }

  if (typeof window.API_BASE_URL === "string" && window.API_BASE_URL.trim()) {
    return window.API_BASE_URL;
  }
  if (typeof window.VISITOR_API_BASE_URL === "string" && window.VISITOR_API_BASE_URL.trim()) {
    return window.VISITOR_API_BASE_URL;
  }
  return "";
}

function publishResolvedApiBaseUrl(config) {
  if (typeof window === "undefined") {
    return;
  }

  window.API_BASE_URL = config.apiBaseUrl;
  window.VISITOR_API_BASE_URL = config.apiBaseUrl;
  window.ACCESSFLOW_RESOLVED_API_BASE_URL = config.apiBaseUrl;
  window.ACCESSFLOW_API_CONFIG = Object.freeze({
    apiBaseUrl: config.apiBaseUrl,
    apiHost: hostFromUrl(config.apiBaseUrl),
    currentOrigin: getCurrentOrigin(),
    productionApiBaseUrl: PRODUCTION_API_BASE_URL,
    productionFrontendOrigin: PRODUCTION_FRONTEND_ORIGIN,
    appVersion: readAppVersion(),
    source: config.source,
    reason: config.reason,
    runtimeValue: config.runtimeValue || "",
    usedFallback: Boolean(config.usedFallback),
  });
}

function logApiDiagnostics(config) {
  void config;
}

function readStoredApiConfig() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage?.getItem(API_CONFIG_STORAGE_KEY);
    return rawValue ? JSON.parse(rawValue) : null;
  } catch {
    return null;
  }
}

function persistApiConfig(config) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage?.setItem(API_CONFIG_STORAGE_KEY, JSON.stringify({
      ...config,
      savedAt: new Date().toISOString(),
    }));
  } catch {
    // Storage is optional; API resolution must keep working without it.
  }
}

function isUnexpectedProductionApiBaseUrl(value) {
  if (getCurrentOrigin() !== PRODUCTION_FRONTEND_ORIGIN) {
    return false;
  }

  const normalized = normalizeApiBaseUrl(value);
  if (!normalized) {
    return false;
  }

  return hostFromUrl(normalized) !== PRODUCTION_API_HOST;
}

function isLocalApiBaseUrl(value) {
  return /(?:^|\.)localhost$|^127\.0\.0\.1$|^\[::1\]$/.test(hostFromUrl(value));
}

function hostFromUrl(value) {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return "";
  }
}

function getCurrentOrigin() {
  if (typeof window === "undefined" || !window.location?.origin) {
    return "";
  }
  return window.location.origin;
}

function readRuntimeAppVersion() {
  if (typeof window === "undefined") {
    return "";
  }
  if (window.ACCESSFLOW_RUNTIME_ENV && typeof window.ACCESSFLOW_RUNTIME_ENV === "object" && typeof window.ACCESSFLOW_RUNTIME_ENV.appVersion === "string") {
    return window.ACCESSFLOW_RUNTIME_ENV.appVersion.trim();
  }
  if (window.ACCESSFLOW_ENV && typeof window.ACCESSFLOW_ENV === "object" && typeof window.ACCESSFLOW_ENV.appVersion === "string") {
    return window.ACCESSFLOW_ENV.appVersion.trim();
  }
  return "";
}

function ensureRuntimeEnvironmentSnapshot() {
  if (typeof window === "undefined") {
    return;
  }
  if (window.ACCESSFLOW_RUNTIME_ENV && typeof window.ACCESSFLOW_RUNTIME_ENV === "object") {
    return;
  }

  const runtimeEnv = readWindowRuntimeEnvironment();
  if (!runtimeEnv.apiBaseUrl && !runtimeEnv.visitorApiBaseUrl && !runtimeEnv.appVersion) {
    return;
  }

  window.ACCESSFLOW_RUNTIME_ENV = Object.freeze(runtimeEnv);
}

function readWindowRuntimeEnvironment() {
  const envObject = window.ACCESSFLOW_ENV && typeof window.ACCESSFLOW_ENV === "object" ? window.ACCESSFLOW_ENV : {};
  return {
    apiBaseUrl: firstString(envObject.apiBaseUrl, envObject.API_BASE_URL, window.API_BASE_URL),
    visitorApiBaseUrl: firstString(envObject.visitorApiBaseUrl, envObject.VISITOR_API_BASE_URL, window.VISITOR_API_BASE_URL),
    appVersion: firstString(envObject.appVersion, window.APP_VERSION),
  };
}

function readAppVersion() {
  if (typeof window !== "undefined" && typeof window.APP_VERSION === "string" && window.APP_VERSION.trim()) {
    return window.APP_VERSION.trim();
  }
  return "dev-local";
}

function firstString(...values) {
  const value = values.find((item) => typeof item === "string" && item.trim());
  return value ? value.trim() : "";
}

export const ROLE_PORTALS = {
  SUPER_ADMIN: "/admin/platform-analytics",
  ADMIN: "/admin/dashboard",
  EMPLOYEE: "/employee",
  RECEPTION: "/employee",
  OPERATOR: "/employee",
  MANAGER: "/employee",
  SECURITY_GUARD: "/security",
  VISITOR: "/pages/visitor/index.html",
};

export const ROLE_PORTALS_FROM_PORTAL = ROLE_PORTALS;

export const LOGIN_FROM_PORTAL = "/";
