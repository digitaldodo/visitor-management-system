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
};

export const APP_VERSION =
  typeof window !== "undefined" && typeof window.APP_VERSION === "string" && window.APP_VERSION.trim()
    ? window.APP_VERSION.trim()
    : "dev-local";

export function bootstrapApplication(label, action, options = {}) {
  const runtime = getRuntime();
  runtime.registerApp({ label, ...options });

  const state = runtime.ensureVersion({ label, ...options }) || {};
  if (state.reloading) {
    return Promise.resolve(null);
  }

  return Promise.resolve()
    .then(() => action())
    .then((value) => {
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

function getRuntime() {
  if (typeof window === "undefined" || !window.AccessFlowRuntime || typeof window.AccessFlowRuntime !== "object") {
    return noopRuntime;
  }
  return window.AccessFlowRuntime;
}
