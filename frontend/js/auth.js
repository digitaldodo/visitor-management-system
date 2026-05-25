import { login, registerAccount, resendVerificationEmail } from "./shared/authApi.js";
import { initAppErrorBoundary } from "./shared/appErrorBoundary.js";
import { bootstrapApplication } from "./shared/appRuntime.js";
import { $, $$ } from "./shared/dom.js";
import { formatStatus } from "./shared/formatters.js";
import { getHomepageContent } from "./shared/homepageApi.js";
import { initOrganizationSelectors } from "./shared/organizationSelector.js";
import { redirectAuthenticatedFromLogin, redirectToPortal } from "./shared/roleGuard.js";
import { getTokenRoles, setSession } from "./shared/session.js";
import { showToast } from "./shared/toast.js";
import { attachFieldValidator, isEmail, isUsernameOrEmail, validateLoginIdentifier, validateUsername } from "./shared/validation.js";
import { initPhoneInput, phonePayload, validatePhonePayload } from "./shared/phoneInput.js";

const VERIFICATION_IDENTIFIER_KEY = "visitorVerificationIdentifier";
const VERIFICATION_EMAIL_KEY = "visitorVerificationEmail";
const VERIFICATION_EXPIRES_KEY = "visitorVerificationExpiresAt";
const VERIFICATION_SENT_KEY = "visitorVerificationSentAt";
const VERIFICATION_RESEND_READY_KEY = "visitorVerificationResendReadyAt";
const SUBMITTING_FLAG = "authSubmitting";
const REDIRECTING_FLAG = "authRedirecting";

document.addEventListener("DOMContentLoaded", () => {
  void bootstrapApplication("login", async () => {
    initAppErrorBoundary();

    if (redirectAuthenticatedFromLogin()) {
      return;
    }

    initAuthTabs();
    initPasswordToggles();
    initOrganizationSelectors(document, { prefetch: true });
    initHomepageContent();
    initLoginForm();
    initLoginVerificationAssist();
    initRegisterForm();
    initForgotPassword();
    setAuthTab(resolveInitialAuthTab(), { scroll: false });
  }, {
    failureMessage: "AccessFlow had trouble restoring the sign-in screen. Refreshing...",
  });
});

function initAuthTabs() {
  $$("[data-auth-tab]").forEach((tab) => {
    tab.addEventListener("click", () => setAuthTab(tab.dataset.authTab, { scroll: false }));
  });

  $$("[data-auth-target]").forEach((trigger) => {
    trigger.addEventListener("click", () => setAuthTab(trigger.dataset.authTarget));
  });
}

