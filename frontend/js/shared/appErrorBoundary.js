import { isRecoverableRuntimeError, recoverRuntime, reportRuntimeError } from "./appRuntime.js";
import { showToast } from "./toast.js";

let initialized = false;

export function initAppErrorBoundary() {
  if (initialized) {
    return;
  }
  initialized = true;

  window.addEventListener("error", (event) => {
    if (isRecoverableResourceError(event)) {
      event.preventDefault();
      reportRuntimeError("resource-load", event.error || event.message, { stage: "global-error" });
      recoverRuntime("resource-load-failure", {
        error: event.error || new Error(String(event.message || "Resource load failed")),
        forceReload: true,
        message: "AccessFlow is recovering from an incomplete update...",
        preserveSession: true,
      });
      return;
    }

    if (isResourceLoadError(event)) {
      return;
    }
    if (isRecoverableRuntimeError(event.error || event.message)) {
      event.preventDefault();
      reportRuntimeError("window-error", event.error || event.message, { stage: "global-error" });
      recoverRuntime("runtime-error", {
        error: event.error || new Error(String(event.message || "Unexpected runtime error")),
        forceReload: true,
        message: "AccessFlow hit an outdated runtime. Recovering workspace...",
        preserveSession: true,
      });
      return;
    }
    event.preventDefault();
    showToast("Something went wrong", readableMessage(event.error || event.message));
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (isIgnorableNetworkFailure(event.reason)) {
      event.preventDefault();
      return;
    }
    if (isRecoverableRuntimeError(event.reason)) {
      event.preventDefault();
      reportRuntimeError("unhandled-rejection", event.reason, { stage: "global-rejection" });
      recoverRuntime("runtime-rejection", {
        error: event.reason,
        forceReload: true,
        message: "AccessFlow hit an outdated runtime. Recovering workspace...",
        preserveSession: true,
      });
      return;
    }
    event.preventDefault();
    showToast("Action could not finish", readableMessage(event.reason));
  });
}

export async function runSafely(label, action, options = {}) {
  const { toastTitle = "Action could not finish", fallback = null, rethrow = false } = options;
  try {
    return await action();
  } catch (error) {
    reportRuntimeError(label, error, { stage: "runSafely" });
    if (isRecoverableRuntimeError(error)) {
      recoverRuntime("action-failure", {
        error,
        forceReload: true,
        message: "AccessFlow is recovering this workspace after an update...",
        preserveSession: true,
      });
      if (rethrow) {
        throw error;
      }
      return fallback;
    }
    if (!isIgnorableNetworkFailure(error)) {
      showToast(toastTitle, readableMessage(error));
    }
    if (rethrow) {
      throw error;
    }
    return fallback;
  }
}

function readableMessage(reason) {
  const message = reason instanceof Error && reason.message
    ? reason.message
    : typeof reason === "string" && reason.trim()
      ? reason.trim()
      : "";

  if (!message) {
    return "Please try again. If the issue continues, refresh the page.";
  }
  if (/Failed to fetch|NetworkError|AbortError|Load failed|timeout|timed out|ERR_/i.test(message)) {
    return "Connection interrupted. Please try again.";
  }
  if (/TypeError|ReferenceError|SyntaxError|undefined|null|stack|JSON|promise|async/i.test(message)) {
    return "AccessFlow could not finish that action. Please try again.";
  }
  return message;
}

function isResourceLoadError(event) {
  const target = event?.target;
  return Boolean(target && target !== window && target !== document);
}

function isRecoverableResourceError(event) {
  const target = event?.target;
  return Boolean(target && target !== window && target !== document && /^(SCRIPT|LINK)$/i.test(target.tagName || ""));
}

function isIgnorableNetworkFailure(reason) {
  const message = reason instanceof Error ? reason.message : String(reason || "");
  return /ERR_BLOCKED_BY_CLIENT|blocked by client|Load failed|Failed to fetch optional resource/i.test(message);
}
