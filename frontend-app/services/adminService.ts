import { request } from '../api/apiClient';
import type { PageResponse } from '../types/api';
import type {
  AdminOperationalReport,
  EmployeeAttendanceRecord,
  SecurityOverview,
  VisitorRecord,
  WorkforceOnboardingRecord,
} from '../types/domain';

type AdminVisitorParams = {
  query?: string;
  page?: number;
  size?: number;
  status?: string;
  from?: string;
  to?: string;
};

type WorkforceApprovalPayload = {
  department?: string | null;
  designation?: string | null;
  employeeType?: string | null;
  employeePhotoUrl?: string | null;
  shiftName?: string | null;
  shiftStartTime?: string | null;
  shiftEndTime?: string | null;
  note?: string | null;
};

type ReasonPayload = {
  id: string;
  reason: string;
};

type VisitorDecisionPayload = {
  id: string;
  note?: string | null;
};

export async function getAdminOverview() {
  return request<SecurityOverview>({
    url: '/admin/overview',
    method: 'GET',
  });
}

export async function getAdminWorkforceOnboarding() {
  return request<WorkforceOnboardingRecord[]>({
    url: '/admin/workforce-onboarding',
    method: 'GET',
  });
}

export async function getAdminReports() {
  return request<AdminOperationalReport[]>({
    url: '/admin/reports',
    method: 'GET',
  });
}

export async function getAdminVisitors(params?: AdminVisitorParams) {
  return request<PageResponse<VisitorRecord>>({
    url: '/admin/visitors',
    method: 'GET',
    params: {
      page: params?.page ?? 0,
      size: params?.size ?? 24,
      query: params?.query,
      status: params?.status,
      from: params?.from,
      to: params?.to,
      sortBy: 'createdAt',
      direction: 'desc',
    },
  });
}

export async function getAdminUsers() {
  return request<WorkforceOnboardingRecord[]>({
    url: '/admin/users',
    method: 'GET',
  });
}

export async function getAdminWorkforceAttendance() {
  return request<EmployeeAttendanceRecord[]>({
    url: '/admin/workforce-attendance',
    method: 'GET',
  });
}

export async function approveAdminWorkforce({ id, payload }: { id: string; payload?: WorkforceApprovalPayload }) {
  return request<WorkforceOnboardingRecord>({
    url: `/admin/workforce-onboarding/${encodeURIComponent(id)}/approve`,
    method: 'PATCH',
    data: payload ?? {},
  });
}

export async function rejectAdminWorkforce({ id, reason }: ReasonPayload) {
  return request<WorkforceOnboardingRecord>({
    url: `/admin/workforce-onboarding/${encodeURIComponent(id)}/reject`,
    method: 'PATCH',
    data: { reason },
  });
}

export async function approveAdminVisitor({ id, note }: VisitorDecisionPayload) {
  return request<VisitorRecord>({
    url: `/admin/visitors/${encodeURIComponent(id)}/approve`,
    method: 'PATCH',
    data: { note: note ?? null },
  });
}

export async function rejectAdminVisitor({ id, note }: VisitorDecisionPayload) {
  return request<VisitorRecord>({
    url: `/admin/visitors/${encodeURIComponent(id)}/reject`,
    method: 'PATCH',
    data: { note: note ?? null },
  });
}

export async function checkInAdminVisitor(id: string) {
  return request<VisitorRecord>({
    url: `/admin/visitors/${encodeURIComponent(id)}/check-in`,
    method: 'PATCH',
  });
}

export async function checkOutAdminVisitor(id: string) {
  return request<VisitorRecord>({
    url: `/admin/visitors/${encodeURIComponent(id)}/check-out`,
    method: 'PATCH',
  });
}

export async function denyAdminVisitor({ id, reason }: ReasonPayload) {
  return request<VisitorRecord>({
    url: `/admin/visitors/${encodeURIComponent(id)}/deny-entry`,
    method: 'PATCH',
    data: { reason },
  });
}

export async function suspendAdminVisitor({ id, reason }: ReasonPayload) {
  return request<VisitorRecord>({
    url: `/admin/visitors/${encodeURIComponent(id)}/suspend`,
    method: 'PATCH',
    data: { reason },
  });
}

export async function reactivateAdminVisitor(id: string) {
  return request<VisitorRecord>({
    url: `/admin/visitors/${encodeURIComponent(id)}/reactivate`,
    method: 'PATCH',
  });
}

export async function escalateAdminVisitor({ id, reason }: ReasonPayload) {
  return request<VisitorRecord>({
    url: `/admin/visitors/${encodeURIComponent(id)}/escalate`,
    method: 'PATCH',
    data: { reason },
  });
}

export async function disableAdminUser(id: string) {
  return request<WorkforceOnboardingRecord>({
    url: `/admin/users/${encodeURIComponent(id)}/disable`,
    method: 'PATCH',
  });
}

export async function enableAdminUser(id: string) {
  return request<WorkforceOnboardingRecord>({
    url: `/admin/users/${encodeURIComponent(id)}/enable`,
    method: 'PATCH',
  });
}
