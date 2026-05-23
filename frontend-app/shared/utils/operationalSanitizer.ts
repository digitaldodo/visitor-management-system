const REDACTED_PLACEHOLDER = '[redacted]';
const SENSITIVE_KEY_PATTERN = /(token|password|secret|authorization|cookie|refresh|access|payload|qr|email|phone|name|visitor|address|otp|pin|credential|photo|image)/i;
const SENSITIVE_VALUE_PATTERN = /(bearer\s+[a-z0-9._-]+|eyj[a-z0-9._-]+|password=|token=|authorization=)/i;

type SanitizedValue = string | number | boolean | null;

type SanitizeOptions = {
  stringLimit?: number;
  redactSensitiveKeys?: boolean;
  redactMessage?: string;
};

export function sanitizeOperationalMessage(message: string, limit = 240, redactedMessage = 'Sensitive runtime error details redacted.') {
  return SENSITIVE_VALUE_PATTERN.test(message)
    ? redactedMessage
    : message.slice(0, limit);
}

export function sanitizeOperationalRecord(
  record?: Record<string, unknown>,
  options?: SanitizeOptions,
) {
  if (!record) {
    return undefined;
  }

  const stringLimit = options?.stringLimit ?? 120;
  const redactSensitiveKeys = options?.redactSensitiveKeys ?? true;
  const redactedMessage = options?.redactMessage ?? REDACTED_PLACEHOLDER;

  const entries = Object.entries(record)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => {
      if (redactSensitiveKeys && SENSITIVE_KEY_PATTERN.test(key)) {
        return [key, redactedMessage] as const;
      }

      const sanitized = sanitizeOperationalValue(value, stringLimit, redactedMessage);
      return sanitized === undefined ? null : ([key, sanitized] as const);
    })
    .filter((entry): entry is readonly [string, SanitizedValue] => Boolean(entry));

  return Object.fromEntries(entries) as Record<string, SanitizedValue>;
}

function sanitizeOperationalValue(value: unknown, stringLimit: number, redactedMessage: string) {
  if (value === null || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string') {
    return SENSITIVE_VALUE_PATTERN.test(value) ? redactedMessage : value.slice(0, stringLimit);
  }

  try {
    const serialized = JSON.stringify(value);
    return SENSITIVE_VALUE_PATTERN.test(serialized) ? redactedMessage : serialized.slice(0, stringLimit);
  } catch {
    return undefined;
  }
}
