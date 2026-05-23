import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';

import { apiConfig } from './apiConfig';
import { createAppError, createPayloadError, normalizeApiError } from './error';
import { recordDiagnosticEvent } from '../runtime/diagnostics';
import { recordApiFailure } from '../runtime/observability';
import { recordOperationalMetric } from '../runtime/telemetry';
import { resolveActiveRole } from '../auth/roleResolver';
import type { AppError } from '../types/api';
import type { AuthResponseDto, AuthSession } from '../types/auth';
import type { ApiEnvelope } from '../types/api';
import type { UserProfile } from '../types/domain';

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _authRetry?: boolean;
  _networkRetryCount?: number;
  accessFlowMaxNetworkRetries?: number;
  accessFlowSkipAuthRefresh?: boolean;
  _startedAt?: number;
};

export type AccessFlowRequestConfig = AxiosRequestConfig & {
  accessFlowMaxNetworkRetries?: number;
  accessFlowSkipAuthRefresh?: boolean;
};

type SessionProvider = () => AuthSession | null;
type SessionUpdater = (session: AuthSession) => Promise<void>;
type SessionExpiryHandler = (reason: string) => Promise<void>;

let getSession: SessionProvider = () => null;
let handleSessionUpdate: SessionUpdater = async () => undefined;
let handleSessionExpiry: SessionExpiryHandler = async () => undefined;
let refreshPromise: Promise<AuthSession> | null = null;
const inFlightPrivateGets = new Map<string, Promise<unknown>>();

const IDEMPOTENT_METHODS = new Set(['get', 'head', 'options']);
const RETRYABLE_STATUSES = new Set([408, 429, 502, 503, 504]);
const MAX_NETWORK_RETRIES = 4;

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

const publicApi = createClient(apiConfig.apiBaseUrl);
const privateApi = createClient(apiConfig.apiBaseUrl);

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
    const config = error.config as RetryableRequestConfig | undefined;
    await captureApiLatency(config, error.response?.status);
    const normalized = normalizeApiError(error);
    await recordApiFailure({
      method: String(config?.method || 'GET').toUpperCase(),
      path: String(config?.url || ''),
      status: normalized.status ?? null,
      kind: normalized.kind,
      retryCount: config?._networkRetryCount ?? 0,
      durationMs: getRequestDuration(config),
    });
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
        if (config?.accessFlowSkipAuthRefresh) {
          return Promise.reject(normalizeApiError(error));
        }
        return Promise.reject(normalizeApiError(refreshError));
      }
    }

    if (config && shouldRetryRequest(error, config)) {
      config._networkRetryCount = (config._networkRetryCount ?? 0) + 1;
      await delay(getRetryDelayMs(error, config._networkRetryCount));
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
      && !config.accessFlowSkipAuthRefresh
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

function getRequestDuration(config?: RetryableRequestConfig) {
  return config?._startedAt ? Date.now() - config._startedAt : null;
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
  const maxRetries = config.accessFlowMaxNetworkRetries ?? MAX_NETWORK_RETRIES;
  if (retryCount >= maxRetries) {
    return false;
  }

  const method = String(config.method || 'get').toLowerCase();
  const canReplay = IDEMPOTENT_METHODS.has(method) || hasIdempotencyKey(config);
  if (!canReplay) {
    return false;
  }

  if (!error.response) {
    return true;
  }

  return RETRYABLE_STATUSES.has(error.response.status);
}

function getRetryDelayMs(error: AxiosError, retryCount: number) {
  const retryAfterHeader = error.response?.headers?.['retry-after'];
  const retryAfterSeconds = Number(Array.isArray(retryAfterHeader) ? retryAfterHeader[0] : retryAfterHeader);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(30_000, retryAfterSeconds * 1_000);
  }

  const exponentialDelay = 650 * 2 ** Math.max(0, retryCount - 1);
  const jitter = Math.floor(Math.random() * 300);
  return Math.min(12_000, exponentialDelay + jitter);
}

