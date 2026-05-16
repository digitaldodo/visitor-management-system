import AsyncStorage from '@react-native-async-storage/async-storage';

import type { OfflineScanQueueItem } from '../types/runtime';

const OFFLINE_SCAN_QUEUE_KEY = 'accessflow.mobile.offline-scan-queue';
const MAX_QUEUE_ITEMS = 25;

export async function readOfflineScanQueue() {
  const rawValue = await AsyncStorage.getItem(OFFLINE_SCAN_QUEUE_KEY);
  if (!rawValue) {
    return [] as OfflineScanQueueItem[];
  }

  try {
    const parsed = JSON.parse(rawValue) as OfflineScanQueueItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    await AsyncStorage.removeItem(OFFLINE_SCAN_QUEUE_KEY);
    return [];
  }
}

export async function enqueueOfflineScan(payload: string, kind: OfflineScanQueueItem['kind']) {
  const normalized = payload.trim();
  const item: OfflineScanQueueItem = {
    id: `scan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    payload: normalized,
    payloadFingerprint: fingerprintPayload(normalized),
    kind,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
  };

  const current = await readOfflineScanQueue();
  const withoutDuplicate = current.filter((entry) => entry.payloadFingerprint !== item.payloadFingerprint);
  const nextQueue = [item, ...withoutDuplicate].slice(0, MAX_QUEUE_ITEMS);
  await AsyncStorage.setItem(OFFLINE_SCAN_QUEUE_KEY, JSON.stringify(nextQueue));
  return item;
}

export async function removeOfflineScan(id: string) {
  const nextQueue = (await readOfflineScanQueue()).filter((item) => item.id !== id);
  await AsyncStorage.setItem(OFFLINE_SCAN_QUEUE_KEY, JSON.stringify(nextQueue));
}

export async function markOfflineScanAttempt(id: string, errorMessage?: string | null) {
  const nextQueue = (await readOfflineScanQueue()).map((item) => item.id === id
    ? { ...item, attempts: item.attempts + 1, lastError: errorMessage ?? null }
    : item);
  await AsyncStorage.setItem(OFFLINE_SCAN_QUEUE_KEY, JSON.stringify(nextQueue));
}

function fingerprintPayload(payload: string) {
  let hash = 0;
  for (let index = 0; index < payload.length; index += 1) {
    hash = ((hash << 5) - hash + payload.charCodeAt(index)) | 0;
  }
  return `qr-${Math.abs(hash).toString(36)}-${payload.length}`;
}
