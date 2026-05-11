export function formatDate(value, options = { dateStyle: "medium", timeStyle: "short" }) {
  if (!value) {
    return "Not recorded";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat(undefined, options).format(date);
}

export function formatTime(value) {
  return formatDate(value, { timeStyle: "short" });
}

export function formatDateOnly(value) {
  return formatDate(value, { dateStyle: "medium" });
}

export function formatStatus(status) {
  return String(status || "").replaceAll("_", " ");
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

export function toIsoInstant(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function toDatetimeLocal(date) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}
