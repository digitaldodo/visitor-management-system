export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;
export const USERNAME_PATTERN = /^[a-z0-9_]{3,32}$/;
export const LEGACY_USERNAME_IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const USERNAME_LENGTH_MESSAGE = "Username must be 3-32 characters long.";
export const USERNAME_MESSAGE = "Username can contain only lowercase letters, numbers, and underscores.";

export function isEmail(value) {
  return EMAIL_PATTERN.test(normalize(value));
}

export function isUsername(value) {
  return validateUsername(value) === "";
}

export function isUsernameOrEmail(value) {
  const trimmed = normalize(value);
  return isEmail(trimmed) || LEGACY_USERNAME_IDENTIFIER_PATTERN.test(trimmed);
}

export function validateUsername(value) {
  const trimmed = normalize(value);
  if (!trimmed) {
    return "Username is required.";
  }
  if (trimmed.length < USERNAME_MIN_LENGTH || trimmed.length > USERNAME_MAX_LENGTH) {
    return USERNAME_LENGTH_MESSAGE;
  }
  if (!USERNAME_PATTERN.test(trimmed)) {
    return USERNAME_MESSAGE;
  }
  return "";
}

export function validateLoginIdentifier(value) {
  const trimmed = normalize(value);
  if (!trimmed) {
    return "Username or email is required.";
  }
  return isUsernameOrEmail(trimmed) ? "" : "Enter a valid username or email.";
}

export function attachFieldValidator(input, validate, options = {}) {
  if (!input) {
    return () => "";
  }

  const { messageParent = input.closest(".form-field"), showOnEmpty = false } = options;
  const message = ensureMessageNode(messageParent);

  const runValidation = () => {
    const value = normalize(input.value);
    const error = !showOnEmpty && !value ? "" : (validate(value) || "");
    input.setCustomValidity(error);
    input.toggleAttribute("aria-invalid", Boolean(error));
    message.textContent = error;
    message.hidden = !error;
    messageParent?.classList.toggle("is-invalid", Boolean(error));
    return error;
  };

  input.addEventListener("input", runValidation);
  input.addEventListener("blur", runValidation);
  return runValidation;
}

function ensureMessageNode(parent) {
  if (!parent) {
    return { textContent: "", hidden: true };
  }

  let message = parent.querySelector(".form-field__message");
  if (!message) {
    message = document.createElement("small");
    message.className = "form-field__message";
    message.hidden = true;
    parent.append(message);
  }
  return message;
}

function normalize(value) {
  return String(value || "").trim();
}
