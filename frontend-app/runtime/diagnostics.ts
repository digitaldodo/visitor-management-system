import AsyncStorage from '@react-native-async-storage/async-storage';

import { logFirebaseBreadcrumb, recordFirebaseError, trackFirebaseEvent } from './firebaseRuntime';
import { recordOperationalMetric } from './telemetry';
import { sanitizeOperationalRecord } from '../shared/utils/operationalSanitizer';
import type { DiagnosticContext, DiagnosticEvent, DiagnosticLevel, DiagnosticScope } from '../types/runtime';

const DIAGNOSTIC_STORAGE_KEY = 'accessflow.mobile.diagnostics';
const MAX_EVENTS = 60;

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

  void mirrorDiagnosticToFirebase(event);
  void recordMetricForDiagnostic(event);
  return event;
}

export async function clearDiagnosticEvents() {
  await AsyncStorage.removeItem(DIAGNOSTIC_STORAGE_KEY);
}

function sanitizeContext(context?: DiagnosticContext) {
  return sanitizeOperationalRecord(context, { stringLimit: 180 });
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
