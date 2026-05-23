import type { AppError } from '../types/api';

export function shouldRetryQuery(failureCount: number, error?: AppError) {
  if (!error) {
    return failureCount < 2;
  }

  if (error.kind === 'auth' || error.kind === 'config' || error.kind === 'version') {
    return false;
  }

  if (error.status && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429) {
    return false;
  }

  return failureCount < 2;
}
