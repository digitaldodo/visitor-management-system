import { forgotPassword, resetPassword, verifyOtp } from "./shared/authApi.js";
import { initAppErrorBoundary } from "./shared/appErrorBoundary.js";
import { bootstrapApplication } from "./shared/appRuntime.js";
import { $, $$ } from "./shared/dom.js";
import { showToast } from "./shared/toast.js";
import { attachFieldValidator, isUsernameOrEmail, validateLoginIdentifier } from "./shared/validation.js";

const RESET_IDENTIFIER_KEY = "passwordResetIdentifier";
const RESET_TOKEN_KEY = "passwordResetToken";
const OTP_EXPIRES_KEY = "passwordResetOtpExpiresAt";
const RESET_TOKEN_EXPIRES_KEY = "passwordResetTokenExpiresAt";
const RESEND_READY_KEY = "passwordResetResendReadyAt";

document.addEventListener("DOMContentLoaded", () => {
  void bootstrapApplication("password-recovery", async () => {
    initAppErrorBoundary();
    initPasswordToggles();
    initForgotPasswordPage();
    initVerifyOtpPage();
    initResetPasswordPage();
  }, {
    failureMessage: "Preparing password recovery...",
  });
});

function initForgotPasswordPage() {
  const form = $("#forgot-password-form");
  if (!form) {
    return;
  }

  const identifierInput = form.querySelector("input[name='identifier']");
  identifierInput.value = sessionStorage.getItem(RESET_IDENTIFIER_KEY) || "";
  const runIdentifierValidation = attachFieldValidator(identifierInput, validateLoginIdentifier);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const identifier = identifierInput.value.trim();
    const error = runIdentifierValidation();
    if (error || !isUsernameOrEmail(identifier)) {
      showToast("Check the form", error || "Enter a valid username or email.");
      return;
    }

    await withLoading(form, async () => {
      const response = await forgotPassword(identifier);
      sessionStorage.setItem(RESET_IDENTIFIER_KEY, identifier);
      sessionStorage.setItem(OTP_EXPIRES_KEY, response.data?.expiresAt || minutesFromNow(5));
      sessionStorage.setItem(RESEND_READY_KEY, secondsFromNow(60));
      showToast("Request accepted", response.message || "If the account exists, a verification code has been sent.");
      window.location.href = "../verify-otp/index.html";
    });
  });
}