function setAuthTab(target, options = {}) {
  const { scroll = true } = options;
  $$("[data-auth-tab]").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.authTab === target));
  $("#login-form")?.classList.toggle("is-hidden", target === "register");
  $("#register-form")?.classList.toggle("is-hidden", target !== "register");
  if (target !== "register") {
    updateLoginAudience(normalizeAudience(target));
  }

  if (scroll) {
    $("#access-hub")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function updateLoginAudience(audience) {
  const form = $("#login-form");
  const input = form?.querySelector("input[name='audience']");
  if (input) {
    input.value = audience;
  }
  const copy = {
    admin: {
      eyebrow: "Admin access",
      title: "Sign in to administration",
      description: "Use your administrator credentials to manage people, reporting, and organization controls.",
    },
    employee: {
      eyebrow: "Employee access",
      title: "Sign in to your workplace portal",
      description: "Use your organization-issued credentials and choose your workplace for host approvals.",
    },
    security: {
      eyebrow: "Security access",
      title: "Sign in to front desk operations",
      description: "Use your assigned credentials and choose your workplace to manage organization check-ins.",
    },
    "super-admin": {
      eyebrow: "Platform access",
      title: "Sign in to platform administration",
      description: "Use your super administrator credentials for global AccessFlow governance.",
    },
    visitor: {
      eyebrow: "Visitor access",
      title: "Sign in to track your visit",
      description: "Use your visitor account to view approval status and approved QR passes.",
    },
  }[audience];
  $("#login-eyebrow").textContent = copy.eyebrow;
  $("#login-title").textContent = copy.title;
  $("#login-description").textContent = copy.description;
  form?.querySelector("[data-company-code-field]")?.classList.toggle("is-hidden", audience === "visitor" || audience === "super-admin");
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

function initLoginForm() {
  const form = $("#login-form");
  const identifierInput = form?.querySelector("input[name='identifier']");
  const runIdentifierValidation = attachFieldValidator(identifierInput, validateLoginIdentifier);

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const currentForm = event.currentTarget;
    const data = getFormData(currentForm);
    const portalAudience = data.audience === "super-admin" ? "admin" : data.audience;
    const organizationRequired = ["employee", "security", "admin"].includes(data.audience);

    if (runIdentifierValidation() || !data.password) {
      showToast("Check the form", "Enter a valid username/email and password.");
      return;
    }
    if (organizationRequired && !data.companyCode) {
      showToast("Choose organization", "Select the organization for this portal account.");
      return;
    }

    await withLoading(currentForm, async () => {
      const response = await login({
        identifier: data.identifier,
        password: data.password,
        companyCode: data.companyCode || null,
        portalAudience,
      });
      const session = response;
      if (!session) {
        throw new Error("Login response was empty or malformed. Try again in a moment.");
      }
      const tokenRoles = getTokenRoles(session.accessToken);
      const role = resolveAuthenticatedRole(session.roles, tokenRoles);

      if (!role) {
        throw new Error("Token role claims are missing or do not match the account.");
      }

      if (!roleAllowedForAudience(role, data.audience)) {
        throw new Error("Use the correct access option for this account.");
      }

      setSession(session);
      hideLoginVerificationHelp();
      showToast("Signed in", `${formatStatus(role)} portal ready.`);
      currentForm.dataset[REDIRECTING_FLAG] = "true";
      redirectToPortal(role, false);
    }, (error) => {
      if (isVerificationRequiredError(error) && data.audience === "visitor") {
        persistVerificationState(data.identifier, {
          email: isEmail(data.identifier) ? data.identifier : "",
        });
        showLoginVerificationHelp(data.identifier);
        showToast("Verify your email", "Please verify your email before signing in.");
        return;
      }
      hideLoginVerificationHelp();
      const feedback = authErrorFeedback(error);
      showToast(feedback.title, feedback.message);
    });
  });
}

function initRegisterForm() {
  const form = $("#register-form");
  const usernameInput = form?.querySelector("input[name='username']");
  const runUsernameValidation = attachFieldValidator(usernameInput, validateUsername);
  initPhoneInput(form);

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const currentForm = event.currentTarget;
    const data = getFormData(currentForm);
    const usernameError = runUsernameValidation();

    const phone = phonePayload(data);
    const phoneError = validatePhonePayload(phone, { required: false });
    if (!data.fullName || usernameError || !isEmail(data.email) || !validatePassword(data.password) || !data.companyCode || phoneError) {
      showToast("Check the form", usernameError || phoneError || "Use a valid email, password, and organization.");
      return;
    }

    await withLoading(currentForm, async () => {
      const response = await registerAccount({
        fullName: data.fullName,
        username: data.username,
        email: data.email,
        password: data.password,
        phoneCountryCode: phone.phoneCountryCode,
        phone: phone.phone || null,
        companyCode: data.companyCode,
        hostEmployee: data.hostEmployee || null,
        purposeOfVisit: data.purposeOfVisit || null,
      });
      persistVerificationState(data.email, response?.data || {});
      showToast("Check your inbox", response?.message || "Verify your email to activate your AccessFlow account.");
      currentForm.reset();
      runUsernameValidation();
      window.location.href = buildVerificationPageUrl(data.email);
    });
  });
}

async function initHomepageContent() {
  try {
    const response = await getHomepageContent();
    renderAnnouncement(response.data?.announcement);
    renderHomepageMetrics("#homepage-featured-metrics", response.data?.featuredMetrics || [], response.data?.featuredMetricsEmptyState, "Visitor analytics become available after activity is recorded.");
    renderHomepageMetrics("#homepage-counters", response.data?.publicCounters || [], response.data?.publicCountersEmptyState, "Public counters appear after organizations, employee accounts, or visitor records are created.");
  } catch {
    renderAnnouncement(null);
    renderHomepageMetrics("#homepage-featured-metrics", [], null, "Platform insights appear here after the backend is reachable and real activity is recorded.");
    renderHomepageMetrics("#homepage-counters", [], null, "Counters appear only when the backend can return real values.");
  }
}

