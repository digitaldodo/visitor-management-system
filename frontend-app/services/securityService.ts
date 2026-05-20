import { request } from '../api/apiClient';
import {
  cacheEmployeeScan,
  cacheQrVerification,
  upsertCachedAttendance,
  upsertCachedEmployees,
  upsertCachedHosts,
  upsertCachedVisitors,
  upsertCachedVisitorsFromMonitoring,
} from '../storage/offlineOperationalStore';
import type {
  EmployeeAttendanceRecord,
  EmployeeDirectoryEntry,
  EmployeeScanResult,
  HostDirectoryEntry,
  QrVerificationResult,
  SecurityMonitoring,
  SecurityOverview,
  SecurityPhotoUpload,
  VisitorRecord,
  WorkforceOnboardingRecord,
} from '../types/domain';
import type { PageResponse } from '../types/api';
import type { VisitorPass } from './visitorService';

type UploadAsset = {
  uri: string;
  name?: string;
  type?: string;
};

type SecurityIncidentPayload = {
  visitorId: string;
  reason: string;
};

type VisitorRegistrationPayload = {
  fullName: string;
  phone: string;
  phoneCountryCode?: string | null;
  email?: string | null;
  companyName?: string | null;
  purposeOfVisit: string;
  hostEmployee?: string | null;
  hostEmployeeId?: string | null;
  photoUrl: string;
  photoPublicId: string;
  scheduledStartTime?: string | null;
  scheduledEndTime?: string | null;
  expectedDurationMinutes?: number | null;
  timezone?: string | null;
  visitorType?: string | null;
  vendorCompanyName?: string | null;
  sponsorEmployee?: string | null;
  department?: string | null;
  validityStartDate?: string | null;
  validityEndDate?: string | null;
  recurringSchedule?: string | null;
  allowedWeekdays?: string[] | null;
  allowedEntryStartTime?: string | null;
  allowedEntryEndTime?: string | null;
  emergencyContact?: string | null;
  notes?: string | null;
};

type WorkforceOnboardingPayload = {
  fullName: string;
  username?: string | null;
  email?: string | null;
  department?: string | null;
  phoneCountryCode?: string | null;
  phone?: string | null;
  designation?: string | null;
  employeeType?: string | null;
  employeePhotoUrl?: string | null;
  shiftName?: string | null;
  shiftStartTime?: string | null;
  shiftEndTime?: string | null;
};

type OverridePayload = {
  employeeId: string;
  reason: string;
};

export async function getSecurityOverview() {
  return request<SecurityOverview>({
    url: '/security/overview',
    method: 'GET',
  });
}

export async function getSecurityVisitors(params?: { query?: string; page?: number; size?: number; status?: string; from?: string; to?: string }) {
  const response = await request<PageResponse<VisitorRecord>>({
    url: '/security/visitors',
    method: 'GET',
    params: {
      page: params?.page ?? 0,
      size: params?.size ?? 20,
      query: params?.query,
      status: params?.status,
      from: params?.from,
      to: params?.to,
      sortBy: 'createdAt',
      direction: 'desc',
    },
  });
  await upsertCachedVisitors(response.items, 'security-visitors').catch(() => undefined);
  return response;
}

export async function getSecurityVisitorById(id: string) {
  const visitor = await request<VisitorRecord>({
    url: `/security/visitors/${encodeURIComponent(id)}`,
    method: 'GET',
  });
  await upsertCachedVisitors([visitor], 'security-visitor-detail').catch(() => undefined);
  return visitor;
}

export async function getSecurityVisitorPass(id: string) {
  return request<VisitorPass>({
    url: `/security/visitors/${encodeURIComponent(id)}/pass`,
    method: 'GET',
  });
}

export async function getSecurityMonitoring(query?: string) {
  const monitoring = await request<SecurityMonitoring>({
    url: '/security/monitoring',
    method: 'GET',
    params: query ? { query } : undefined,
  });
  await upsertCachedVisitorsFromMonitoring(monitoring).catch(() => undefined);
  return monitoring;
}

