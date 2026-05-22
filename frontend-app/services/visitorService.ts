import { publicRequest, request } from '../api/apiClient';
import { uploadImage, type UploadAsset } from './uploadService';
import type { VisitorRegisterPayload } from '../types/auth';
import type { HostDirectoryEntry, NotificationInbox, SecurityPhotoUpload, VisitorInviteRecord, VisitorRecord } from '../types/domain';

export type VisitorOverview = {
  name?: string | null;
  email?: string | null;
  organizationName?: string | null;
  organizationCode?: string | null;
  pending?: number;
  activePasses?: number;
  totalRequests?: number;
};

export type VisitorHistorySummary = {
  fullName?: string | null;
  companyName?: string | null;
  organizationName?: string | null;
  totalVisits: number;
  repeatVisits: number;
  approvedVisits: number;
  checkedInVisits: number;
  checkedOutVisits: number;
  rejectedVisits: number;
  expiredVisits: number;
  firstVisitAt?: string | null;
  lastVisitAt?: string | null;
  previousHosts?: string[] | null;
  records?: VisitorRecord[] | null;
};

export type VisitorPass = {
  visitorId: string;
  badgeId?: string | null;
  fullName?: string | null;
  companyName?: string | null;
  organizationName?: string | null;
  organizationCode?: string | null;
  organizationTimezone?: string | null;
  purposeOfVisit?: string | null;
  hostEmployee?: string | null;
  photoUrl?: string | null;
  status?: VisitorRecord['status'] | null;
  statusLabel?: string | null;
  checkInState?: string | null;
  valid?: boolean;
  validityStatus?: string | null;
  passCode?: string | null;
  qrPayload?: string | null;
  verificationUrl?: string | null;
  qrImageDataUri?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  approvedAt?: string | null;
  scheduledStartTime?: string | null;
  scheduledEndTime?: string | null;
  accessWindowStartTime?: string | null;
  accessWindowEndTime?: string | null;
  expectedDurationMinutes?: number | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
};

export type VisitorVisitPayload = {
  clientRequestId?: string | null;
  phoneCountryCode?: string | null;
  phone?: string | null;
  companyName?: string | null;
  companyCode?: string | null;
  purposeOfVisit: string;
  hostEmployee?: string | null;
  hostEmployeeId?: string | null;
  scheduledStartTime?: string | null;
  scheduledEndTime?: string | null;
  expectedDurationMinutes?: number | null;
  timezone?: string | null;
  photoUrl: string;
  photoPublicId: string;
};

export async function registerVisitorAccount(payload: VisitorRegisterPayload) {
  return publicRequest<{ verificationId?: string; email?: string }>({
    url: '/auth/register',
    method: 'POST',
    data: {
      fullName: payload.fullName.trim(),
      username: payload.username.trim(),
      email: payload.email.trim(),
      password: payload.password,
      phone: payload.phone?.trim() || null,
      phoneCountryCode: payload.phoneCountryCode?.trim() || null,
    },
  });
}

export async function getVisitorOverview() {
  return request<VisitorOverview>({
    url: '/visitor/overview',
    method: 'GET',
  });
}

export async function getVisitorVisits() {
  return request<VisitorRecord[]>({
    url: '/visitor/visits',
    method: 'GET',
  });
}

export async function getVisitorInvites() {
  return request<VisitorInviteRecord[]>({
    url: '/visitor/invites',
    method: 'GET',
  });
}

export async function getVisitorHistory() {
  return request<VisitorHistorySummary>({
    url: '/visitor/history',
    method: 'GET',
  });
}

export async function getVisitorHosts(query?: string, companyCode?: string, signal?: AbortSignal) {
  return request<HostDirectoryEntry[]>({
    url: '/visitor/hosts',
    method: 'GET',
    params: {
      query,
      companyCode,
    },
    signal,
  });
}

export async function requestVisitorVisit(payload: VisitorVisitPayload, clientRequestId?: string) {
  const operationId = clientRequestId || payload.clientRequestId || undefined;
  return request<VisitorRecord>({
    url: '/visitor/visits',
    method: 'POST',
    accessFlowMaxNetworkRetries: 1,
    data: {
      ...payload,
      clientRequestId: operationId,
    },
    headers: idempotencyHeaders(operationId),
  });
}

export async function uploadVisitorVisitPhoto(asset: UploadAsset) {
  return uploadImage<SecurityPhotoUpload>({
    url: '/visitor/visits/photo',
    asset,
    fallbackName: 'visitor-visit-photo.jpg',
  });
}

export async function getVisitorPass(visitorId: string) {
  return request<VisitorPass>({
    url: `/visitor/visits/${encodeURIComponent(visitorId)}/pass`,
    method: 'GET',
  });
}

export async function requestVisitorReschedule(
  visitorId: string,
  payload: { scheduledStartTime: string; scheduledEndTime?: string | null; expectedDurationMinutes?: number | null; timezone?: string | null; note?: string | null },
) {
  return request<VisitorRecord>({
    url: `/visitor/visits/${encodeURIComponent(visitorId)}/reschedule-request`,
    method: 'POST',
    data: payload,
  });
}

export async function getVisitorNotifications(limit = 25) {
  return request<NotificationInbox>({
    url: '/notifications',
    method: 'GET',
    params: { limit },
  });
}

function idempotencyHeaders(clientOperationId?: string) {
  return clientOperationId
    ? {
        'X-AccessFlow-Operation-Id': clientOperationId,
        'Idempotency-Key': clientOperationId,
      }
    : undefined;
}
