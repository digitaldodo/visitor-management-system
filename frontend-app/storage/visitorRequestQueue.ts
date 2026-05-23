import * as Crypto from 'expo-crypto';

import { readSecureJson, writeSecureJson } from './secureStore';
import type { VisitorVisitPayload } from '../services/visitorService';

const VISITOR_REQUEST_QUEUE_KEY = 'accessflow.mobile.visitor-request-queue.v1';
const MAX_QUEUE_ITEMS = 40;
const MAX_QUEUE_ATTEMPTS = 8;

type QueuedVisitorRequestStatus = 'pending' | 'syncing' | 'failed';

export type QueuedVisitorRequest = {
  id: string;
  clientRequestId: string;
  dedupeKey: string;
  payload: VisitorVisitPayload;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt: string;
  attempts: number;
  status: QueuedVisitorRequestStatus;
  lastError?: string | null;
};

export async function readQueuedVisitorRequests(): Promise<QueuedVisitorRequest[]> {
  const queue = await readSecureJson<QueuedVisitorRequest[]>(VISITOR_REQUEST_QUEUE_KEY);
  return Array.isArray(queue) ? queue : [];
}

export async function enqueueVisitorRequest(payload: VisitorVisitPayload, clientRequestId: string) {
  const now = new Date().toISOString();
  const dedupeKey = visitorRequestDedupeKey(payload);
  const current = await readQueuedVisitorRequests();
  const duplicate = current.find((item) =>
    item.status !== 'failed'
      && (item.clientRequestId === clientRequestId || item.dedupeKey === dedupeKey),
  );

  if (duplicate) {
    return { item: duplicate, duplicate: true };
  }

  const item: QueuedVisitorRequest = {
    id: `visitor-request-${Date.now().toString(36)}-${Crypto.randomUUID().slice(0, 8)}`,
    clientRequestId,
    dedupeKey,
    payload,
    createdAt: now,
    updatedAt: now,
    nextAttemptAt: now,
    attempts: 0,
    status: 'pending',
    lastError: null,
  };

  await writeQueue([item, ...current].slice(0, MAX_QUEUE_ITEMS));
  return { item, duplicate: false };
}

export async function markVisitorRequestSyncing(id: string) {
  await mutateQueue((queue) => queue.map((item) => item.id === id
    ? { ...item, status: 'syncing', updatedAt: new Date().toISOString() }
    : item));
}

export async function markVisitorRequestAttempt(id: string, errorMessage?: string | null, retryAfterMs?: number | null) {
  const now = Date.now();
  await mutateQueue((queue) => queue.map((item) => {
    if (item.id !== id) {
      return item;
    }
    const attempts = item.attempts + 1;
    const nextAttemptDelayMs = retryAfterMs ?? Math.min(10 * 60_000, 20_000 * 2 ** Math.max(0, attempts - 1));
    return {
      ...item,
      attempts,
      updatedAt: new Date(now).toISOString(),
      nextAttemptAt: new Date(now + nextAttemptDelayMs).toISOString(),
      status: attempts >= MAX_QUEUE_ATTEMPTS ? 'failed' : 'pending',
      lastError: errorMessage ?? null,
    };
  }));
}

export async function removeQueuedVisitorRequest(id: string) {
  await mutateQueue((queue) => queue.filter((item) => item.id !== id));
}

function visitorRequestDedupeKey(payload: VisitorVisitPayload) {
  return [
    payload.companyCode || payload.companyName || 'organization',
    payload.hostEmployeeId || payload.hostEmployee || 'host',
    payload.scheduledStartTime || 'start',
    payload.scheduledEndTime || 'end',
    payload.purposeOfVisit,
    payload.photoPublicId,
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .join('|');
}

async function mutateQueue(mutator: (queue: QueuedVisitorRequest[]) => QueuedVisitorRequest[]) {
  await writeQueue(mutator(await readQueuedVisitorRequests()));
}

function writeQueue(queue: QueuedVisitorRequest[]) {
  return writeSecureJson(VISITOR_REQUEST_QUEUE_KEY, queue.slice(0, MAX_QUEUE_ITEMS));
}
