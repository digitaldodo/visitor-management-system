import { escapeHtml } from "./portalShell.js";
import { localizedHtml, t } from "./localization.js";

let modalSequence = 0;

export function confirmAction({
  title = "Confirm action",
  message = "Confirm this operational action.",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
} = {}) {
  return openActionModal({
    title,
    message,
    confirmLabel,
    cancelLabel,
    tone,
  });
}

export function promptAction({
  title = "Enter details",
  message = "",
  label = "Reason",
  placeholder = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  multiline = false,
  required = true,
  minLength = 1,
  defaultValue = "",
  type = "text",
  tone = "default",
} = {}) {
  return openActionModal({
    title,
    message,
    confirmLabel,
    cancelLabel,
    tone,
    fields: [{
      name: "value",
      label,
      placeholder,
      multiline,
      required,
      minLength,
      defaultValue,
      type,
    }],
  }).then((result) => result?.value ?? null);
}

function openActionModal(options) {
  const id = `enterprise-action-modal-${++modalSequence}`;
  const modal = document.createElement("div");
  modal.className = `enterprise-action-modal enterprise-action-modal--${escapeHtml(options.tone || "default")}`;
  modal.id = id;
  modal.innerHTML = `
    <div class="enterprise-action-modal__backdrop" data-action-cancel></div>
    <section class="enterprise-action-modal__sheet" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
      <header class="enterprise-action-modal__header">
        <div>
          <p class="eyebrow">${localizedHtml("AccessFlow operations")}</p>
          <h2 id="${id}-title">${localizedHtml(options.title)}</h2>
          ${options.message ? `<p>${localizedHtml(options.message)}</p>` : ""}
        </div>
      </header>
      <form class="enterprise-action-modal__form" novalidate>
        ${(options.fields || []).map(fieldMarkup).join("")}
        <p class="form-field__message enterprise-action-modal__error" hidden></p>
        <div class="enterprise-action-modal__actions">
          <button class="button button--ghost" type="button" data-action-cancel>${localizedHtml(options.cancelLabel || "Cancel")}</button>
          <button class="button ${options.tone === "danger" ? "button--danger" : "button--primary"}" type="submit">${localizedHtml(options.confirmLabel || "Confirm")}</button>
        </div>
      </form>
    </section>
  `;

  return new Promise((resolve) => {
    let resolved = false;
    const cleanup = (value) => {
      if (resolved) {
        return;
      }
      resolved = true;
      modal.remove();
      resolve(value);
    };

    modal.querySelectorAll("[data-action-cancel]").forEach((element) => {
      element.addEventListener("click", () => cleanup(null));
    });

    modal.querySelector("form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const values = {};
      const error = modal.querySelector(".enterprise-action-modal__error");
      for (const field of options.fields || []) {
        const input = modal.querySelector(`[name="${cssEscape(field.name)}"]`);
        const value = String(input?.value || "").trim();
        if (field.required && value.length < (field.minLength || 1)) {
          if (error) {
            error.hidden = false;
            error.textContent = t(`${field.label || "Reason"} is required.`);
          }
          input?.focus();
          return;
        }
        values[field.name] = value;
      }
      cleanup((options.fields || []).length ? values : true);
    });

    modal.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        cleanup(null);
      }
    });

    document.body.append(modal);
    window.requestAnimationFrame(() => {
      modal.querySelector("input, textarea, button")?.focus();
    });
  });
}

function fieldMarkup(field) {
  const input = field.multiline
    ? `<textarea name="${escapeHtml(field.name)}" rows="4" placeholder="${escapeHtml(t(field.placeholder || ""))}">${escapeHtml(field.defaultValue || "")}</textarea>`
    : `<input name="${escapeHtml(field.name)}" type="${escapeHtml(field.type || "text")}" value="${escapeHtml(field.defaultValue || "")}" placeholder="${escapeHtml(t(field.placeholder || ""))}" />`;
  return `
    <label class="form-field">
      <span>${localizedHtml(field.label || "Reason")}</span>
      ${input}
    </label>
  `;
}

function cssEscape(value) {
  if (window.CSS?.escape) {
    return window.CSS.escape(value);
  }
  return String(value).replaceAll('"', '\\"');
}
