import * as Device from 'expo-device';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { apiConfig } from '../api/apiConfig';
import { sanitizeOperationalMessage, sanitizeOperationalRecord } from '../shared/utils/operationalSanitizer';
import { recordDiagnosticEvent } from './diagnostics';
import {
  getFirebaseCrashReportingState,
  initializeFirebaseRuntime,
  logFirebaseBreadcrumb,
  setFirebaseOperationalContext,
  trackFirebaseEvent,
  type FirebaseOperationalContext,
} from './firebaseRuntime';
import { recordOperationalMetric } from './telemetry';
import type { ActiveWorkspaceRole, WorkspaceAudience } from '../types/auth';
import type { DiagnosticScope } from '../types/runtime';

type ObservabilityContext = {
  workspace?: string | null;
  role?: ActiveWorkspaceRole | null;
  audience?: WorkspaceAudience | null;
  screen?: string | null;
  appState?: AppStateStatus | string | null;
};

type ObservedErrorInput = {
  error: unknown;
  code: string;
  scope: DiagnosticScope;
  level?: 'warn' | 'error';
  message?: string;
  context?: Record<string, unknown>;
  fatal?: boolean;
};

const ERROR_THROTTLE_MS = 20_000;
const FAILURE_STORM_WINDOW_MS = 60_000;
const FAILURE_STORM_THRESHOLD = 3;
const EVENT_LOOP_INTERVAL_MS = 60_000;
const EVENT_LOOP_WARN_LAG_MS = 1_500;

let initialized = false;
let healthMonitorStarted = false;
let previousGlobalHandler: ((error: Error, isFatal?: boolean) => void) | null = null;
let currentContext: ObservabilityContext = {
  appState: AppState.currentState,
};
const recentErrors = new Map<string, number>();
const failureBuckets = new Map<string, number[]>();

type ErrorUtilsLike = {
  getGlobalHandler?: () => (error: Error, isFatal?: boolean) => void;
  setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
};

export async function initializeProductionObservability() {
  if (initialized) {
    return getObservabilitySnapshot();
  }
  initialized = true;

  registerGlobalErrorHandlers();
  startRuntimeHealthMonitor();

  await initializeFirebaseRuntime();
  await setObservabilityContext({
    appState: AppState.currentState,
  });

  const crashState = await getFirebaseCrashReportingState();
  if (crashState.didCrashPreviously) {
    await recordDiagnosticEvent({
      level: 'warn',
      scope: 'runtime',
      code: 'PREVIOUS_EXECUTION_CRASHED',
      message: 'Crashlytics reported that the previous app execution crashed.',
      context: {
        releaseChannel: apiConfig.releaseChannel,
        buildId: apiConfig.buildId,
      },
    });
  }

  await logFirebaseBreadcrumb('observability_initialized', {
    crashlytics: crashState.available,
    environment: apiConfig.environment,
    release_channel: apiConfig.releaseChannel,
  });

  return getObservabilitySnapshot();
}

export async function setObservabilityContext(context: ObservabilityContext) {
  currentContext = {
    ...currentContext,
    ...context,
  };

  const firebaseContext: FirebaseOperationalContext = {
    currentWorkspace: currentContext.workspace ?? null,
    currentRole: currentContext.role ?? null,
    currentAudience: currentContext.audience ?? null,
    currentScreen: currentContext.screen ?? null,
    deviceType: Device.deviceType ? String(Device.deviceType) : Platform.OS,
    osVersion: String(Platform.Version ?? 'unknown'),
    appState: currentContext.appState ? String(currentContext.appState) : null,
  };

  await setFirebaseOperationalContext(firebaseContext);
}

export async function trackScreenContext(screen: string, role?: ActiveWorkspaceRole | null) {
  await setObservabilityContext({
    screen,
    role: role ?? currentContext.role ?? null,
  });
  await logFirebaseBreadcrumb('screen_view', {
    screen,
    role: role ?? currentContext.role ?? null,
  });
}

