import { resendVerificationEmail, verifyEmailToken } from "./shared/authApi.js";
import { initAppErrorBoundary } from "./shared/appErrorBoundary.js";
import { bootstrapApplication } from "./shared/appRuntime.js";
import { $ } from "./shared/dom.js";
import { showToast } from "./shared/toast.js";
import { attachFieldValidator, isUsernameOrEmail, validateLoginIdentifier } from "./shared/validation.js";

const VERIFICATION_IDENTIFIER_KEY = "visitorVerificationIdentifier";
const VERIFICATION_EMAIL_KEY = "visitorVerificationEmail";
const VERIFICATION_EXPIRES_KEY = "visitorVerificationExpiresAt";
const VERIFICATION_SENT_KEY = "visitorVerificationSentAt";
const VERIFICATION_RESEND_READY_KEY = "visitorVerificationResendReadyAt";

document.addEventListener("DOMContentLoaded", () => {
  void bootstrapApplication("email-verification", async () => {
    initAppErrorBoundary();
    initVerificationPage();
  }, {
    failureMessage: "AccessFlow had trouble loading the email verification screen. Refreshing...",
  });
});

function initVerificationPage() {
  const form = $("#verification-resend-form");
  if (!form) {
    return;
  }

  const identifierInput = form.querySelector("input[name='identifier']");
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") || "";
  const identifierFromUrl = params.get("identifier") || "";
  const storedIdentifier = sessionStorage.getItem(VERIFICATION_IDENTIFIER_KEY) || "";
  identifierInput.value = identifierFromUrl || storedIdentifier;
  const runIdentifierValidation = attachFieldValidator(identifierInput, validateLoginIdentifier);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const identifier = identifierInput.value.trim();
    const error = runIdentifierValidation();
    if (error || !isUsernameOrEmail(identifier)) {
      showToast("Check the form", error || "Enter a valid email or username.");
      return;
    }

    await withLoading(form, async () => {
      const response = await resendVerificationEmail(identifier);
      persistVerificationState(identifier, response?.data || {});
      renderPendingState();
      showToast("Email sent", response?.message || "If the visitor account is waiting for verification, a new email has been sent.");
    });
  });

  startResendTimer();
  if (token) {
    void processVerificationToken(token, form);
    return;
  }

  renderPendingState();
}

async function processVerificationToken(token, form) {
  renderState("processing", "Verifying your email", "We’re activating your AccessFlow visitor account now.");
  replaceHistoryWithoutToken();

  try {
    const response = await verifyEmailToken(token);
    const payload = response?.data || {};
    clearVerificationState();
    renderState(
      "success",
      "Your email is verified",
      "Your AccessFlow visitor account is active now. You can sign in and request visits.",
      [
        payload.email ? `Verified account: ${payload.email}` : "",
        payload.verifiedAt ? `Verified at: ${formatDateTime(payload.verifiedAt)}` : "",
      ],
    );
    showToast("Email verified", response?.message || "Your AccessFlow visitor account is active.");
  } catch (error) {
    renderState(
      "error",
      "This verification link cannot be used",
      error.message || "The link is invalid or expired. Request a fresh verification email below.",
      ["If your account is still unverified, resend the email from this page or from the visitor sign-in form."],
    );
    showToast("Verification failed", error.message || "The link is invalid or expired.");
    form.querySelector("input[name='identifier']")?.focus();
  }
}

function renderPendingState() {
  const email = sessionStorage.getItem(VERIFICATION_EMAIL_KEY) || "";
  const sentAt = sessionStorage.getItem(VERIFICATION_SENT_KEY);
  const expiresAt = sessionStorage.getItem(VERIFICATION_EXPIRES_KEY);
  renderState(
    "processing",
    "Verify your email to activate your AccessFlow account",
    "Check your inbox for the verification link. Your visitor account stays inactive until you open that link.",
    [
      email ? `Verification email: ${email}` : "",
      sentAt ? `Last sent: ${formatDateTime(sentAt)}` : "",
      expiresAt ? `Link expires: ${formatDateTime(expiresAt)}` : "",
    ],
  );
  renderResendMeta();
}

