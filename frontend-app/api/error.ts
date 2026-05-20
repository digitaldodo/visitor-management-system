import axios from 'axios';

import type { AppError } from '../types/api';

function isAppError(error: unknown): error is AppError {
  return Boolean(
    error
    && typeof error === 'object'
    && 'kind' in error
    && 'message' in error
    && 'recoverable' in error,
  );
}

export function createAppError(error: Partial<AppError> & Pick<AppError, 'kind' | 'message'>): AppError {
  return {
    recoverable: true,
    ...error,
  };
}

export function createPayloadError(message = 'AccessFlow received an invalid response from the backend.') {
  return createAppError({
    kind: 'payload',
    message,
    recoverable: true,
  });
}

export function normalizeApiError(error: unknown): AppError {
  if (isAppError(error)) {
    return {
      ...error,
      message: sanitizeUserFacingErrorMessage(error.message, error.kind),
    };
  }

  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return createAppError({
        kind: 'network',
        message: sanitizeUserFacingErrorMessage(error.message, 'network'),
        code: error.code,
        recoverable: true,
      });
    }

    const payload = error.response.data as { message?: string; error?: string; errors?: unknown } | undefined;
    const retryAfterHeader = error.response.headers?.['retry-after'];
    const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : undefined;
    const isAuthFailure = error.response.status === 401 || error.response.status === 403;
    return createAppError({
      kind: isAuthFailure ? 'auth' : 'http',
      status: error.response.status,
      message: sanitizeUserFacingErrorMessage(
        payload?.message || payload?.error || 'The backend rejected this request.',
        isAuthFailure ? 'auth' : 'http',
      ),
      details: payload?.errors,
      code: error.code,
      recoverable: error.response.status >= 500 || error.response.status === 429 || error.response.status === 408,
      retryAfterMs,
    });
  }

  if (error instanceof Error) {
    return createAppError({
      kind: 'runtime',
      message: sanitizeUserFacingErrorMessage(error.message, 'runtime'),
      recoverable: true,
    });
  }

  return createAppError({
    kind: 'runtime',
    message: 'An unexpected runtime error occurred.',
    recoverable: true,
  });
}

export function sanitizeUserFacingErrorMessage(message?: string | null, kind?: AppError['kind']) {
  const normalized = String(message || '').trim();
  const lower = normalized.toLowerCase();

  if (kind === 'auth' || lower.includes('refresh token') || lower.includes('session expired')) {
    return 'Session expired. Please sign in again.';
  }

  if (
    lower.includes('authentication operation cancelled')
    || lower.includes('authentication canceled')
    || lower.includes('authentication cancelled')
    || lower.includes('user_cancel')
    || lower.includes('system_cancel')
    || lower.includes('app_cancel')
  ) {
    return 'Authentication interrupted. Please retry securely.';
  }

  if (
    lower.includes('securestore')
    || lower.includes('setvaluewithkeyasync')
    || lower.includes('getvaluewithkeyasync')
    || lower.includes('rejected')
    || lower.includes('promise')
    || lower.includes('stack trace')
    || lower.includes('exception')
    || lower.includes('native module')
  ) {
    return 'Unable to verify identity. Please retry securely.';
  }

  if (
    lower.includes('certificate')
    || lower.includes('ssl')
    || lower.includes('tls')
    || lower.includes('pinning')
    || lower.includes('trust anchor')
  ) {
    return 'Secure connection could not be verified. Some actions may be paused while AccessFlow checks again.';
  }

  if (
    !normalized
    || lower.includes('handshake')
    || lower.includes('socket')
    || lower.includes('websocket')
    || lower.includes('transport')
    || lower.includes('network error')
    || lower.includes('timeout')
    || lower.includes('timed out')
    || lower.includes('connection reset')
    || lower.includes('connection aborted')
    || lower.includes('failed to fetch')
  ) {
    if (kind === 'network') {
      return 'Restoring connection. Recent workspace data remains available while AccessFlow retries.';
    }
    return 'Restoring connection. AccessFlow will retry securely in the background.';
  }

  return normalized;
}
