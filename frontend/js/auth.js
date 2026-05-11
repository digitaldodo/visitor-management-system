import { login, registerAccount } from "./shared/authApi.js";
import { initAppErrorBoundary } from "./shared/appErrorBoundary.js";
import { $, $$ } from "./shared/dom.js";
import { formatStatus } from "./shared/formatters.js";
import { listOrganizations } from "./shared/organizationApi.js";
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
  initOrganizations();
  initLoginForm();
  initRegisterForm();
  initForgotPassword();
  setAuthTab("visitor", { scroll: false });
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
      description: "Use your organization-issued credentials and company code for host approvals.",
    },
    security: {
      eyebrow: "Security access",
      title: "Sign in to front desk operations",
      description: "Use your assigned credentials and company code to manage organization check-ins.",
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
  form?.querySelector("[data-company-code-field]")?.classList.toggle("is-hidden", audience === "visitor");
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
      const response = await login({
        identifier: data.identifier,
        password: data.password,
        companyCode: data.companyCode || null,
        portalAudience: data.audience,
      });
      const session = response.data;
      const tokenRoles = getTokenRoles(session.accessToken);
      const role = resolveAuthenticatedRole(session.roles, tokenRoles);

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

    if (!data.fullName || !isUsername(data.username) || !isEmail(data.email) || !validatePassword(data.password) || !data.companyCode) {
      showToast("Check the form", "Use a valid username, email, password, and organization.");
      return;
    }

    await withLoading(form, async () => {
      await registerAccount({
        fullName: data.fullName,
        username: data.username,
        email: data.email,
        password: data.password,
        phone: data.phone || null,
        companyCode: data.companyCode,
        hostEmployee: data.hostEmployee || null,
        purposeOfVisit: data.purposeOfVisit || null,
      });
      showToast("Visitor account created", "You can sign in to request or track visits.");
      form.reset();
      setAuthTab("visitor");
    });
  });
}

async function initOrganizations() {
  try {
    const response = await listOrganizations();
    const organizations = response.data || [];
    $$("[data-organization-select]").forEach((select) => {
      select.innerHTML = `<option value="">Select organization</option>${organizations.map((organization) => `
        <option value="${escapeHtml(organization.companyCode)}">${escapeHtml(organization.companyName)} (${escapeHtml(organization.companyCode)})</option>
      `).join("")}`;
    });
  } catch {
    // The manual company-code field still lets users authenticate if the public directory is unavailable.
  }
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

function normalizeAudience(target) {
  if (target === "admin" || target === "security" || target === "visitor") {
    return target;
  }
  return "employee";
}

function resolveAuthenticatedRole(sessionRoles = [], tokenRoles = []) {
  const priority = ["SUPER_ADMIN", "ADMIN", "EMPLOYEE", "SECURITY_GUARD", "VISITOR"];
  return priority.find((role) => sessionRoles.includes(role) && tokenRoles.includes(role)) || null;
}

function roleAllowedForAudience(role, audience) {
  if (role === "SUPER_ADMIN") {
    return ["admin", "employee", "security"].includes(audience);
  }
  const allowedAudienceByRole = {
    ADMIN: "admin",
    EMPLOYEE: "employee",
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