export async function getSecurityAttendance() {
  const attendance = await request<EmployeeAttendanceRecord[]>({
    url: '/security/employees/attendance',
    method: 'GET',
  });
  await upsertCachedAttendance(attendance).catch(() => undefined);
  return attendance;
}

export async function getSecurityEmployees(query?: string, signal?: AbortSignal) {
  const employees = await request<EmployeeDirectoryEntry[]>({
    url: '/security/employees',
    method: 'GET',
    params: query ? { query } : undefined,
    signal,
  });
  await upsertCachedEmployees(employees, 'security-employees').catch(() => undefined);
  return employees;
}

export async function getSecurityHosts(query?: string, signal?: AbortSignal) {
  const hosts = await request<HostDirectoryEntry[]>({
    url: '/security/hosts',
    method: 'GET',
    params: query ? { query } : undefined,
    signal,
  });
  await upsertCachedHosts(hosts).catch(() => undefined);
  return hosts;
}

export async function verifyQrPayload(qrPayload: string, clientOperationId?: string) {
  const result = await request<QrVerificationResult>({
    url: '/security/qr-verification',
    method: 'POST',
    data: {
      qrPayload,
    },
    headers: idempotencyHeaders(clientOperationId),
  });
  await cacheQrVerification(qrPayload, result).catch(() => undefined);
  return result;
}

export async function checkInWithQr(qrPayload: string, clientOperationId?: string) {
  const visitor = await request<VisitorRecord>({
    url: '/security/qr-check-in',
    method: 'POST',
    data: {
      qrPayload,
    },
    headers: idempotencyHeaders(clientOperationId),
  });
  await upsertCachedVisitors([visitor], 'security-qr-check-in').catch(() => undefined);
  return visitor;
}

export async function scanEmployeeQr(qrPayload: string, clientOperationId?: string) {
  const result = await request<EmployeeScanResult>({
    url: '/security/employees/qr-scan',
    method: 'POST',
    data: {
      qrPayload,
    },
    headers: idempotencyHeaders(clientOperationId),
  });
  await cacheEmployeeScan(qrPayload, result).catch(() => undefined);
  return result;
}

export async function manualEmployeeCheckIn({ employeeId, reason }: OverridePayload) {
  const record = await request<EmployeeAttendanceRecord>({
    url: `/security/employees/${encodeURIComponent(employeeId)}/check-in`,
    method: 'PATCH',
    data: { reason },
  });
  await upsertCachedAttendance([record]).catch(() => undefined);
  return record;
}

export async function manualEmployeeCheckOut({ employeeId, reason }: OverridePayload) {
  const record = await request<EmployeeAttendanceRecord>({
    url: `/security/employees/${encodeURIComponent(employeeId)}/check-out`,
    method: 'PATCH',
    data: { reason },
  });
  await upsertCachedAttendance([record]).catch(() => undefined);
  return record;
}

export async function createVisitorRegistration(payload: VisitorRegistrationPayload) {
  const visitor = await request<VisitorRecord>({
    url: '/security/visitors',
    method: 'POST',
    data: payload,
  });
  await upsertCachedVisitors([visitor], 'security-create-visitor').catch(() => undefined);
  return visitor;
}

