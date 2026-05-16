import AsyncStorage from '@react-native-async-storage/async-storage';

import { apiConfig } from '../api/apiConfig';
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
