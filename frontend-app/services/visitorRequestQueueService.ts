import { recordDiagnosticEvent } from '../runtime/diagnostics';
import {
  markVisitorRequestAttempt,
  markVisitorRequestSyncing,
  readQueuedVisitorRequests,
  removeQueuedVisitorRequest,
} from '../storage/visitorRequestQueue';
import { requestVisitorVisit } from './visitorService';
import type { AppError } from '../types/api';

const VISITOR_REQUEST_SYNC_BATCH_SIZE = 4;

export async function syncQueuedVisitorRequests() {
  try {
    const now = Date.now();
    const dueRequests = (await readQueuedVisitorRequests())
      .filter((item) => item.status !== 'failed')
      .filter((item) => Date.parse(item.nextAttemptAt) <= now)
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
      .slice(0, VISITOR_REQUEST_SYNC_BATCH_SIZE);

    for (const item of dueRequests) {
      try {
        await markVisitorRequestSyncing(item.id);
        await requestVisitorVisit(item.payload, item.clientRequestId);
        await removeQueuedVisitorRequest(item.id);
      } catch (error) {
        const appError = error as Partial<AppError>;
        await markVisitorRequestAttempt(
          item.id,
          error instanceof Error ? error.message : 'Visitor request sync failed.',
          typeof appError.retryAfterMs === 'number' ? appError.retryAfterMs : null,
        );
        await recordDiagnosticEvent({
          level: isTransientFailure(error) ? 'warn' : 'error',
          scope: 'sync',
          code: 'VISITOR_REQUEST_QUEUE_SYNC_FAILED',
          message: error instanceof Error ? error.message : 'Visitor request sync failed.',
          context: {
            status: appError.status ?? null,
            attempts: item.attempts + 1,
          },
        });
        if (isTransientFailure(error)) {
          break;
        }
      }
    }
  } catch (error) {
    await recordDiagnosticEvent({
      level: 'warn',
      scope: 'sync',
      code: 'VISITOR_REQUEST_QUEUE_UNAVAILABLE',
      message: error instanceof Error ? error.message : 'Visitor request queue could not be processed.',
    });
  }
}

export function isTransientVisitorRequestFailure(error: unknown) {
  return isTransientFailure(error);
}

function isTransientFailure(error: unknown) {
  const appError = error as Partial<AppError>;
  return appError.kind === 'network'
    || appError.status === 408
    || appError.status === 429
    || Boolean(appError.status && appError.status >= 500)
    || Boolean(appError.recoverable && appError.kind === 'http');
}