function renderState(type, title, message, details = []) {
  const state = $("#verification-state");
  if (!state) {
    return;
  }

  const badge = {
    processing: "Pending",
    success: "Verified",
    error: "Expired",
  }[type] || "Pending";

  state.className = `verification-state verification-state--${type}`;
  state.innerHTML = `
    <div class="verification-status">
      <span class="verification-status__badge">${escapeHtml(badge)}</span>
      <strong>${escapeHtml(title)}</strong>
    </div>
    <p>${escapeHtml(message)}</p>
    <div class="verification-meta">
      ${details.filter(Boolean).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
    </div>
  `;
}

function renderResendMeta() {
  const meta = $("#verification-meta");
  if (!meta) {
    return;
  }
  const expiresAt = sessionStorage.getItem(VERIFICATION_EXPIRES_KEY);
  const resendReadyAt = sessionStorage.getItem(VERIFICATION_RESEND_READY_KEY);
  const pieces = [];
  if (expiresAt) {
    pieces.push(`Current link expires: ${formatDateTime(expiresAt)}`);
  }
  if (resendReadyAt) {
    const resendLeft = Math.max(0, new Date(resendReadyAt).getTime() - Date.now());
    pieces.push(resendLeft > 0 ? `You can resend in ${Math.ceil(resendLeft / 1000)}s.` : "You can resend a fresh verification email now.");
  }
  meta.innerHTML = pieces.map((item) => `<span>${escapeHtml(item)}</span>`).join("");
}

function startResendTimer() {
  window.clearInterval(window.visitorVerificationTimer);
  window.visitorVerificationTimer = window.setInterval(() => {
    updateResendButtonState();
    renderResendMeta();
  }, 500);
  updateResendButtonState();
}

function updateResendButtonState() {
  const button = $("#verification-resend-form .auth-submit");
  if (!button) {
    return;
  }
  const resendReadyAt = sessionStorage.getItem(VERIFICATION_RESEND_READY_KEY);
  const resendLeft = Math.max(0, new Date(resendReadyAt || 0).getTime() - Date.now());
  button.disabled = resendLeft > 0;
  button.textContent = resendLeft > 0 ? `Resend in ${Math.ceil(resendLeft / 1000)}s` : "Resend verification email";
}

function persistVerificationState(identifier, payload = {}) {
  const resolvedIdentifier = String(identifier || payload.email || "").trim();
  const resolvedEmail = String(payload.email || "").trim();
  if (resolvedIdentifier) {
    sessionStorage.setItem(VERIFICATION_IDENTIFIER_KEY, resolvedIdentifier);
  }
  if (resolvedEmail) {
    sessionStorage.setItem(VERIFICATION_EMAIL_KEY, resolvedEmail);
  }
  sessionStorage.setItem(VERIFICATION_SENT_KEY, payload.sentAt || new Date().toISOString());
  sessionStorage.setItem(VERIFICATION_EXPIRES_KEY, payload.expiresAt || hoursFromNow(24));
  sessionStorage.setItem(VERIFICATION_RESEND_READY_KEY, payload.resendAvailableAt || secondsFromNow(60));
}

function clearVerificationState() {
  sessionStorage.removeItem(VERIFICATION_IDENTIFIER_KEY);
  sessionStorage.removeItem(VERIFICATION_EMAIL_KEY);
  sessionStorage.removeItem(VERIFICATION_SENT_KEY);
  sessionStorage.removeItem(VERIFICATION_EXPIRES_KEY);
  sessionStorage.removeItem(VERIFICATION_RESEND_READY_KEY);
}

async function withLoading(form, action) {
  const button = form.querySelector(".auth-submit");
  button?.classList.add("is-loading");
  button?.setAttribute("disabled", "true");
  button?.setAttribute("aria-busy", "true");

  try {
    await action();
  } catch (error) {
    showToast("Request failed", error.message);
  } finally {
    button?.classList.remove("is-loading");
    button?.removeAttribute("aria-busy");
    updateResendButtonState();
  }
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unavailable";
  }
  return date.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function replaceHistoryWithoutToken() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("token")) {
    return;
  }
  url.searchParams.delete("token");
  window.history.replaceState({}, "", url.toString());
}

function secondsFromNow(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function hoursFromNow(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
