export const PRODUCTION_API_BASE_URL = "https://accessflow-api-goww.onrender.com/api/v1";
export const PRODUCTION_FRONTEND_ORIGIN = "https://accessflow-web.onrender.com";

const API_VERSION_PATH = "/api/v1";
const API_CONFIG_STORAGE_KEY = "accessflow.api.config";
const LEGACY_API_HOSTS = new Set(["accessflow-api"].map((serviceName) => `${serviceName}.onrender.com`));

const resolvedApiConfig = resolveApiBaseUrl(readRuntimeApiBaseUrl());

export const API_BASE_URL = resolvedApiConfig.apiBaseUrl;
export const API_CONFIG_DIAGNOSTIC = Object.freeze({ ...resolvedApiConfig });

publishResolvedApiBaseUrl(resolvedApiConfig.apiBaseUrl);
logApiDiagnostics(resolvedApiConfig);

export function validateApiConfiguration() {
  const previousConfig = readStoredApiConfig();
  const previousApiBaseUrl = normalizeApiBaseUrl(previousConfig?.apiBaseUrl || "");
  const previousWasStale = Boolean(previousApiBaseUrl && isLegacyApiBaseUrl(previousApiBaseUrl));
  const apiBaseChanged = Boolean(previousApiBaseUrl && previousApiBaseUrl !== API_BASE_URL);
  const productionOrigin = getCurrentOrigin() === PRODUCTION_FRONTEND_ORIGIN;
  const productionUsingLocalApi = productionOrigin && isLocalApiBaseUrl(API_BASE_URL);

  persistApiConfig({
    apiBaseUrl: API_BASE_URL,
    appVersion: readAppVersion(),
  });

  return Object.freeze({
    ...resolvedApiConfig,
    apiBaseChanged,
    previousApiBaseUrl,
    previousWasStale,
    productionOrigin,
    productionUsingLocalApi,
    needsRecovery: resolvedApiConfig.usedFallback || previousWasStale || productionUsingLocalApi,
  });
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

  if (isLegacyApiBaseUrl(normalizedRuntimeUrl)) {
    return fallbackApiConfig("stale-runtime-config", runtimeValue);
  }

  if (getCurrentOrigin() === PRODUCTION_FRONTEND_ORIGIN && isLocalApiBaseUrl(normalizedRuntimeUrl)) {
    return fallbackApiConfig("local-api-in-production", runtimeValue);
  }

  return {
    apiBaseUrl: normalizedRuntimeUrl,
    source: "runtime",
    reason: "runtime-config-valid",
    runtimeValue,
    usedFallback: false,
    staleRuntimeValue: false,
    malformedRuntimeValue: false,
  };
}

function fallbackApiConfig(reason, runtimeValue) {
  return {
    apiBaseUrl: PRODUCTION_API_BASE_URL,
    source: "production-fallback",
    reason,
    runtimeValue,
    usedFallback: true,
    staleRuntimeValue: isLegacyApiBaseUrl(runtimeValue),
    malformedRuntimeValue: Boolean(runtimeValue) && !normalizeApiBaseUrl(runtimeValue),
  };
}

function readRuntimeApiBaseUrl() {
  if (typeof window === "undefined") {
    return "";
  }
  if (typeof window.API_BASE_URL === "string" && window.API_BASE_URL.trim()) {
    return window.API_BASE_URL;
  }
  if (typeof window.VISITOR_API_BASE_URL === "string" && window.VISITOR_API_BASE_URL.trim()) {
    return window.VISITOR_API_BASE_URL;
  }
  return "";
}

function publishResolvedApiBaseUrl(apiBaseUrl) {
  if (typeof window === "undefined") {
    return;
  }

  window.API_BASE_URL = apiBaseUrl;
  window.VISITOR_API_BASE_URL = apiBaseUrl;
  window.ACCESSFLOW_API_CONFIG = Object.freeze({
    apiBaseUrl,
    productionApiBaseUrl: PRODUCTION_API_BASE_URL,
    productionFrontendOrigin: PRODUCTION_FRONTEND_ORIGIN,
    appVersion: readAppVersion(),
  });
}

function logApiDiagnostics(config) {
  if (typeof console === "undefined" || typeof console.info !== "function") {
    return;
  }

  const payload = {
    apiHost: hostFromUrl(config.apiBaseUrl),
    appVersion: readAppVersion(),
    source: config.source,
    reason: config.reason,
  };

  if (config.usedFallback && typeof console.warn === "function") {
    console.warn("[config] AccessFlow API configuration recovered with production fallback.", payload);
    return;
  }

  console.info("[config] AccessFlow API endpoint ready.", payload);
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

function isLegacyApiBaseUrl(value) {
  const normalized = normalizeApiBaseUrl(value);
  if (!normalized) {
    return false;
  }

  return LEGACY_API_HOSTS.has(hostFromUrl(normalized));
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

function readAppVersion() {
  if (typeof window !== "undefined" && typeof window.APP_VERSION === "string" && window.APP_VERSION.trim()) {
    return window.APP_VERSION.trim();
  }
  return "dev-local";
}

export const ROLE_PORTALS = {
  SUPER_ADMIN: "/admin/analytics",
  ADMIN: "/admin/analytics",
  EMPLOYEE: "/employee",
  SECURITY_GUARD: "/security",
  VISITOR: "/pages/visitor/index.html",
};

export const ROLE_PORTALS_FROM_PORTAL = ROLE_PORTALS;

export const LOGIN_FROM_PORTAL = "/";
