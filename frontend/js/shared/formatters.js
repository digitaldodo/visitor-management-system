import { enterpriseStatusLabel } from "./workflowEnums.js";

let defaultTimezone = "";

export function setDefaultTimezone(timezone) {
  defaultTimezone = isValidTimezone(timezone) ? timezone : "";
}

export function getDefaultTimezone() {
  return defaultTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function formatDate(value, options = { dateStyle: "medium", timeStyle: "short" }) {
  if (!value) {
    return "Not recorded";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat(undefined, withDefaultTimezone(options)).format(date);
}

export function formatTime(value) {
  return formatDate(value, { timeStyle: "short" });
}

export function formatDateOnly(value) {
  return formatDate(value, { dateStyle: "medium" });
}

export function formatStatus(status) {
  return enterpriseStatusLabel(status);
}

export function formatDurationMinutes(totalMinutes) {
  const minutes = Number(totalMinutes);
  if (!Number.isFinite(minutes) || minutes < 0) {
    return "Not recorded";
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (!remainingMinutes) {
    return `${hours} hr`;
  }
  return `${hours} hr ${remainingMinutes} min`;
}

export function minutesBetween(start, end = new Date()) {
  const from = start ? new Date(start) : null;
  const to = end instanceof Date ? end : new Date(end);
  if (!from || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return null;
  }
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000));
}

export function toIsoInstant(value, timezone = getDefaultTimezone()) {
  if (!value) {
    return null;
  }

  const date = parseDatetimeLocalInTimezone(value, timezone);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function toDatetimeLocal(date, timezone = getDefaultTimezone()) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) {
    return "";
  }
  const parts = datePartsInTimezone(value, timezone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function timezoneLabel(timezone = getDefaultTimezone()) {
  return isValidTimezone(timezone) ? timezone : "UTC";
}

function withDefaultTimezone(options = {}) {
  if (options.timeZone || !defaultTimezone) {
    return options;
  }
  return { ...options, timeZone: defaultTimezone };
}

function isValidTimezone(timezone) {
  if (!timezone || typeof timezone !== "string") {
    return false;
  }
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function parseDatetimeLocalInTimezone(value, timezone) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) {
    return new Date(value);
  }

  if (!isValidTimezone(timezone)) {
    return new Date(value);
  }

  const [, year, month, day, hour, minute, second = "00"] = match;
  const targetUtcMs = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  let instantMs = targetUtcMs - timezoneOffsetMs(new Date(targetUtcMs), timezone);
  instantMs = targetUtcMs - timezoneOffsetMs(new Date(instantMs), timezone);
  return new Date(instantMs);
}

function datePartsInTimezone(date, timezone) {
  const safeTimezone = isValidTimezone(timezone) ? timezone : "UTC";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

function timezoneOffsetMs(date, timezone) {
  const parts = datePartsInTimezone(date, timezone);
  const zonedAsUtcMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  );
  return zonedAsUtcMs - date.getTime();
}
