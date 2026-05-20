import {
  checkInWithQr,
  checkOutVisitor,
  scanEmployeeQr,
  verifyQrPayload,
} from './securityService';
import {
  markOfflineOperationAttempt,
  markOfflineOperationSyncing,
  readOfflineOperationalQueue,
  removeOfflineOperation,
} from '../storage/offlineOperationalStore';
import { recordDiagnosticEvent } from '../runtime/diagnostics';
import { recordOperationalMetric } from '../runtime/telemetry';
import type { OfflineOperationalQueueItem } from '../types/runtime';

const SYNC_BATCH_SIZE = 12;

export type OfflineSyncSummary = {
  attempted: number;
  synced: number;
  failed: number;
  remaining: number;
};

export async function syncOfflineOperationalQueue(): Promise<OfflineSyncSummary> {
  const queue = (await readOfflineOperationalQueue())
    .filter((item) => item.status !== 'failed')
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
    .slice(0, SYNC_BATCH_SIZE);

  let synced = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      await markOfflineOperationSyncing(item.id);
      await executeQueuedOperation(item);
      await removeOfflineOperation(item.id);
      synced += 1;
      await recordOperationalMetric({
        name: 'offline_operation_synced',
        tags: {
          operationType: item.operationType,
          attempts: item.attempts + 1,
        },
      });
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : 'Offline operation sync failed.';
      await markOfflineOperationAttempt(item.id, message);
      await recordDiagnosticEvent({
        level: 'warn',
        scope: 'sync',
        code: 'OFFLINE_OPERATION_SYNC_FAILED',
        message,
        context: {
          operationType: item.operationType,
          operationId: item.clientOperationId,
          attempts: item.attempts + 1,
        },
      });
      if (isLikelyNetworkFailure(error)) {
        break;
      }
    }
  }

  return {
    attempted: queue.length,
    synced,
    failed,
    remaining: (await readOfflineOperationalQueue()).filter((item) => item.status !== 'failed').length,
  };
}

async function executeQueuedOperation(item: OfflineOperationalQueueItem) {
  const payload = item.qrPayload?.trim();
  switch (item.operationType) {
    case 'visitor-qr-check-in':
      if (!payload) {
        throw new Error('Queued visitor check-in is missing its QR payload.');
      }
      await checkInWithQr(payload, item.clientOperationId);
      return;
    case 'visitor-check-out':
      if (!item.targetId) {
        throw new Error('Queued visitor check-out is missing the visitor id.');
      }
      await checkOutVisitor(item.targetId, item.clientOperationId);
      return;
    case 'visitor-qr-verify':
      if (!payload) {
        throw new Error('Queued visitor verification is missing its QR payload.');
      }
      await verifyQrPayload(payload, item.clientOperationId);
      return;
    case 'employee-qr-scan':
      if (!payload) {
        throw new Error('Queued workforce scan is missing its QR payload.');
      }
      await scanEmployeeQr(payload, item.clientOperationId);
      return;
  }
}

function isLikelyNetworkFailure(error: unknown) {
  return Boolean(
    error
      && typeof error === 'object'
      && 'kind' in error
      && String((error as { kind?: string }).kind) === 'network',
  );
}