function hasIdempotencyKey(config: RetryableRequestConfig) {
  const headers = config.headers as Record<string, unknown> | undefined;
  return Boolean(
    headers?.['Idempotency-Key']
      || headers?.['idempotency-key']
      || headers?.['X-AccessFlow-Operation-Id']
      || headers?.['x-accessflow-operation-id'],
  );
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
    const tokenType = payload.tokenType || session.tokenType;
    const profileResponse = await publicApi.get<ApiEnvelope<UserProfile>>('/auth/me', {
      headers: {
        Authorization: `${tokenType} ${payload.accessToken}`,
      },
    });
    const profile = unwrapApiResponse<UserProfile>(profileResponse.data);
    const roles = sanitizeRoles(payload.roles ?? payload.user?.roles ?? profile.roles ?? session.user.roles);
    const nextSession = {
      ...session,
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
      tokenType,
      expiresAt: payload.expiresAt,
      lastSyncedAt: new Date().toISOString(),
      user: {
        ...session.user,
        id: profile.id || payload.user?.id || payload.userId || session.user.id,
        username: profile.username || payload.user?.username || payload.username || session.user.username,
        email: profile.email || payload.user?.email || payload.email || session.user.email,
        fullName: profile.fullName || payload.user?.fullName || payload.fullName || session.user.fullName,
        organizationId: profile.organizationId ?? payload.user?.organizationId ?? payload.organizationId ?? session.user.organizationId,
        organizationName: profile.organizationName ?? payload.user?.organizationName ?? payload.organizationName ?? session.user.organizationName,
        organizationCode: profile.organizationCode ?? payload.user?.organizationCode ?? payload.organizationCode ?? session.user.organizationCode,
        organizationTimezone: profile.organizationTimezone ?? payload.user?.organizationTimezone ?? payload.organizationTimezone ?? session.user.organizationTimezone,
        organizationRegionCountry:
          profile.organizationRegionCountry ?? payload.user?.organizationRegionCountry ?? payload.organizationRegionCountry ?? session.user.organizationRegionCountry,
        roles,
        activeRole: resolveActiveRole(roles, session.audience),
        department: profile.department,
        designation: profile.designation,
        employeeId: profile.employeeId,
        employeePhotoUrl: profile.employeePhotoUrl,
        accountStatus: profile.accountStatus,
      },
    } satisfies AuthSession;

    await handleSessionUpdate(nextSession);
    return nextSession;
  } catch (error) {
    const normalizedError = normalizeApiError(error);
    if (normalizedError.kind === 'auth' || normalizedError.status === 401 || normalizedError.status === 403) {
      await handleSessionExpiry('Session expired. Please sign in again.');
    }
    throw normalizedError;
  }
}

function sanitizeRoles(roles: string[] | undefined) {
  return Array.from(new Set((roles ?? []).filter(Boolean))) as AuthSession['user']['roles'];
}

function assertApiConfigured() {
  if (!apiConfig.isConfigured) {
    throw createAppError({
      kind: 'config',
      message: 'EXPO_PUBLIC_ACCESSFLOW_API_BASE_URL is missing or invalid.',
      recoverable: false,
    });
  }
}

function unwrapApiResponse<T>(payload: T | ApiEnvelope<T>) {
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

export async function request<T>(config: AccessFlowRequestConfig) {
  assertApiConfigured();
  const dedupeKey = privateGetDedupeKey(config);
  if (dedupeKey && inFlightPrivateGets.has(dedupeKey)) {
    return inFlightPrivateGets.get(dedupeKey) as Promise<T>;
  }

  const promise = privateApi.request<T | ApiEnvelope<T>>(config)
    .then((response) => unwrapApiResponse<T>(response.data));

  if (dedupeKey) {
    inFlightPrivateGets.set(dedupeKey, promise);
    void promise.finally(() => {
      if (inFlightPrivateGets.get(dedupeKey) === promise) {
        inFlightPrivateGets.delete(dedupeKey);
      }
    }).catch(() => undefined);
  }

  return promise;
}

export async function publicRequest<T>(config: AccessFlowRequestConfig) {
  assertApiConfigured();
  const response = await publicApi.request<T | ApiEnvelope<T>>(config);
  return unwrapApiResponse<T>(response.data);
}

function delay(durationMs: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function privateGetDedupeKey(config: AccessFlowRequestConfig) {
  const method = String(config.method || 'get').toLowerCase();
  if (method !== 'get' || config.data || config.signal) {
    return '';
  }
  const session = getSession();
  return [
    session?.accessToken || '',
    session?.user.activeRole || '',
    config.baseURL || apiConfig.apiBaseUrl,
    config.url || '',
    stableSerialize(config.params),
  ].join('|');
}

function stableSerialize(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return String(value ?? '');
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${key}:${stableSerialize((value as Record<string, unknown>)[key])}`)
    .join(',');
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
      path: normalizePathForTelemetry(String(config?.url || '')),
      status: error.status ?? null,
      retryCount: config?._networkRetryCount ?? 0,
    },
  });

  await recordApiFailure({
    method: String(config?.method || 'GET').toUpperCase(),
    path: String(config?.url || ''),
    status: error.status ?? null,
    kind: error.kind,
    retryCount: config?._networkRetryCount ?? 0,
    durationMs: getRequestDuration(config),
  });
}
