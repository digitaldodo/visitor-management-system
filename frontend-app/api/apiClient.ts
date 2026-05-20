import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';

import { apiConfig } from './apiConfig';
import { createAppError, createPayloadError, normalizeApiError } from './error';
import { recordDiagnosticEvent } from '../runtime/diagnostics';
import { recordOperationalMetric } from '../runtime/telemetry';
import type { AppError } from '../types/api';
import type { AuthResponseDto, AuthSession } from '../types/auth';
import type { ApiEnvelope } from '../types/api';

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _authRetry?: boolean;
  _networkRetryCount?: number;
  _startedAt?: number;
};

type SessionProvider = () => AuthSession | null;
type SessionUpdater = (session: AuthSession) => Promise<void>;
type SessionExpiryHandler = (reason: string) => Promise<void>;

let getSession: SessionProvider = () => null;
let handleSessionUpdate: SessionUpdater = async () => undefined;
let handleSessionExpiry: SessionExpiryHandler = async () => undefined;
let refreshPromise: Promise<AuthSession> | null = null;

function createClient(baseURL: string) {
  return axios.create({
    baseURL,
    timeout: 20_000,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-AccessFlow-Client': 'expo-mobile',
    },
  });
}

export const publicApi = createClient(apiConfig.apiBaseUrl);
export const privateApi = createClient(apiConfig.apiBaseUrl);

export function configureApiClient(configuration: {
  getSession: SessionProvider;
  onSessionUpdate: SessionUpdater;
  onSessionExpired: SessionExpiryHandler;
}) {
  getSession = configuration.getSession;
  handleSessionUpdate = configuration.onSessionUpdate;
  handleSessionExpiry = configuration.onSessionExpired;
}

privateApi.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  (config as RetryableRequestConfig)._startedAt = Date.now();
  const session = getSession();
  if (session?.accessToken) {
    config.headers.Authorization = `${session.tokenType || 'Bearer'} ${session.accessToken}`;
    config.headers['X-AccessFlow-Role'] = session.user.activeRole;
  }
  config.headers['X-AccessFlow-App-Version'] = apiConfig.appVersion;
  config.headers['X-AccessFlow-Build-Id'] = apiConfig.buildId;
  config.headers['X-AccessFlow-Environment'] = apiConfig.environment;
  return config;
});

publicApi.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  (config as RetryableRequestConfig)._startedAt = Date.now();
  config.headers['X-AccessFlow-App-Version'] = apiConfig.appVersion;
  config.headers['X-AccessFlow-Build-Id'] = apiConfig.buildId;
  config.headers['X-AccessFlow-Environment'] = apiConfig.environment;
  return config;
});

privateApi.interceptors.response.use((response) => {
  void captureApiLatency(response.config as RetryableRequestConfig, response.status);
  return response;
});

publicApi.interceptors.response.use(
  (response) => {
    void captureApiLatency(response.config as RetryableRequestConfig, response.status);
    return response;
  },
  async (error: AxiosError) => {
    await captureApiLatency(error.config as RetryableRequestConfig | undefined, error.response?.status);
    return Promise.reject(error);
  },
);

privateApi.interceptors.response.use(
  (response) => {
    if (response.status >= 200 && response.status < 300 && response.data === undefined) {
      throw createPayloadError('AccessFlow received an empty response from the backend.');
    }

    return response;
  },
  async (error: AxiosError) => {
    const config = error.config as RetryableRequestConfig | undefined;
    await captureApiLatency(config, error.response?.status);

    if (shouldRefreshToken(error, config)) {
      try {
        const nextSession = await refreshSession();
        if (!config?.headers) {
          return Promise.reject(normalizeApiError(error));
        }
        config.headers.Authorization = `${nextSession.tokenType || 'Bearer'} ${nextSession.accessToken}`;
        config._authRetry = true;
        return privateApi(config);
      } catch (refreshError) {
        return Promise.reject(normalizeApiError(refreshError));
      }
    }

    if (config && shouldRetryRequest(error, config)) {
      config._networkRetryCount = (config._networkRetryCount ?? 0) + 1;
      await delay(350 * config._networkRetryCount);
      return privateApi(config);
    }

    const normalized = normalizeApiError(error);
    await captureApiDiagnostic(normalized, config);
    return Promise.reject(normalized);
  },
);

function shouldRefreshToken(error: AxiosError, config?: RetryableRequestConfig) {
  return Boolean(
    config
      && error.response?.status === 401
      && !config._authRetry
      && !String(config.url || '').includes('/auth/refresh')
      && !String(config.url || '').includes('/auth/login')
      && getSession()?.refreshToken,
  );
}