export async function recordObservedError(input: ObservedErrorInput) {
  const level = input.level ?? 'error';
  const message = sanitizeMessage(input.message ?? errorMessage(input.error, input.code));
  const signature = `${input.scope}:${input.code}:${message.slice(0, 90)}`;
  if (isThrottled(signature)) {
    return;
  }

  const context = sanitizeContext({
    ...input.context,
    role: currentContext.role ?? null,
    screen: currentContext.screen ?? null,
    workspace: currentContext.workspace ?? null,
    appState: currentContext.appState ?? null,
    fatal: input.fatal ?? false,
  });

  await recordDiagnosticEvent({
    level,
    scope: input.scope,
    code: input.code,
    message,
    context,
  });
}

export async function recordApiFailure(input: {
  method: string;
  path: string;
  status?: number | null;
  kind: string;
  retryCount: number;
  durationMs?: number | null;
}) {
  const normalizedPath = normalizePath(input.path);
  const bucketKey = `${input.method}:${normalizedPath}:${input.status ?? input.kind}`;
  const count = pushFailureBucket(bucketKey);
  const isStorm = count >= FAILURE_STORM_THRESHOLD;
  const isSevere = input.kind === 'network' || input.status === 408 || input.status === 429 || Boolean(input.status && input.status >= 500);

  if (!isStorm && !isSevere) {
    return;
  }

  await recordObservedError({
    error: new Error(`API failure: ${input.kind}`),
    code: isStorm ? 'API_FAILURE_STORM' : 'API_REQUEST_FAILED',
    scope: 'api',
    level: input.status && input.status >= 500 ? 'error' : 'warn',
    message: isStorm
      ? 'Repeated API failures were detected during the current operational window.'
      : 'A production API request failed and was captured for diagnostics.',
    context: {
      method: input.method,
      path: normalizedPath,
      status: input.status ?? null,
      kind: input.kind,
      retryCount: input.retryCount,
      failureCount: count,
      durationMs: input.durationMs ?? null,
    },
  });
}

export async function recordSyncFailure(input: {
  code: string;
  message: string;
  reconnectAttempt?: number;
  status?: string;
}) {
  const count = pushFailureBucket(`sync:${input.code}`);
  await recordObservedError({
    error: new Error(input.message),
    code: count >= FAILURE_STORM_THRESHOLD ? 'SYNC_FAILURE_LOOP' : input.code,
    scope: 'sync',
    level: count >= FAILURE_STORM_THRESHOLD ? 'error' : 'warn',
    message: count >= FAILURE_STORM_THRESHOLD
      ? 'Repeated runtime sync failures were detected.'
      : input.message,
    context: {
      reconnectAttempt: input.reconnectAttempt ?? null,
      status: input.status ?? null,
      failureCount: count,
    },
  });
}

async function recordPerformanceSample(input: {
  name: string;
  durationMs: number;
  thresholdMs: number;
  scope?: DiagnosticScope;
  context?: Record<string, unknown>;
}) {
  if (input.durationMs < input.thresholdMs) {
    return;
  }

  await recordOperationalMetric({
    name: input.name === 'event_loop_lag' ? 'event_loop_lag' : 'slow_runtime_operation',
    value: Math.round(input.durationMs),
    tags: {
      operation: input.name,
      screen: currentContext.screen ?? null,
      role: currentContext.role ?? null,
    },
  });

  await recordObservedError({
    error: new Error(`${input.name} exceeded ${input.thresholdMs}ms`),
    code: input.name === 'event_loop_lag' ? 'EVENT_LOOP_LAG' : 'SLOW_RUNTIME_OPERATION',
    scope: input.scope ?? 'performance',
    level: 'warn',
    message: input.name === 'event_loop_lag'
      ? 'The JavaScript runtime event loop was delayed.'
      : 'A runtime operation exceeded the production performance threshold.',
    context: {
      durationMs: Math.round(input.durationMs),
      thresholdMs: input.thresholdMs,
      ...input.context,
    },
  });
}

