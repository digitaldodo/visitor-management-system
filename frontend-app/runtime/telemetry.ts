import AsyncStorage from '@react-native-async-storage/async-storage';

import { apiConfig } from '../api/apiConfig';
import { trackFirebaseEvent } from './firebaseRuntime';
import type { OperationalMetric, OperationalMetricName } from '../types/runtime';

const METRIC_STORAGE_KEY = 'accessflow.mobile.operational-metrics';
const MAX_METRICS = 120;
const SENSITIVE_KEY_PATTERN = /(token|password|secret|authorization|cookie|refresh|access|payload|qr|email|phone|name)/i;

type MetricInput = {
  name: OperationalMetricName;
  value?: number;
  tags?: Record<string, string | number | boolean | null | undefined>;
};

export async function recordOperationalMetric(input: MetricInput) {
  if (!apiConfig.observabilityEnabled) {
    return null;
  }

  const metric: OperationalMetric = {
    id: `metric-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: input.name,
    value: Number.isFinite(input.value) ? Number(input.value) : 1,
    createdAt: new Date().toISOString(),
    tags: sanitizeTags(input.tags),
  };

  try {
    const current = await readOperationalMetrics();
    await AsyncStorage.setItem(METRIC_STORAGE_KEY, JSON.stringify([metric, ...current].slice(0, MAX_METRICS)));
  } catch {
    // Metrics are best-effort and must never interrupt access operations.
  }

  void mirrorMetricToFirebase(metric);
  return metric;
}

export async function readOperationalMetrics() {
  const rawValue = await AsyncStorage.getItem(METRIC_STORAGE_KEY);
  if (!rawValue) {
    return [] as OperationalMetric[];
  }

  try {
    const parsed = JSON.parse(rawValue) as OperationalMetric[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    await AsyncStorage.removeItem(METRIC_STORAGE_KEY);
    return [];
  }
}

export async function clearOperationalMetrics(ids?: string[]) {
  if (!ids?.length) {
    await AsyncStorage.removeItem(METRIC_STORAGE_KEY);
    return;
  }

  const idSet = new Set(ids);
  const remaining = (await readOperationalMetrics()).filter((metric) => !idSet.has(metric.id));
  await AsyncStorage.setItem(METRIC_STORAGE_KEY, JSON.stringify(remaining));
}

function sanitizeTags(tags?: MetricInput['tags']) {
  if (!tags) {
    return undefined;
  }

  const entries = Object.entries(tags)
    .filter(([key, value]) => value !== undefined && !SENSITIVE_KEY_PATTERN.test(key))
    .map(([key, value]) => [key, typeof value === 'string' && value.length > 80 ? `${value.slice(0, 77)}...` : value]);

  return Object.fromEntries(entries) as OperationalMetric['tags'];
}

async function mirrorMetricToFirebase(metric: OperationalMetric) {
  const eventName = analyticsEventNameForMetric(metric.name);
  if (!eventName) {
    return;
  }

  await trackFirebaseEvent(eventName, {
    value: metric.value,
    ...(metric.tags ?? {}),
  });
}

function analyticsEventNameForMetric(name: OperationalMetricName) {
  switch (name) {
    case 'scanner_success':
      return 'qr_scan_success';
    case 'scanner_failure':
    case 'qr_validation_issue':
      return 'qr_scan_failure';
    case 'denied_access':
      return 'visitor_denied';
    case 'visitor_verification':
      return 'visitor_approval_action';
    case 'workforce_presence':
      return 'workforce_approval_action';
    case 'offline_operation_queued':
      return 'offline_operation_queued';
    case 'offline_operation_synced':
      return 'offline_operation_synced';
    case 'offline_operation_failed':
      return 'offline_sync_failure';
    case 'notification_failure':
      return 'notification_failure';
    case 'runtime_recovery':
      return 'session_recovery';
    case 'session_invalidated':
      return 'session_invalidated';
    default:
      return null;
  }
}