function initForgotPassword() {
  $("#forgot-password-button")?.addEventListener("click", async () => {
    const identifier = $("#login-form input[name='identifier']")?.value?.trim();
    if (identifier && isUsernameOrEmail(identifier)) {
      sessionStorage.setItem("passwordResetIdentifier", identifier);
    }
    window.location.href = "/forgot-password";
  });
}

function initLoginVerificationAssist() {
  const button = $("#login-resend-verification-button");
  if (!button) {
    return;
  }

  button.addEventListener("click", async () => {
    const form = $("#login-form");
    const identifier = ($("#login-form input[name='identifier']")?.value || sessionStorage.getItem(VERIFICATION_IDENTIFIER_KEY) || "").trim();
    if (!identifier || !isUsernameOrEmail(identifier)) {
      showToast("Enter your account", "Add your visitor email or username first.");
      return;
    }

    await withLoading(form, async () => {
      const response = await resendVerificationEmail(identifier);
      persistVerificationState(identifier, response?.data || {});
      updateLoginVerificationLink(identifier);
      showToast("Email sent", response?.message || "If the visitor account is pending verification, a new email has been sent.");
    });
  });
}

async function withLoading(form, action, onError = defaultAuthErrorHandler) {
  if (!form || form.dataset[SUBMITTING_FLAG] === "true") {
    return;
  }

  form.dataset[SUBMITTING_FLAG] = "true";
  const button = form.querySelector(".auth-submit");
  button?.classList.add("is-loading");
  button?.setAttribute("disabled", "true");
  button?.setAttribute("aria-busy", "true");

  try {
    await action();
  } catch (error) {
    onError(error);
  } finally {
    delete form.dataset[SUBMITTING_FLAG];
    if (form.dataset[REDIRECTING_FLAG] !== "true") {
      button?.classList.remove("is-loading");
      button?.removeAttribute("disabled");
      button?.removeAttribute("aria-busy");
    }
  }
}

function defaultAuthErrorHandler(error) {
  const feedback = authErrorFeedback(error);
  showToast(feedback.title, feedback.message);
}

function authErrorFeedback(error) {
  const status = Number(error?.status || 0);
  const code = String(error?.code || "");
  const rawMessage = String(error?.userMessage || error?.message || "").trim();
  const technical = /stack|TypeError|SyntaxError|Failed to fetch|NetworkError|AbortError|JSON|undefined|null|malformed|token role claims/i.test(rawMessage);

  if (code.includes("TIMEOUT") || code.includes("NETWORK") || code.includes("TRANSIENT") || error?.retryable) {
    return {
      title: "Connection interrupted",
      message: rawMessage && !technical ? rawMessage : "Unable to sign in right now. Check the connection and try again.",
    };
  }

  if (status === 401 || status === 403) {
    return {
      title: "Unable to sign in",
      message: rawMessage && !technical ? rawMessage : "Check your credentials and access option, then try again.",
    };
  }

  if (status >= 500) {
    return {
      title: "Unable to sign in right now",
      message: "AccessFlow is temporarily unavailable. Please try again in a moment.",
    };
  }

  return {
    title: "Authentication failed",
    message: rawMessage && !technical ? rawMessage : "Unable to sign in right now. Please try again.",
  };
}

function getFormData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function validatePassword(value) {
  return /[a-z]/.test(value || "")
    && /[A-Z]/.test(value || "")
    && /\d/.test(value || "")
    && /[^A-Za-z0-9]/.test(value || "")
    && String(value || "").length >= 12;
}

function normalizeAudience(target) {
  if (target === "admin" || target === "security" || target === "visitor" || target === "super-admin") {
    return target;
  }
  return "employee";
}

