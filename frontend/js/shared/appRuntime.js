import { validateApiConfiguration } from "./config.js";

const BOOTSTRAP_ABORT = Symbol("accessflow.bootstrap.abort");

const noopRuntime = {
  clearAppStorage() {},
  ensureVersion() {
    return { reloading: false };
  },
  handleUnauthorizedSession() {
    return false;
  },
  hideNotice() {},
  isRecoverableError() {
    return false;
  },
  markReady() {},
  recover() {
    return false;
  },
  registerApp() {},
  reportError() {},
  showNotice() {},
  waitForRuntimeConfig() {
    return Promise.resolve({ synced: false, reason: "runtime-unavailable" });
  },
};

export const APP_VERSION =
  typeof window !== "undefined" && typeof window.APP_VERSION === "string" && window.APP_VERSION.trim()
    ? window.APP_VERSION.trim()
    : "dev-local";

export function bootstrapApplication(label, action, options = {}) {
  const runtime = getRuntime();
  runtime.registerApp({ label, ...options });

  return Promise.resolve()
    .then(() => runtime.waitForRuntimeConfig?.())
    .then(() => {
      const state = runtime.ensureVersion({ label, ...options }) || {};
      if (state.reloading) {
        return BOOTSTRAP_ABORT;
      }

      const apiState = validateApiConfiguration();
      if (apiState.needsRecovery) {
        reportApiConfigurationRecovery(runtime, label, apiState);
      }

      return action();
    })
    .then((value) => {
      if (value === BOOTSTRAP_ABORT) {
        return null;
      }
      runtime.markReady({ label });
      return value;
    })
    .catch((error) => {
      runtime.reportError(label, error, { stage: "bootstrap" });
      runtime.recover("bootstrap-failure", {
        error,
        forceReload: true,
        message: options.failureMessage || "AccessFlow had trouble restoring this workspace. Refreshing...",
        preserveSession: true,
        redirectToLogin: Boolean(options.redirectToLogin),
      });
      return null;
    });
}

export function clearRuntimeState(options) {
  return getRuntime().clearAppStorage(options);
}

export function handleUnauthorizedSession(reason, options) {
  return getRuntime().handleUnauthorizedSession(reason, options);
}

export function isRecoverableRuntimeError(error) {
  return getRuntime().isRecoverableError(error);
}

export function markRuntimeReady(details) {
  return getRuntime().markReady(details);
}

export function recoverRuntime(reason, options) {
  return getRuntime().recover(reason, options);
}

export function reportRuntimeError(source, error, metadata) {
  return getRuntime().reportError(source, error, metadata);
}

function reportApiConfigurationRecovery(runtime, label, apiState) {
  runtime.reportError("api-config", new Error("AccessFlow API configuration required runtime recovery."), {
    apiHost: hostFromApiBaseUrl(apiState.apiBaseUrl),
    label,
    reason: apiState.reason,
    source: apiState.source,
  });

  if (apiState.usedFallback || apiState.productionUsingLocalApi || apiState.previousWasInvalid) {
    runtime.showNotice("AccessFlow recovered the API endpoint for this deployment.", {
      primaryLabel: "Refresh now",
      primaryAction: () => {
        const url = new URL(window.location.href);
        url.searchParams.set("afv", APP_VERSION || "refresh");
        window.location.replace(url.toString());
      },
    });
  }
}

function hostFromApiBaseUrl(apiBaseUrl) {
  try {
    return new URL(apiBaseUrl).host;
  } catch {
    return "";
  }
}

function getRuntime() {
  if (typeof window === "undefined" || !window.AccessFlowRuntime || typeof window.AccessFlowRuntime !== "object") {
    return noopRuntime;
  }
  return window.AccessFlowRuntime;
}