async function getObservabilitySnapshot() {
  const crash = await getFirebaseCrashReportingState();
  return {
    initialized,
    crashReportingEnabled: crash.enabled,
    crashReportingAvailable: crash.available,
    crashReportingNativeAvailable: crash.nativeAvailable,
    didCrashPreviously: crash.didCrashPreviously,
    hasUnsentCrashReports: crash.hasUnsentReports,
    currentContext,
  };
}

function registerGlobalErrorHandlers() {
  const globalWithHandlers = globalThis as typeof globalThis & {
    ErrorUtils?: ErrorUtilsLike;
    addEventListener?: (type: string, listener: (event: { reason?: unknown }) => void) => void;
  };

  if (globalWithHandlers.ErrorUtils?.setGlobalHandler) {
    previousGlobalHandler = globalWithHandlers.ErrorUtils.getGlobalHandler?.() ?? null;
    globalWithHandlers.ErrorUtils.setGlobalHandler((error, isFatal) => {
      void recordObservedError({
        error,
        code: isFatal ? 'GLOBAL_FATAL_JS_EXCEPTION' : 'GLOBAL_JS_EXCEPTION',
        scope: 'runtime',
        level: 'error',
        fatal: Boolean(isFatal),
      });
      previousGlobalHandler?.(error, isFatal);
    });
  }

  globalWithHandlers.addEventListener?.('unhandledrejection', (event) => {
    void recordObservedError({
      error: event.reason,
      code: 'UNHANDLED_PROMISE_REJECTION',
      scope: 'runtime',
      level: 'error',
      message: errorMessage(event.reason, 'Unhandled async runtime failure.'),
      context: {
        async: true,
      },
    });
  });
}

function startRuntimeHealthMonitor() {
  if (healthMonitorStarted || !apiConfig.observabilityEnabled) {
    return;
  }
  healthMonitorStarted = true;

  let lastTick = Date.now();
  setInterval(() => {
    const now = Date.now();
    const lagMs = now - lastTick - EVENT_LOOP_INTERVAL_MS;
    lastTick = now;
    if (AppState.currentState !== 'active') {
      return;
    }
    void recordOperationalMetric({
      name: 'app_health',
      tags: {
        appState: AppState.currentState,
        releaseChannel: apiConfig.releaseChannel,
        environment: apiConfig.environment,
      },
    });
    void recordPerformanceSample({
      name: 'event_loop_lag',
      durationMs: lagMs,
      thresholdMs: EVENT_LOOP_WARN_LAG_MS,
    });
  }, EVENT_LOOP_INTERVAL_MS);

  AppState.addEventListener('change', (state) => {
    void setObservabilityContext({ appState: state });
    void trackFirebaseEvent('app_state_changed', {
      app_state: state,
    });
  });
}

function pushFailureBucket(key: string) {
  const now = Date.now();
  const current = (failureBuckets.get(key) ?? []).filter((timestamp) => now - timestamp <= FAILURE_STORM_WINDOW_MS);
  current.push(now);
  failureBuckets.set(key, current);
  return current.length;
}

function isThrottled(signature: string) {
  const now = Date.now();
  const previous = recentErrors.get(signature);
  if (previous && now - previous < ERROR_THROTTLE_MS) {
    return true;
  }
  recentErrors.set(signature, now);
  return false;
}

function normalizePath(path: string) {
  return String(path || '')
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/[a-f0-9]{24}/gi, ':id')
    .replace(/[0-9a-f-]{32,}/gi, ':id')
    .replace(/[?].*$/, '')
    .slice(0, 100);
}

function sanitizeContext(context?: Record<string, unknown>) {
  return sanitizeOperationalRecord(context, { stringLimit: 120 });
}

function sanitizeMessage(message: string) {
  return sanitizeOperationalMessage(message);
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message || fallback;
  }
  if (typeof error === 'string') {
    return error;
  }
  return fallback;
}
