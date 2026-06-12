export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;
export const USERNAME_PATTERN = /^[a-z0-9_]{3,32}$/;
export const LEGACY_USERNAME_IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const USERNAME_LENGTH_MESSAGE = "Username must be 3-32 characters long.";
export const USERNAME_MESSAGE = "Username can contain only lowercase letters, numbers, and underscores.";

export function normalizeInput(value) {
  return String(value || "").trim();
}
