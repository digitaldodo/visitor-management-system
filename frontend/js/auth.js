import { forgotPassword, login, registerAccount } from "./shared/authApi.js";
import { $, $$ } from "./shared/dom.js";
import { redirectAuthenticatedFromLogin, redirectToPortal } from "./shared/roleGuard.js";
import { getTokenRoles, setSession } from "./shared/session.js";
import { showToast } from "./shared/toast.js";

document.addEventListener("DOMContentLoaded", () => {
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
  $$("[data-auth-tab]").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.authTab === target));
  $("#login-form")?.classList.toggle("is-hidden", target !== "login");
  $("#register-form")?.classList.toggle("is-hidden", target !== "register");
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

    if (!isEmail(data.email) || !data.password) {
      showToast("Check the form", "Enter a valid email and password.");
      return;
    }

    await withLoading(form, async () => {
      const response = await login({ email: data.email, password: data.password });
      const session = response.data;
      const tokenRoles = getTokenRoles(session.accessToken);
      const role = session.roles?.find((candidate) => tokenRoles.includes(candidate));

      if (!role) {
        throw new Error("Token role claims are missing or do not match the account.");
      }

      setSession(session);
      showToast("Signed in", `${formatRole(role)} portal ready.`);
      redirectToPortal(role, false);
    });
  });
}

function initRegisterForm() {
  $("#register-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = getFormData(form);

    if (!data.fullName || !isEmail(data.email) || !validatePassword(data.password)) {
      showToast("Check the form", "Use a valid email and a password with letters and numbers.");
      return;
    }

    await withLoading(form, async () => {
      await registerAccount({
        fullName: data.fullName,
        email: data.email,
        password: data.password,
        role: data.role,
        department: data.department || null,
      });
      showToast("Account created", "You can sign in now.");
      form.reset();
      setAuthTab("login");
    });
  });
}

function initForgotPassword() {
  $("#forgot-password-button")?.addEventListener("click", async () => {
    const email = $("#login-form input[name='email']")?.value;
    if (!isEmail(email)) {
      showToast("Email needed", "Enter your account email first.");
      return;
    }

    try {
      await forgotPassword(email);
      showToast("Request accepted", "Password reset delivery can be connected to email next.");
    } catch (error) {
      showToast("Request failed", error.message);
    }
  });
}

async function withLoading(form, action) {
  const button = form.querySelector(".auth-submit");
  button?.classList.add("is-loading");
  button?.setAttribute("disabled", "true");

  try {
    await action();
  } catch (error) {
    showToast("Authentication failed", error.message);
  } finally {
    button?.classList.remove("is-loading");
    button?.removeAttribute("disabled");
  }
}

function getFormData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function validatePassword(value) {
  return /[A-Za-z]/.test(value || "") && /\d/.test(value || "") && String(value || "").length >= 8;
}

function formatRole(role) {
  return String(role || "USER").replaceAll("_", " ");
}