function isVerificationRequiredError(error) {
  return error?.status === 401 && String(error?.message || "").includes("Please verify your email before signing in.");
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
  sessionStorage.setItem(VERIFICATION_EXPIRES_KEY, payload.expiresAt || hoursFromNow(24));
  sessionStorage.setItem(VERIFICATION_SENT_KEY, payload.sentAt || new Date().toISOString());
  sessionStorage.setItem(VERIFICATION_RESEND_READY_KEY, payload.resendAvailableAt || secondsFromNow(60));
}

function showLoginVerificationHelp(identifier) {
  const panel = $("#login-verification-help");
  panel?.classList.remove("is-hidden");
  updateLoginVerificationLink(identifier);
}

function hideLoginVerificationHelp() {
  $("#login-verification-help")?.classList.add("is-hidden");
}

function updateLoginVerificationLink(identifier) {
  const link = $("#login-open-verification-link");
  if (!link) {
    return;
  }
  link.href = buildVerificationPageUrl(identifier || sessionStorage.getItem(VERIFICATION_IDENTIFIER_KEY) || "");
}

function buildVerificationPageUrl(identifier) {
  const url = new URL("/verify-email", window.location.origin);
  const value = String(identifier || "").trim();
  if (value) {
    url.searchParams.set("identifier", value);
  }
  return url.toString();
}

function resolveInitialAuthTab() {
  const path = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  const requestedTab = (params.get("tab") || params.get("mode") || "").toLowerCase();

  if (requestedTab === "register" || path.endsWith("/register") || path.endsWith("/signup")) {
    return "register";
  }
  if (["admin", "employee", "security", "super-admin", "visitor"].includes(requestedTab)) {
    return requestedTab;
  }
  return "visitor";
}

function secondsFromNow(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function hoursFromNow(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function resolveAuthenticatedRole(sessionRoles = [], tokenRoles = []) {
  const priority = ["SUPER_ADMIN", "ADMIN", "MANAGER", "OPERATOR", "RECEPTION", "EMPLOYEE", "SECURITY_GUARD", "VISITOR"];
  const sessionRole = priority.find((role) => sessionRoles.includes(role)) || null;
  const tokenRole = priority.find((role) => tokenRoles.includes(role)) || null;

  if (sessionRole && tokenRole && sessionRole !== tokenRole) {
    return null;
  }

  return tokenRole || sessionRole;
}

function roleAllowedForAudience(role, audience) {
  if (role === "SUPER_ADMIN") {
    return audience === "super-admin";
  }
  const allowedAudienceByRole = {
    ADMIN: "admin",
    EMPLOYEE: "employee",
    RECEPTION: "employee",
    OPERATOR: "employee",
    MANAGER: "employee",
    SECURITY_GUARD: "security",
    VISITOR: "visitor",
  };
  return allowedAudienceByRole[role] === audience;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderAnnouncement(announcement) {
  const panel = $("#homepage-announcement");
  if (!panel) {
    return;
  }

  if (!announcement?.title || !announcement?.body) {
    panel.classList.add("is-hidden");
    panel.innerHTML = "";
    return;
  }

  panel.classList.remove("is-hidden");
  panel.innerHTML = `
    <p class="eyebrow">Announcement</p>
    <h3>${escapeHtml(announcement.title)}</h3>
    <p>${escapeHtml(announcement.body)}</p>
  `;
}

function renderHomepageMetrics(selector, metrics, emptyState, fallbackMessage) {
  const container = $(selector);
  if (!container) {
    return;
  }

  const safeMetrics = Array.isArray(metrics) ? metrics : [];
  if (!safeMetrics.length) {
    container.innerHTML = `
      <article class="empty-state empty-state--inline homepage-empty-state">
        <h3>${escapeHtml(emptyState?.title || "No metrics yet")}</h3>
        <p>${escapeHtml(emptyState?.message || fallbackMessage)}</p>
      </article>
    `;
    return;
  }

  container.innerHTML = safeMetrics.map((metric) => `
    <article class="homepage-metric-card">
      <span class="metric-card__label">${escapeHtml(metric.label)}</span>
      <strong>${escapeHtml(metric.value)}</strong>
      <small>${escapeHtml(metric.note)}</small>
    </article>
  `).join("");
}
