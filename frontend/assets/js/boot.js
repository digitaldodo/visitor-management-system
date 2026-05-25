(function bootstrapAccessFlowRuntime() {
  if (window.AccessFlowRuntime) {
    return;
  }

  const VERSION_KEY = "accessflow.runtime.version";
  const RECOVERY_KEY = "accessflow.runtime.recovery";
  const RECOVERY_NOTICE_KEY = "accessflow.runtime.recoveredNotice";
  const LANGUAGE_KEY = "accessflow.web.language.v1";
  const LEGACY_LOCAL_KEYS = ["visitor_management_session"];
  const LEGACY_SESSION_PREFIXES = ["accessflow.", "accessflow.sidebar:", "passwordReset"];
  const SUPPORTED_LANGUAGES = new Set(["en", "hi"]);
  const DEFAULT_LOGIN_PATH = "/";
  const VERSION_POLL_MS = 60000;
  const ENV_SYNC_TIMEOUT_MS = 5000;

  const scriptUrl = document.currentScript?.src || "";
  const envScriptUrl = resolveEnvScriptUrl();
  const manifestUrl = resolveManifestUrl(scriptUrl);
  let currentVersion = readCurrentVersion();
  let ready = false;
  let versionMonitor = 0;
  let recoveryInFlight = false;

  injectRuntimeStyles();

  const runtimeConfigReady = syncRuntimeEnvironment();

  const runtime = {
    version: currentVersion,
    envScriptUrl,
    manifestUrl,
    registerApp,
    ensureVersion,
    waitForRuntimeConfig,
    markReady,
    recover,
    reportError,
    isRecoverableError,
    handleUnauthorizedSession,
    clearAppStorage,
    showNotice,
    hideNotice,
  };

  window.AccessFlowRuntime = runtime;

  attachGlobalRecoveryHandlers();
  primeVersionState();
  startVersionMonitor();

  function registerApp(details = {}) {
    const pageLabel = typeof details.label === "string" && details.label.trim() ? details.label.trim() : document.title || "AccessFlow";
    document.documentElement.dataset.accessflowPage = pageLabel;
  }

  function waitForRuntimeConfig() {
    return runtimeConfigReady;
  }

  function ensureVersion() {
    if (!currentVersion) {
      return { reloading: false };
    }

    const storedVersion = readStoredVersion();
    if (!storedVersion) {
      persistCurrentVersion();
      return { reloading: false };
    }

    if (storedVersion === currentVersion) {
      return { reloading: false };
    }

    recover("deployment-update", {
      message: "AccessFlow has been updated. Refreshing workspace...",
      forceReload: true,
      preserveSession: true,
      redirectToLogin: false,
    });
    return { reloading: true };
  }

  function markReady() {
    ready = true;
    hideNotice();
    showRecoveredNoticeIfNeeded();
  }

  function recover(reason, options = {}) {
    const details = normalizeRecoveryOptions(reason, options);
    if (recoveryInFlight) {
      return true;
    }
    recoveryInFlight = true;
    const recoveryState = incrementRecovery(details.reason);

    reportError(details.reason, details.error, { autoReload: recoveryState.count <= 1, redirectToLogin: details.redirectToLogin });
    clearAppStorage({ preserveSession: details.preserveSession });
    persistCurrentVersion();
    persistRecoveredNotice();

    if (details.redirectToLogin) {
      showNotice(details.message, {
        primaryLabel: "Sign in",
        primaryAction: () => redirectTo(details.loginPath),
      });
      if (!redirectTo(details.loginPath)) {
        recoveryInFlight = false;
      }
      return true;
    }

    if (recoveryState.count <= 1 && details.forceReload && !hasCurrentRecoveryToken()) {
      showNotice(details.message);
      if (!reloadCurrentPage()) {
        recoveryInFlight = false;
      }
      return true;
    }

    recoveryInFlight = false;
    showNotice(details.message, {
      primaryLabel: "Refresh now",
      primaryAction: reloadCurrentPage,
      secondaryLabel: "Sign in",
      secondaryAction: () => redirectTo(details.loginPath),
    });
    return true;
  }

  function handleUnauthorizedSession(reason, options = {}) {
    const message = options.message || "Your AccessFlow session is no longer valid. Returning to sign in...";
    return recover(reason || "unauthorized-session", {
      ...options,
      message,
      redirectToLogin: true,
      preserveSession: false,
      forceReload: false,
    });
  }

  function reportError(source, error, metadata = {}) {
    void source;
    void error;
    void metadata;
  }

  function isRecoverableError(error) {
    const message = readableMessage(error);
    return /Failed to fetch dynamically imported module|Importing a module script failed|module script|Loading module from|ChunkLoadError|dynamically imported module|Cannot use import statement outside a module|Unexpected token 'export'|stale session|bootstrap/i.test(message);
  }

  function clearAppStorage(options = {}) {
    const { preserveSession = false } = options;

    safeStorageOperation(window.localStorage, (storage) => {
      const keys = collectStorageKeys(storage);
      keys.forEach((key) => {
        if (key === VERSION_KEY || key === RECOVERY_KEY) {
          return;
        }
        if (key.startsWith("accessflow.") || LEGACY_LOCAL_KEYS.includes(key)) {
          if (preserveSession && key === "visitor_management_session") {
            return;
          }
          storage.removeItem(key);
        }
      });
    });

    safeStorageOperation(window.sessionStorage, (storage) => {
      const keys = collectStorageKeys(storage);
      keys.forEach((key) => {
        if (key === RECOVERY_KEY) {
          return;
        }
        if (LEGACY_SESSION_PREFIXES.some((prefix) => key.startsWith(prefix))) {
          storage.removeItem(key);
        }
      });
    });
  }

  function showNotice(message, actions = {}) {
    const root = ensureNoticeRoot();
    if (!root) {
      return;
    }

    const { primaryLabel = "", primaryAction = null, secondaryLabel = "", secondaryAction = null } = actions;
    root.innerHTML = "";
    root.classList.add("is-visible");

    const panel = document.createElement("div");
    panel.className = "accessflow-runtime-notice__panel";

    const text = document.createElement("p");
    text.className = "accessflow-runtime-notice__message";
    text.textContent = message;
    panel.append(text);

    if (primaryLabel || secondaryLabel) {
      const actionRow = document.createElement("div");
      actionRow.className = "accessflow-runtime-notice__actions";

      if (primaryLabel) {
        actionRow.append(createActionButton(primaryLabel, primaryAction, false));
      }
      if (secondaryLabel) {
        actionRow.append(createActionButton(secondaryLabel, secondaryAction, true));
      }

      panel.append(actionRow);
    }

    root.append(panel);
  }

  function hideNotice() {
    const root = document.getElementById("accessflow-runtime-notice");
    if (!root) {
      return;
    }
    root.classList.remove("is-visible");
    root.innerHTML = "";
  }

  function primeVersionState() {
    recoverCorruptPersistentState();

    const storedVersion = readStoredVersion();
    if (storedVersion && storedVersion !== currentVersion) {
      recover("deployment-update", {
        message: "AccessFlow has been updated. Refreshing workspace...",
        forceReload: true,
        preserveSession: true,
      });
      return;
    }

    persistCurrentVersion();
  }

  function recoverCorruptPersistentState() {
    const repaired = [];

    safeStorageOperation(window.localStorage, (storage) => {
      collectStorageKeys(storage).forEach((key) => {
        if (key === LANGUAGE_KEY && !SUPPORTED_LANGUAGES.has(storage.getItem(key))) {
          storage.removeItem(key);
          repaired.push(key);
          return;
        }
        if (key === VERSION_KEY && !isValidJsonObject(storage.getItem(key))) {
          storage.removeItem(key);
          repaired.push(key);
          return;
        }
        if (key === "accessflow.api.config" && !isValidJsonObject(storage.getItem(key))) {
          storage.removeItem(key);
          repaired.push(key);
        }
      });
    });

    safeStorageOperation(window.sessionStorage, (storage) => {
      collectStorageKeys(storage).forEach((key) => {
        const value = storage.getItem(key);
        if (key === RECOVERY_KEY && !isValidJsonObject(value)) {
          storage.removeItem(key);
          repaired.push(key);
          return;
        }
        if (key.startsWith("accessflow.sidebar:") && !["collapsed", "expanded"].includes(value)) {
          storage.removeItem(key);
          repaired.push(key);
          return;
        }
        if (key.startsWith("accessflow.security.module:") && !["collapsed", "expanded"].includes(value)) {
          storage.removeItem(key);
          repaired.push(key);
          return;
        }
        if (key === "accessflow.security.activeSection" && !/^[a-z0-9-]{1,64}$/.test(String(value || ""))) {
          storage.removeItem(key);
          repaired.push(key);
        }
      });
    });

    if (repaired.length) {
      reportError("persistent-state-recovery", new Error("AccessFlow repaired corrupted persisted UI state."), {
        keys: repaired,
      });
      persistRecoveredNotice();
    }
  }

  function startVersionMonitor() {
    if (!manifestUrl || versionMonitor) {
      return;
    }

    versionMonitor = window.setInterval(() => {
      if (document.visibilityState === "hidden") {
        return;
      }
      void checkForDeploymentUpdate();
    }, VERSION_POLL_MS);

    window.addEventListener("focus", () => {
      void checkForDeploymentUpdate();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        void checkForDeploymentUpdate();
      }
    });
  }

  async function checkForDeploymentUpdate() {
    if (!manifestUrl || !currentVersion) {
      return;
    }

    try {
      const response = await fetch(`${manifestUrl}?t=${Date.now()}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) {
        return;
      }

      const manifest = await response.json().catch(() => null);
      const deployedVersion = typeof manifest?.version === "string" ? manifest.version.trim() : "";
      if (deployedVersion && deployedVersion !== currentVersion) {
        recover("deployment-update", {
          message: "AccessFlow has been updated. Refreshing workspace...",
          forceReload: true,
          preserveSession: true,
        });
      }
    } catch {
      // Ignore manifest fetch issues. The running app remains usable.
    }
  }

  function attachGlobalRecoveryHandlers() {
    window.addEventListener("error", (event) => {
      const target = event?.target;
      if (isRecoverableResourceError(target)) {
        event.preventDefault();
        recover("resource-load-failed", {
          error: new Error("AccessFlow could not load a required frontend asset."),
          message: "AccessFlow is recovering from an incomplete update...",
          forceReload: true,
          preserveSession: true,
        });
        return;
      }

      if (isRecoverableError(event?.error || event?.message)) {
        event.preventDefault();
        recover("runtime-error", {
          error: event?.error || new Error(String(event?.message || "Unexpected runtime error")),
          message: "AccessFlow hit an outdated runtime. Recovering workspace...",
          forceReload: true,
          preserveSession: true,
        });
      }
    }, true);

    window.addEventListener("unhandledrejection", (event) => {
      if (!isRecoverableError(event?.reason)) {
        return;
      }

      event.preventDefault();
      recover("unhandled-rejection", {
        error: event.reason,
        message: "AccessFlow hit an outdated runtime. Recovering workspace...",
        forceReload: true,
        preserveSession: true,
      });
    });

    window.addEventListener("pageshow", (event) => {
      if (event.persisted) {
        void checkForDeploymentUpdate();
      }
    });
  }

  function ensureNoticeRoot() {
    let root = document.getElementById("accessflow-runtime-notice");
    if (root) {
      return root;
    }

    root = document.createElement("div");
    root.id = "accessflow-runtime-notice";
    root.className = "accessflow-runtime-notice";
    document.body.append(root);
    return root;
  }

  function createActionButton(label, action, secondary) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = secondary ? "accessflow-runtime-notice__button is-secondary" : "accessflow-runtime-notice__button";
    button.textContent = label;
    button.addEventListener("click", () => {
      if (typeof action === "function") {
        action();
      }
    });
    return button;
  }

  function persistCurrentVersion() {
    safeStorageOperation(window.localStorage, (storage) => {
      storage.setItem(VERSION_KEY, JSON.stringify({
        version: currentVersion,
        seenAt: new Date().toISOString(),
      }));
    });
  }

  function readStoredVersion() {
    return safeStorageOperation(window.localStorage, (storage) => {
      const raw = storage.getItem(VERSION_KEY);
      if (!raw) {
        return "";
      }
      const parsed = JSON.parse(raw);
      return typeof parsed?.version === "string" ? parsed.version.trim() : "";
    }, "");
  }

  function incrementRecovery(reason) {
    const now = Date.now();
    const previous = safeStorageOperation(window.sessionStorage, (storage) => {
      const raw = storage.getItem(RECOVERY_KEY);
      return raw ? JSON.parse(raw) : null;
    }, null);

    const count = previous?.version === currentVersion && now - Number(previous?.at || 0) < 5 * 60 * 1000
      ? Number(previous.count || 0) + 1
      : 1;

    const nextState = {
      version: currentVersion,
      reason,
      count,
      at: now,
    };

    safeStorageOperation(window.sessionStorage, (storage) => {
      storage.setItem(RECOVERY_KEY, JSON.stringify(nextState));
    });

    return nextState;
  }

  function clearRecoveryState() {
    safeStorageOperation(window.sessionStorage, (storage) => {
      storage.removeItem(RECOVERY_KEY);
    });
  }

  function persistRecoveredNotice() {
    safeStorageOperation(window.sessionStorage, (storage) => {
      storage.setItem(RECOVERY_NOTICE_KEY, "1");
    });
  }

  function showRecoveredNoticeIfNeeded() {
    const shouldShow = safeStorageOperation(window.sessionStorage, (storage) => {
      const value = storage.getItem(RECOVERY_NOTICE_KEY);
      storage.removeItem(RECOVERY_NOTICE_KEY);
      return value === "1";
    }, false);

    if (!shouldShow) {
      return;
    }

    showNotice("Workspace refreshed successfully.");
    window.setTimeout(() => {
      hideNotice();
    }, 3200);
  }

  function normalizeRecoveryOptions(reason, options) {
    return {
      reason,
      error: options.error || null,
      message: options.message || "AccessFlow is recovering this workspace...",
      preserveSession: Boolean(options.preserveSession),
      forceReload: options.forceReload !== false,
      redirectToLogin: Boolean(options.redirectToLogin),
      loginPath: options.loginPath || DEFAULT_LOGIN_PATH,
    };
  }

  function resolveManifestUrl(source) {
    if (!source) {
      return "";
    }

    try {
      return new URL("../app-manifest.json", source).toString();
    } catch {
      return "";
    }
  }

  function resolveEnvScriptUrl() {
    const envScript = document.querySelector('script[src*="assets/js/env.js"]');
    return envScript?.src || "";
  }

  async function syncRuntimeEnvironment() {
    if (!envScriptUrl || typeof fetch !== "function") {
      return { synced: false, reason: "env-script-unavailable" };
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), ENV_SYNC_TIMEOUT_MS);

    try {
      const response = await fetch(withCacheBust(envScriptUrl), {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (!response.ok) {
        return { synced: false, reason: `env-fetch-${response.status}` };
      }

      const source = await response.text();
      const parsed = parseRuntimeEnvironment(source);
      if (!parsed) {
        return { synced: false, reason: "env-parse-failed" };
      }

      applyRuntimeEnvironment(parsed);
      currentVersion = readCurrentVersion();
      runtime.version = currentVersion;
      return {
        synced: true,
        reason: "env-refresh-applied",
        apiBaseUrl: typeof parsed.apiBaseUrl === "string" ? parsed.apiBaseUrl : "",
        appVersion: typeof parsed.appVersion === "string" ? parsed.appVersion : currentVersion,
      };
    } catch {
      return { synced: false, reason: "env-fetch-failed" };
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function withCacheBust(url) {
    try {
      const nextUrl = new URL(url, window.location.href);
      nextUrl.searchParams.set("t", String(Date.now()));
      return nextUrl.toString();
    } catch {
      return url;
    }
  }

  function parseRuntimeEnvironment(source) {
    const environmentPayload = parseEnvironmentObject(source);
    if (environmentPayload) {
      return environmentPayload;
    }

    const apiBaseUrl = readAssignedString(source, "API_BASE_URL");
    const visitorApiBaseUrl = readAssignedString(source, "VISITOR_API_BASE_URL");
    const appVersion = readAssignedString(source, "APP_VERSION");
    const appAssetToken = readAssignedString(source, "APP_ASSET_TOKEN");
    const appBuildTimestamp = readAssignedString(source, "APP_BUILD_TIMESTAMP");
    const appBuildRevision = readAssignedString(source, "APP_BUILD_REVISION");

    if (!apiBaseUrl && !visitorApiBaseUrl && !appVersion) {
      return null;
    }

    return {
      apiBaseUrl: apiBaseUrl || visitorApiBaseUrl || "",
      visitorApiBaseUrl: visitorApiBaseUrl || apiBaseUrl || "",
      appVersion: appVersion || "",
      appAssetToken: appAssetToken || "",
      appBuildTimestamp: appBuildTimestamp || null,
      appBuildRevision: appBuildRevision || null,
    };
  }

  function parseEnvironmentObject(source) {
    const match = source.match(/window\.ACCESSFLOW_ENV\s*=\s*Object\.freeze\((\{[\s\S]*?\})\)\s*;/);
    if (!match?.[1]) {
      return null;
    }

    try {
      return JSON.parse(match[1]);
    } catch {
      return null;
    }
  }

  function readAssignedString(source, key) {
    const expression = new RegExp(`window\\.${key}\\s*=\\s*(?:window\\.[A-Z_]+\\s*\\|\\|\\s*)?("([^"\\\\]|\\\\.)*"|'([^'\\\\]|\\\\.)*'|null)\\s*;`);
    const match = source.match(expression);
    if (!match?.[1] || match[1] === "null") {
      return "";
    }

    try {
      return JSON.parse(match[1].replace(/^'/, "\"").replace(/'$/, "\""));
    } catch {
      return "";
    }
  }

  function applyRuntimeEnvironment(env) {
    const nextEnv = {
      apiBaseUrl: typeof env.apiBaseUrl === "string" ? env.apiBaseUrl : "",
      visitorApiBaseUrl: typeof env.visitorApiBaseUrl === "string" ? env.visitorApiBaseUrl : "",
      appVersion: typeof env.appVersion === "string" ? env.appVersion : "",
      appAssetToken: typeof env.appAssetToken === "string" ? env.appAssetToken : "",
      appBuildTimestamp: typeof env.appBuildTimestamp === "string" ? env.appBuildTimestamp : null,
      appBuildRevision: typeof env.appBuildRevision === "string" ? env.appBuildRevision : null,
    };

    window.ACCESSFLOW_ENV = Object.freeze(nextEnv);
    window.ACCESSFLOW_RUNTIME_ENV = Object.freeze(nextEnv);

    if (nextEnv.apiBaseUrl) {
      window.API_BASE_URL = nextEnv.apiBaseUrl;
      window.VISITOR_API_BASE_URL = nextEnv.visitorApiBaseUrl || nextEnv.apiBaseUrl;
    }
    if (nextEnv.appVersion) {
      window.APP_VERSION = nextEnv.appVersion;
    }
    if (nextEnv.appAssetToken) {
      window.APP_ASSET_TOKEN = nextEnv.appAssetToken;
    }
    if (nextEnv.appBuildTimestamp) {
      window.APP_BUILD_TIMESTAMP = nextEnv.appBuildTimestamp;
    }
    if (nextEnv.appBuildRevision || nextEnv.appBuildRevision === null) {
      window.APP_BUILD_REVISION = nextEnv.appBuildRevision;
    }
  }

  function readCurrentVersion() {
    if (typeof window.APP_VERSION === "string" && window.APP_VERSION.trim()) {
      return window.APP_VERSION.trim();
    }
    return "dev-local";
  }

  function reloadCurrentPage() {
    const url = new URL(window.location.href);
    const token = currentVersion || "refresh";
    if (url.searchParams.get("afv") === token) {
      return false;
    }
    url.searchParams.set("afv", token);
    return replaceLocationOnce(url.toString());
  }

  function redirectTo(target) {
    return replaceLocationOnce(target || DEFAULT_LOGIN_PATH);
  }

  function replaceLocationOnce(target) {
    const nextUrl = resolveLocationUrl(target);
    if (!nextUrl || stripRuntimeNavigationToken(nextUrl) === stripRuntimeNavigationToken(window.location.href)) {
      return false;
    }
    window.location.replace(nextUrl);
    return true;
  }

  function hasCurrentRecoveryToken() {
    try {
      return new URL(window.location.href).searchParams.get("afv") === (currentVersion || "refresh");
    } catch {
      return false;
    }
  }

  function resolveLocationUrl(target) {
    try {
      return new URL(target, window.location.href).toString();
    } catch {
      return "";
    }
  }

  function stripRuntimeNavigationToken(value) {
    try {
      const url = new URL(value, window.location.href);
      url.searchParams.delete("afv");
      return url.toString();
    } catch {
      return String(value || "");
    }
  }

  function readableMessage(error) {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    if (typeof error === "string" && error.trim()) {
      return error.trim();
    }
    return "Unexpected runtime state detected.";
  }

  function isRecoverableResourceError(target) {
    return Boolean(target && target !== window && target !== document && /^(SCRIPT|LINK)$/i.test(target.tagName || ""));
  }

  function collectStorageKeys(storage) {
    const keys = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key) {
        keys.push(key);
      }
    }
    return keys;
  }

  function isValidJsonObject(value) {
    if (!value) {
      return true;
    }
    try {
      const parsed = JSON.parse(value);
      return Boolean(parsed && typeof parsed === "object");
    } catch {
      return false;
    }
  }

  function safeStorageOperation(storage, action, fallback = undefined) {
    try {
      return action(storage);
    } catch {
      return fallback;
    }
  }

  function injectRuntimeStyles() {
    if (document.getElementById("accessflow-runtime-notice-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "accessflow-runtime-notice-style";
    style.textContent = `
      .accessflow-runtime-notice {
        position: fixed;
        inset: 0 auto auto 0;
        width: 100%;
        display: none;
        justify-content: center;
        pointer-events: none;
        z-index: 9999;
        padding: 16px;
        box-sizing: border-box;
      }

      .accessflow-runtime-notice.is-visible {
        display: flex;
      }

      .accessflow-runtime-notice__panel {
        max-width: 560px;
        width: min(100%, 560px);
        background: rgba(11, 19, 32, 0.96);
        color: #f7f9fc;
        border: 1px solid rgba(148, 163, 184, 0.24);
        border-radius: 8px;
        box-shadow: 0 16px 40px rgba(15, 23, 42, 0.28);
        padding: 14px 16px;
        pointer-events: auto;
      }

      .accessflow-runtime-notice__message {
        margin: 0;
        font: 500 0.95rem/1.5 system-ui, sans-serif;
      }

      .accessflow-runtime-notice__actions {
        display: flex;
        gap: 8px;
        margin-top: 12px;
        flex-wrap: wrap;
      }

      .accessflow-runtime-notice__button {
        appearance: none;
        border: 0;
        border-radius: 6px;
        background: #f7fafc;
        color: #0f172a;
        cursor: pointer;
        font: 600 0.875rem/1 system-ui, sans-serif;
        padding: 10px 14px;
      }

      .accessflow-runtime-notice__button.is-secondary {
        background: transparent;
        color: #f7fafc;
        border: 1px solid rgba(226, 232, 240, 0.28);
      }
    `;
    document.head.append(style);
  }
}());
