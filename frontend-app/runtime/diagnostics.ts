import AsyncStorage from '@react-native-async-storage/async-storage';

import { logFirebaseBreadcrumb, recordFirebaseError, trackFirebaseEvent } from './firebaseRuntime';
import { recordOperationalMetric } from './telemetry';
import type { DiagnosticContext, DiagnosticEvent, DiagnosticLevel, DiagnosticScope } from '../types/runtime';

const DIAGNOSTIC_STORAGE_KEY = 'accessflow.mobile.diagnostics';
const MAX_EVENTS = 60;
const REDACTED_PLACEHOLDER = '[redacted]';
const SENSITIVE_KEY_PATTERN = /(token|password|secret|authorization|cookie|refresh|access|payload|qr|email|phone|name|visitor|address|otp|pin|credential|photo|image)/i;
const SENSITIVE_VALUE_PATTERN = /(bearer\s+[a-z0-9._-]+|eyj[a-z0-9._-]+|password=|token=|authorization=)/i;
const DEV_CONSOLE_DIAGNOSTICS_ENABLED = __DEV__ && process.env.EXPO_PUBLIC_ACCESSFLOW_DEBUG_LOGS === 'true';

export async function readDiagnosticEvents() {
  const rawValue = await AsyncStorage.getItem(DIAGNOSTIC_STORAGE_KEY);
  if (!rawValue) {
    return [] as DiagnosticEvent[];
  }

  try {
    const parsed = JSON.parse(rawValue) as DiagnosticEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function recordDiagnosticEvent(input: {
  level: DiagnosticLevel;
  scope: DiagnosticScope;
  code: string;
  message: string;
  context?: DiagnosticContext;
}) {
  const event: DiagnosticEvent = {
    id: `diag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    level: input.level,
    scope: input.scope,
    code: input.code,
    message: input.message,
    context: sanitizeContext(input.context),
  };

  try {
    const current = await readDiagnosticEvents();
    await AsyncStorage.setItem(DIAGNOSTIC_STORAGE_KEY, JSON.stringify([event, ...current].slice(0, MAX_EVENTS)));
  } catch {
    // Diagnostics must never block operational recovery.
  }

  writeConsoleEvent(event);
  void mirrorDiagnosticToFirebase(event);
  void recordMetricForDiagnostic(event);
  return event;
}

export async function clearDiagnosticEvents() {
  await AsyncStorage.removeItem(DIAGNOSTIC_STORAGE_KEY);
}

function sanitizeContext(context?: DiagnosticContext) {
  if (!context) {
    return undefined;
  }

  const nextEntries = Object.entries(context).map(([key, value]) => {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      return [key, REDACTED_PLACEHOLDER];
    }

    if (typeof value === 'string') {
      if (SENSITIVE_VALUE_PATTERN.test(value)) {
        return [key, REDACTED_PLACEHOLDER];
      }
      return [key, value.length > 180 ? `${value.slice(0, 177)}...` : value];
    }

    if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      return [key, value];
    }

    return [key, JSON.stringify(value).slice(0, 180)];
  });

  return Object.fromEntries(nextEntries);
}

function writeConsoleEvent(event: DiagnosticEvent) {
  if (!DEV_CONSOLE_DIAGNOSTICS_ENABLED) {
    return;
  }

  const line = `[accessflow-mobile] ${event.scope}:${event.code} ${event.message}`;
  if (event.level === 'error') {
    console.error(line, event.context);
    return;
  }

  if (event.level === 'warn') {
    console.warn(line, event.context);
    return;
  }

  console.log(line, event.context);
}

async function recordMetricForDiagnostic(event: DiagnosticEvent) {
  switch (event.code) {
    case 'LOGIN_FAILED':
    case 'SESSION_EXPIRED':
    case 'SESSION_BOOTSTRAP_FAILED':
    case 'SESSION_REFRESH_FAILED':
      await recordOperationalMetric({ name: 'auth_failure', tags: { code: event.code, level: event.level } });
      return;
    case 'UNHANDLED_RUNTIME_ERROR':
    case 'OTA_EMERGENCY_LAUNCH':
      await recordOperationalMetric({ name: 'runtime_recovery', tags: { code: event.code } });
      return;
    case 'DEVICE_REGISTRATION_FAILED':
      await recordOperationalMetric({ name: 'notification_failure', tags: { code: event.code } });
      return;
    case 'RUNTIME_SYNC_DEGRADED':
      await recordOperationalMetric({ name: 'network_degraded', tags: { code: event.code } });
      return;
    default:
      if (event.scope === 'scanner' && event.level !== 'info') {
        await recordOperationalMetric({ name: 'scanner_failure', tags: { code: event.code } });
      }
  }
}

async function mirrorDiagnosticToFirebase(event: DiagnosticEvent) {
  const firebaseContext = {
    scope: event.scope,
    code: event.code,
    level: event.level,
  };

  if (event.level === 'error') {
    await recordFirebaseError(new Error(event.message), event.code, firebaseContext);
    await trackFirebaseEvent('runtime_failure', firebaseContext);
    return;
  }

  await logFirebaseBreadcrumb(`${event.scope}:${event.code}`, firebaseContext);
  if (event.level === 'warn' && ['notification', 'sync', 'scanner', 'auth', 'runtime'].includes(event.scope)) {
    await trackFirebaseEvent('operational_warning', firebaseContext);
  }
}
