import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';

import { apiConfig } from './apiConfig';
import { normalizeApiError } from './error';
import type { AuthResponseDto, AuthSession } from '../types/auth';
import type { ApiEnvelope } from '../types/api';

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _authRetry?: boolean;
  _networkRetry?: boolean;
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
  const session = getSession();
  if (session?.accessToken) {
    config.headers.Authorization = `${session.tokenType || 'Bearer'} ${session.accessToken}`;
  }
  return config;
});

privateApi.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetryableRequestConfig | undefined;

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
      config._networkRetry = true;
      await delay(350);
      return privateApi(config);
    }

    return Promise.reject(normalizeApiError(error));
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

function shouldRetryRequest(error: AxiosError, config?: RetryableRequestConfig) {
  if (!config || config._networkRetry) {
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
    await handleSessionExpiry('Your session expired and could not be refreshed.');
    throw error;
  }
}

export function assertApiConfigured() {
  if (!apiConfig.isConfigured) {
    throw new Error('EXPO_PUBLIC_ACCESSFLOW_API_BASE_URL is missing or invalid.');
  }
}

export function unwrapApiResponse<T>(payload: T | ApiEnvelope<T>) {
  if (payload && typeof payload === 'object' && 'data' in (payload as ApiEnvelope<T>)) {
    return (payload as ApiEnvelope<T>).data;
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
