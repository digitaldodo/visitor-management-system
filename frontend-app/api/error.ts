import axios from 'axios';

import type { AppError } from '../types/api';

export function createAppError(error: Partial<AppError> & Pick<AppError, 'kind' | 'message'>): AppError {
  return {
    recoverable: true,
    ...error,
  };
}

export function normalizeApiError(error: unknown): AppError {
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
    return createAppError({
      kind: 'http',
      status: error.response.status,
      message: payload?.message || payload?.error || 'The backend rejected this request.',
      details: payload?.errors,
      code: error.code,
      recoverable: error.response.status >= 500 || error.response.status === 429,
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