async function captureApiLatency(config?: RetryableRequestConfig, status?: number) {
  if (!config?._startedAt) {
    return;
  }

  const durationMs = Date.now() - config._startedAt;
  const path = String(config.url || '');
  const isOperationalPath = /\/(security|employee|visitor|admin|notifications|auth|mobile|versions|health)/.test(path);
  if (!isOperationalPath && durationMs < 2_000) {
    return;
  }

  await recordOperationalMetric({
    name: 'api_latency',
    value: durationMs,
    tags: {
      method: String(config.method || 'GET').toUpperCase(),
      path: normalizePathForTelemetry(path),
      status: status ?? null,
      slow: durationMs >= 2_000,
    },
  });
}

function normalizePathForTelemetry(path: string) {
  return path
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/[a-f0-9]{24}/gi, ':id')
    .replace(/[0-9a-f-]{32,}/gi, ':id')
    .slice(0, 100);
}

function shouldRetryRequest(error: AxiosError, config?: RetryableRequestConfig) {
  if (!config) {
    return false;
  }

  const retryCount = config._networkRetryCount ?? 0;
  if (retryCount >= 2) {
    return false;
  }

  if (!error.response) {
    return true;
  }

  return ['get', 'head'].includes(String(config.method || 'get').toLowerCase())
    && [408, 429, 502, 503, 504].includes(error.response.status);
}

async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = executeRefresh();
  }

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function executeRefresh() {
  const session = getSession();
  if (!session?.refreshToken) {
    throw new Error('No refresh token is available.');
  }

  try {
    const response = await publicApi.post<ApiEnvelope<AuthResponseDto>>('/auth/refresh', {
      refreshToken: session.refreshToken,
    });
    const payload = unwrapApiResponse<AuthResponseDto>(response.data);
    const nextSession = {
      ...session,
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
      tokenType: payload.tokenType || session.tokenType,
      expiresAt: payload.expiresAt,
      lastSyncedAt: new Date().toISOString(),
    } satisfies AuthSession;

    await handleSessionUpdate(nextSession);
    return nextSession;
  } catch (error) {
    await handleSessionExpiry('Session expired. Please sign in again.');
    throw error;
  }
}

export function assertApiConfigured() {
  if (!apiConfig.isConfigured) {
    throw createAppError({
      kind: 'config',
      message: 'EXPO_PUBLIC_ACCESSFLOW_API_BASE_URL is missing or invalid.',
      recoverable: false,
    });
  }
}

export function unwrapApiResponse<T>(payload: T | ApiEnvelope<T>) {
  if (payload === null || payload === undefined) {
    throw createPayloadError();
  }

  if (payload && typeof payload === 'object' && 'data' in (payload as ApiEnvelope<T>)) {
    const envelope = payload as Partial<ApiEnvelope<T>>;
    if (envelope.success === false) {
      throw createPayloadError(envelope.message || 'The backend reported an unsuccessful response.');
    }
    if (!('data' in envelope)) {
      throw createPayloadError();
    }
    return envelope.data as T;
  }
  return payload as T;
}

export async function request<T>(config: AxiosRequestConfig) {
  assertApiConfigured();
  const response = await privateApi.request<T | ApiEnvelope<T>>(config);
  return unwrapApiResponse<T>(response.data);
}

export async function publicRequest<T>(config: AxiosRequestConfig) {
  assertApiConfigured();
  const response = await publicApi.request<T | ApiEnvelope<T>>(config);
  return unwrapApiResponse<T>(response.data);
}

function delay(durationMs: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

async function captureApiDiagnostic(error: AppError, config?: RetryableRequestConfig) {
  const shouldRecord = error.kind === 'network'
    || error.kind === 'payload'
    || error.kind === 'version'
    || error.kind === 'config'
    || error.status === 429
    || Boolean(error.status && error.status >= 500);

  if (!shouldRecord) {
    return;
  }

  await recordDiagnosticEvent({
    level: error.kind === 'network' || error.kind === 'payload' ? 'warn' : 'error',
    scope: 'api',
    code: error.kind === 'payload' ? 'INVALID_API_PAYLOAD' : 'API_REQUEST_FAILED',
    message: error.message,
    context: {
      method: String(config?.method || 'GET').toUpperCase(),
      path: String(config?.url || ''),
      status: error.status ?? null,
      retryCount: config?._networkRetryCount ?? 0,
    },
  });
}