function initVerifyOtpPage() {
  const form = $("#verify-otp-form");
  if (!form) {
    return;
  }

  const identifier = sessionStorage.getItem(RESET_IDENTIFIER_KEY);
  if (!identifier) {
    window.location.href = "../forgot-password/index.html";
    return;
  }

  const otpInput = form.querySelector("input[name='otp']");
  otpInput.addEventListener("input", () => {
    otpInput.value = otpInput.value.replace(/\D/g, "").slice(0, 6);
  });

  startOtpTimers();

  $("#resend-otp-button")?.addEventListener("click", async () => {
    await withLoading(form, async () => {
      const response = await forgotPassword(identifier);
      sessionStorage.setItem(OTP_EXPIRES_KEY, response.data?.expiresAt || minutesFromNow(5));
      sessionStorage.setItem(RESEND_READY_KEY, secondsFromNow(60));
      otpInput.value = "";
      startOtpTimers();
      showToast("Request accepted", response.message || "If the account exists, a verification code has been sent.");
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const otp = otpInput.value.trim();
    if (!/^\d{6}$/.test(otp)) {
      showToast("Check the code", "Enter the 6-digit code.");
      return;
    }

    await withLoading(form, async () => {
      const response = await verifyOtp(identifier, otp);
      const resetData = response?.data || {};
      if (!resetData.resetToken || !resetData.expiresAt) {
        throw new Error("Verification response was empty.");
      }
      sessionStorage.setItem(RESET_TOKEN_KEY, resetData.resetToken);
      sessionStorage.setItem(RESET_TOKEN_EXPIRES_KEY, resetData.expiresAt);
      showToast("Code verified", "Create a new password.");
      window.location.href = "../reset-password/index.html";
    });
  });
}

function initResetPasswordPage() {
  const form = $("#reset-password-form");
  if (!form) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const activationToken = params.get("token");
  if (activationToken) {
    sessionStorage.setItem(RESET_TOKEN_KEY, activationToken);
    sessionStorage.setItem(RESET_TOKEN_EXPIRES_KEY, daysFromNow(7));
    const email = params.get("email");
    if (email) {
      sessionStorage.setItem(RESET_IDENTIFIER_KEY, email);
    }
    const cleanUrl = `${window.location.pathname}`;
    window.history.replaceState({}, document.title, cleanUrl);
  }

  const resetToken = sessionStorage.getItem(RESET_TOKEN_KEY);
  const resetTokenExpiresAt = sessionStorage.getItem(RESET_TOKEN_EXPIRES_KEY);
  if (!resetToken || isPast(resetTokenExpiresAt)) {
    showToast("Session expired", "Verify your account again.");
    window.location.href = "../forgot-password/index.html";
    return;
  }

  const passwordInput = form.querySelector("input[name='newPassword']");
  const confirmInput = form.querySelector("input[name='confirmPassword']");
  passwordInput.addEventListener("input", () => updatePasswordStrength(passwordInput.value));
  updatePasswordStrength("");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = passwordInput.value;
    const confirmPassword = confirmInput.value;
    if (!isStrongPassword(password)) {
      showToast("Weak password", "Use uppercase, lowercase, number, symbol, and at least 12 characters.");
      return;
    }
    if (password !== confirmPassword) {
      showToast("Passwords differ", "Confirm password must match.");
      return;
    }

    await withLoading(form, async () => {
      await resetPassword(resetToken, password);
      sessionStorage.removeItem(RESET_IDENTIFIER_KEY);
      sessionStorage.removeItem(RESET_TOKEN_KEY);
      sessionStorage.removeItem(OTP_EXPIRES_KEY);
      sessionStorage.removeItem(RESET_TOKEN_EXPIRES_KEY);
      sessionStorage.removeItem(RESEND_READY_KEY);
      showToast("Password updated", "Sign in with your new password.");
      window.location.href = "../../index.html";
    });
  });
}

function startOtpTimers() {
  window.clearInterval(window.passwordResetCountdownTimer);
  window.passwordResetCountdownTimer = window.setInterval(updateOtpTimers, 500);
  updateOtpTimers();
}

function updateOtpTimers() {
  const expiresAt = sessionStorage.getItem(OTP_EXPIRES_KEY);
  const resendReadyAt = sessionStorage.getItem(RESEND_READY_KEY);
  const countdown = $("#otp-countdown");
  const resendButton = $("#resend-otp-button");

  const msLeft = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  if (countdown) {
    countdown.textContent = formatDuration(msLeft);
  }

  if (resendButton) {
    const resendLeft = Math.max(0, new Date(resendReadyAt).getTime() - Date.now());
    resendButton.disabled = resendLeft > 0;
    resendButton.textContent = resendLeft > 0 ? `Resend in ${Math.ceil(resendLeft / 1000)}s` : "Resend code";
  }
}

function updatePasswordStrength(password) {
  const score = passwordScore(password);
  const bar = $("#password-strength-bar");
  const label = $("#password-strength-label");
  const labels = ["weak", "fair", "good", "strong", "excellent"];

  if (bar) {
    bar.style.width = `${Math.max(12, score * 25)}%`;
    bar.dataset.score = String(score);
  }
  if (label) {
    label.textContent = `Strength: ${labels[Math.max(0, score - 1)] || "weak"}`;
  }
}

function passwordScore(password) {
  let score = 0;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return score;
}

function initPasswordToggles() {
  $$(".password-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const input = button.parentElement?.querySelector("input");
      if (!input) {
        return;
      }
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.textContent = show ? "Hide" : "Show";
      button.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
  });
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
    button?.removeAttribute("disabled");
    button?.removeAttribute("aria-busy");
  }
}

function isStrongPassword(value) {
  return passwordScore(value || "") >= 4;
}

function formatDuration(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function minutesFromNow(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function secondsFromNow(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function daysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function isPast(value) {
  const time = new Date(value).getTime();
  return !value || Number.isNaN(time) || time <= Date.now();
}
