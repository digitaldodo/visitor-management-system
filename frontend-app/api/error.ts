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
    return error;
  }

  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return createAppError({
        kind: 'network',
        message: 'AccessFlow could not reach the backend. Check the network and retry.',
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
      message: payload?.message || payload?.error || 'The backend rejected this request.',
      details: payload?.errors,
      code: error.code,
      recoverable: error.response.status >= 500 || error.response.status === 429 || error.response.status === 408,
      retryAfterMs,
    });
  }

  if (error instanceof Error) {
    return createAppError({
      kind: 'runtime',
      message: error.message,
      recoverable: true,
    });
  }

  return createAppError({
    kind: 'runtime',
    message: 'An unexpected runtime error occurred.',
    recoverable: true,
  });
}
