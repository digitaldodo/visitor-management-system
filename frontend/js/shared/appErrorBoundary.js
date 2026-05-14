import { showToast } from "./toast.js";

let initialized = false;

export function initAppErrorBoundary() {
  if (initialized) {
    return;
  }
  initialized = true;

  window.addEventListener("error", (event) => {
    if (isResourceLoadError(event)) {
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
    event.preventDefault();
    showToast("Action could not finish", readableMessage(event.reason));
  });
}

export async function runSafely(label, action, options = {}) {
  const { toastTitle = "Action could not finish", fallback = null, rethrow = false } = options;
  try {
    return await action();
  } catch (error) {
    if (!isIgnorableNetworkFailure(error)) {
      showToast(toastTitle, readableMessage(error));
    }
    if (typeof console !== "undefined" && typeof console.warn === "function") {
      console.warn(`[runtime] ${label} failed`, {
        message: readableMessage(error),
      });
    }
    if (rethrow) {
      throw error;
    }
    return fallback;
  }
}

function readableMessage(reason) {
  if (reason instanceof Error && reason.message) {
    return reason.message;
  }
  if (typeof reason === "string" && reason.trim()) {
    return reason;
  }
  return "Please try again. If the issue continues, refresh the page.";
}

function isResourceLoadError(event) {
  const target = event?.target;
  return Boolean(target && target !== window && target !== document);
}

function isIgnorableNetworkFailure(reason) {
  const message = reason instanceof Error ? reason.message : String(reason || "");
  return /ERR_BLOCKED_BY_CLIENT|blocked by client|Load failed|Failed to fetch optional resource/i.test(message);
}
