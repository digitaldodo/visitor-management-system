import { showToast } from "./toast.js";

let initialized = false;

export function initAppErrorBoundary() {
  if (initialized) {
    return;
  }
  initialized = true;

  window.addEventListener("error", (event) => {
    event.preventDefault();
    showToast("Something went wrong", readableMessage(event.error || event.message));
  });

  window.addEventListener("unhandledrejection", (event) => {
    event.preventDefault();
    showToast("Action could not finish", readableMessage(event.reason));
  });
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
