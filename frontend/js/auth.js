import { login, registerAccount } from "./shared/authApi.js";
import { initAppErrorBoundary } from "./shared/appErrorBoundary.js";
import { $, $$ } from "./shared/dom.js";
import { formatStatus } from "./shared/formatters.js";
import { redirectAuthenticatedFromLogin, redirectToPortal } from "./shared/roleGuard.js";
import { getTokenRoles, setSession } from "./shared/session.js";
import { showToast } from "./shared/toast.js";

document.addEventListener("DOMContentLoaded", () => {
  initAppErrorBoundary();

  if (redirectAuthenticatedFromLogin()) {
    return;
  }

  initAuthTabs();
  initPasswordToggles();
  initLoginForm();
  initRegisterForm();
  initForgotPassword();
});

function initAuthTabs() {
  $$("[data-auth-tab]").forEach((tab) => {
    tab.addEventListener("click", () => setAuthTab(tab.dataset.authTab));
  });
}

function setAuthTab(target) {
  $$("[data-auth-tab]").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.authTab === target || (target === "visitor" && tab.dataset.authTab === "register")));
  $("#login-form")?.classList.toggle("is-hidden", target === "register");
  $("#register-form")?.classList.toggle("is-hidden", target !== "register");
  updateLoginAudience(target === "security" ? "security" : target === "visitor" ? "visitor" : "employee");
}

function updateLoginAudience(audience) {
  const form = $("#login-form");
  const input = form?.querySelector("input[name='audience']");
  if (input) {
    input.value = audience;
  }
  const copy = {
    employee: {
      eyebrow: "Employee access",
      title: "Sign in to your workplace portal",
      description: "Use your organization-issued credentials for host approvals and visit planning.",
    },
    security: {
      eyebrow: "Security access",
      title: "Sign in to front desk operations",
      description: "Use your assigned credentials to verify passes and manage check-ins.",
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
  $("#login-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = getFormData(form);

    if (!isUsernameOrEmail(data.identifier) || !data.password) {
      showToast("Check the form", "Enter a valid username/email and password.");
      return;
    }

    await withLoading(form, async () => {
      const response = await login({ identifier: data.identifier, password: data.password });
      const session = response.data;
      const tokenRoles = getTokenRoles(session.accessToken);
      const role = session.roles?.find((candidate) => tokenRoles.includes(candidate));

      if (!role) {
        throw new Error("Token role claims are missing or do not match the account.");
      }

      if (!roleAllowedForAudience(role, data.audience)) {
        throw new Error("Use the correct access option for this account.");
      }

      setSession(session);
      showToast("Signed in", `${formatStatus(role)} portal ready.`);
      redirectToPortal(role, false);
    });
  });
}

function initRegisterForm() {
  $("#register-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = getFormData(form);

    if (!data.fullName || !isUsername(data.username) || !isEmail(data.email) || !validatePassword(data.password)) {
      showToast("Check the form", "Use a valid username, email, and strong password.");
      return;
    }

    await withLoading(form, async () => {
      await registerAccount({
        fullName: data.fullName,
        username: data.username,
        email: data.email,
        password: data.password,
        phone: data.phone || null,
      });
      showToast("Visitor account created", "You can sign in to request or track visits.");
      form.reset();
      setAuthTab("visitor");
    });
  });
}

function initForgotPassword() {
  $("#forgot-password-button")?.addEventListener("click", async () => {
    const identifier = $("#login-form input[name='identifier']")?.value?.trim();
    if (identifier && isUsernameOrEmail(identifier)) {
      sessionStorage.setItem("passwordResetIdentifier", identifier);
    }
    window.location.href = "./pages/forgot-password/index.html";
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
    showToast("Authentication failed", error.message);
  } finally {
    button?.classList.remove("is-loading");
    button?.removeAttribute("disabled");
    button?.removeAttribute("aria-busy");
  }
}

function getFormData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function isUsername(value) {
  return /^[A-Za-z0-9._-]{3,32}$/.test(String(value || "").trim());
}

function isUsernameOrEmail(value) {
  const trimmed = String(value || "").trim();
  return isEmail(trimmed) || isUsername(trimmed);
}

function validatePassword(value) {
  return /[a-z]/.test(value || "")
    && /[A-Z]/.test(value || "")
    && /\d/.test(value || "")
    && /[^A-Za-z0-9]/.test(value || "")
    && String(value || "").length >= 12;
}

function roleAllowedForAudience(role, audience) {
  if (audience === "security") {
    return role === "SECURITY_GUARD";
  }
  if (audience === "visitor") {
    return role === "VISITOR";
  }
  return ["EMPLOYEE", "ADMIN", "SUPER_ADMIN"].includes(role);
}