export async function uploadVisitorPhoto(asset: UploadAsset) {
  const formData = createUploadFormData(asset);
  return request<SecurityPhotoUpload>({
    url: '/security/visitors/photo',
    method: 'POST',
    data: formData,
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
}

export async function uploadWorkforcePhoto(asset: UploadAsset) {
  const formData = createUploadFormData(asset);
  return request<SecurityPhotoUpload>({
    url: '/security/workforce-onboarding/photo',
    method: 'POST',
    data: formData,
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
}

export async function createWorkforceOnboarding(payload: WorkforceOnboardingPayload) {
  return request<WorkforceOnboardingRecord>({
    url: '/security/workforce-onboarding',
    method: 'POST',
    data: payload,
  });
}

export async function checkInVisitor(visitorId: string) {
  const visitor = await request<VisitorRecord>({
    url: `/security/visitors/${encodeURIComponent(visitorId)}/check-in`,
    method: 'PATCH',
  });
  await upsertCachedVisitors([visitor], 'security-check-in').catch(() => undefined);
  return visitor;
}

export async function overrideCheckInVisitor({ visitorId, reason }: SecurityIncidentPayload) {
  const visitor = await request<VisitorRecord>({
    url: `/security/visitors/${encodeURIComponent(visitorId)}/override-check-in`,
    method: 'PATCH',
    data: { reason },
  });
  await upsertCachedVisitors([visitor], 'security-override').catch(() => undefined);
  return visitor;
}

export async function checkOutVisitor(visitorId: string, clientOperationId?: string) {
  const visitor = await request<VisitorRecord>({
    url: `/security/visitors/${encodeURIComponent(visitorId)}/check-out`,
    method: 'PATCH',
    headers: idempotencyHeaders(clientOperationId),
  });
  await upsertCachedVisitors([visitor], 'security-check-out').catch(() => undefined);
  return visitor;
}

export async function denyVisitorEntry({ visitorId, reason }: SecurityIncidentPayload) {
  const visitor = await request<VisitorRecord>({
    url: `/security/visitors/${encodeURIComponent(visitorId)}/deny-entry`,
    method: 'PATCH',
    data: { reason },
  });
  await upsertCachedVisitors([visitor], 'security-deny').catch(() => undefined);
  return visitor;
}

export async function suspendVisitor({ visitorId, reason }: SecurityIncidentPayload) {
  const visitor = await request<VisitorRecord>({
    url: `/security/visitors/${encodeURIComponent(visitorId)}/suspend`,
    method: 'PATCH',
    data: { reason },
  });
  await upsertCachedVisitors([visitor], 'security-suspend').catch(() => undefined);
  return visitor;
}

export async function revokeVisitor({ visitorId, reason }: SecurityIncidentPayload) {
  const visitor = await request<VisitorRecord>({
    url: `/security/visitors/${encodeURIComponent(visitorId)}/revoke`,
    method: 'PATCH',
    data: { reason },
  });
  await upsertCachedVisitors([visitor], 'security-revoke').catch(() => undefined);
  return visitor;
}

export async function reactivateVisitor(visitorId: string) {
  const visitor = await request<VisitorRecord>({
    url: `/security/visitors/${encodeURIComponent(visitorId)}/reactivate`,
    method: 'PATCH',
  });
  await upsertCachedVisitors([visitor], 'security-reactivate').catch(() => undefined);
  return visitor;
}

export async function escalateVisitorIssue({ visitorId, reason }: SecurityIncidentPayload) {
  const visitor = await request<VisitorRecord>({
    url: `/security/visitors/${encodeURIComponent(visitorId)}/escalate`,
    method: 'PATCH',
    data: { reason },
  });
  await upsertCachedVisitors([visitor], 'security-escalate').catch(() => undefined);
  return visitor;
}

export async function reportVisitorMismatch({ visitorId, reason }: SecurityIncidentPayload) {
  const visitor = await request<VisitorRecord>({
    url: `/security/visitors/${encodeURIComponent(visitorId)}/report-mismatch`,
    method: 'PATCH',
    data: { reason },
  });
  await upsertCachedVisitors([visitor], 'security-mismatch').catch(() => undefined);
  return visitor;
}

function createUploadFormData(asset: UploadAsset) {
  const formData = new FormData();
  formData.append('file', {
    uri: asset.uri,
    name: asset.name ?? 'capture.jpg',
    type: asset.type ?? 'image/jpeg',
  } as unknown as Blob);
  return formData;
}

function idempotencyHeaders(clientOperationId?: string) {
  return clientOperationId
    ? {
        'X-AccessFlow-Operation-Id': clientOperationId,
        'Idempotency-Key': clientOperationId,
      }
    : undefined;
}
