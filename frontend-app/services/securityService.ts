import { request } from '../api/apiClient';
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
  return request<PageResponse<VisitorRecord>>({
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
}

export async function getSecurityVisitorById(id: string) {
  return request<VisitorRecord>({
    url: `/security/visitors/${encodeURIComponent(id)}`,
    method: 'GET',
  });
}

export async function getSecurityVisitorPass(id: string) {
  return request<VisitorPass>({
    url: `/security/visitors/${encodeURIComponent(id)}/pass`,
    method: 'GET',
  });
}

export async function getSecurityMonitoring(query?: string) {
  return request<SecurityMonitoring>({
    url: '/security/monitoring',
    method: 'GET',
    params: query ? { query } : undefined,
  });
}

export async function getSecurityAttendance() {
  return request<EmployeeAttendanceRecord[]>({
    url: '/security/employees/attendance',
    method: 'GET',
  });
}

export async function getSecurityEmployees(query?: string, signal?: AbortSignal) {
  return request<EmployeeDirectoryEntry[]>({
    url: '/security/employees',
    method: 'GET',
    params: query ? { query } : undefined,
    signal,
  });
}

export async function getSecurityHosts(query?: string, signal?: AbortSignal) {
  return request<HostDirectoryEntry[]>({
    url: '/security/hosts',
    method: 'GET',
    params: query ? { query } : undefined,
    signal,
  });
}

export async function verifyQrPayload(qrPayload: string) {
  return request<QrVerificationResult>({
    url: '/security/qr-verification',
    method: 'POST',
    data: {
      qrPayload,
    },
  });
}

export async function checkInWithQr(qrPayload: string) {
  return request<VisitorRecord>({
    url: '/security/qr-check-in',
    method: 'POST',
    data: {
      qrPayload,
    },
  });
}

export async function scanEmployeeQr(qrPayload: string) {
  return request<EmployeeScanResult>({
    url: '/security/employees/qr-scan',
    method: 'POST',
    data: {
      qrPayload,
    },
  });
}

export async function manualEmployeeCheckIn({ employeeId, reason }: OverridePayload) {
  return request<EmployeeAttendanceRecord>({
    url: `/security/employees/${encodeURIComponent(employeeId)}/check-in`,
    method: 'PATCH',
    data: { reason },
  });
}

export async function manualEmployeeCheckOut({ employeeId, reason }: OverridePayload) {
  return request<EmployeeAttendanceRecord>({
    url: `/security/employees/${encodeURIComponent(employeeId)}/check-out`,
    method: 'PATCH',
    data: { reason },
  });
}

export async function createVisitorRegistration(payload: VisitorRegistrationPayload) {
  return request<VisitorRecord>({
    url: '/security/visitors',
    method: 'POST',
    data: payload,
  });
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
  return request<VisitorRecord>({
    url: `/security/visitors/${encodeURIComponent(visitorId)}/check-in`,
    method: 'PATCH',
  });
}

export async function overrideCheckInVisitor({ visitorId, reason }: SecurityIncidentPayload) {
  return request<VisitorRecord>({
    url: `/security/visitors/${encodeURIComponent(visitorId)}/override-check-in`,
    method: 'PATCH',
    data: { reason },
  });
}

export async function checkOutVisitor(visitorId: string) {
  return request<VisitorRecord>({
    url: `/security/visitors/${encodeURIComponent(visitorId)}/check-out`,
    method: 'PATCH',
  });
}

export async function denyVisitorEntry({ visitorId, reason }: SecurityIncidentPayload) {
  return request<VisitorRecord>({
    url: `/security/visitors/${encodeURIComponent(visitorId)}/deny-entry`,
    method: 'PATCH',
    data: { reason },
  });
}

export async function suspendVisitor({ visitorId, reason }: SecurityIncidentPayload) {
  return request<VisitorRecord>({
    url: `/security/visitors/${encodeURIComponent(visitorId)}/suspend`,
    method: 'PATCH',
    data: { reason },
  });
}

export async function revokeVisitor({ visitorId, reason }: SecurityIncidentPayload) {
  return request<VisitorRecord>({
    url: `/security/visitors/${encodeURIComponent(visitorId)}/revoke`,
    method: 'PATCH',
    data: { reason },
  });
}

export async function reactivateVisitor(visitorId: string) {
  return request<VisitorRecord>({
    url: `/security/visitors/${encodeURIComponent(visitorId)}/reactivate`,
    method: 'PATCH',
  });
}

export async function escalateVisitorIssue({ visitorId, reason }: SecurityIncidentPayload) {
  return request<VisitorRecord>({
    url: `/security/visitors/${encodeURIComponent(visitorId)}/escalate`,
    method: 'PATCH',
    data: { reason },
  });
}

export async function reportVisitorMismatch({ visitorId, reason }: SecurityIncidentPayload) {
  return request<VisitorRecord>({
    url: `/security/visitors/${encodeURIComponent(visitorId)}/report-mismatch`,
    method: 'PATCH',
    data: { reason },
  });
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
