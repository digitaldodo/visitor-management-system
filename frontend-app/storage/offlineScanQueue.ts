import type { OfflineScanQueueItem } from '../types/runtime';
import {
  enqueueOfflineOperation,
  fingerprintPayload,
  markOfflineOperationAttempt,
  readOfflineOperationalQueue,
  removeOfflineOperation,
} from './offlineOperationalStore';

export async function readOfflineScanQueue() {
  const operations = await readOfflineOperationalQueue();
  return operations.map((item) => ({
    id: item.id,
    payload: item.qrPayload ?? '',
    payloadFingerprint: item.payloadFingerprint ?? '',
    kind: item.kind,
    createdAt: item.createdAt,
    attempts: item.attempts,
    lastError: item.lastError ?? null,
  } satisfies OfflineScanQueueItem));
}

export async function enqueueOfflineScan(payload: string, kind: OfflineScanQueueItem['kind']) {
  const normalized = payload.trim();
  const queued = await enqueueOfflineOperation({
    operationType: kind === 'employee' ? 'employee-qr-scan' : 'visitor-qr-verify',
    kind,
    qrPayload: normalized,
    payloadFingerprint: fingerprintPayload(normalized),
    dedupeKey: `scan:${kind}:${fingerprintPayload(normalized)}`,
  });

  return {
    id: queued.item.id,
    payload: normalized,
    payloadFingerprint: queued.item.payloadFingerprint ?? fingerprintPayload(normalized),
    kind: queued.item.kind,
    createdAt: queued.item.createdAt,
    attempts: queued.item.attempts,
    lastError: queued.item.lastError ?? null,
  } satisfies OfflineScanQueueItem;
}

export async function removeOfflineScan(id: string) {
  await removeOfflineOperation(id);
}

export async function markOfflineScanAttempt(id: string, errorMessage?: string | null) {
  await markOfflineOperationAttempt(id, errorMessage);
}
