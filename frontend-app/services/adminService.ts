import { request } from '../api/apiClient';
import { trackFirebaseEvent } from '../runtime/firebaseRuntime';
import type { PageResponse } from '../types/api';
import type {
  AdminOperationalReport,
  AdminOperationalAnalytics,
  DepartmentRecord,
  EmployeeAttendanceRecord,
  SecurityPhotoUpload,
  SecurityOverview,
  VisitorRecord,
  WorkforceOnboardingRecord,
} from '../types/domain';
import { uploadImage, type UploadAsset } from './uploadService';

type AdminVisitorParams = {
  query?: string;
  page?: number;
  size?: number;
  status?: string;
  from?: string;
  to?: string;
};

type WorkforceApprovalPayload = {
  role?: string | null;
  department?: string | null;
  designation?: string | null;
  employeeType?: string | null;
  employeePhotoUrl?: string | null;
  shiftName?: string | null;
  shiftStartTime?: string | null;
  shiftEndTime?: string | null;
  note?: string | null;
};

type WorkforceUserPayload = {
  fullName: string;
  username: string;
  email: string;
  password?: string;
  role: string;
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

export type AdminVisitorRegistrationPayload = {
  fullName: string;
  phone: string;
  phoneCountryCode?: string | null;
  email?: string | null;
  companyName?: string | null;
  companyCode?: string | null;
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
  department?: string | null;
  emergencyContact?: string | null;
  notes?: string | null;
};

export type DepartmentCreatePayload = {
  organizationId?: string | null;
  departmentName: string;
};

export type DepartmentUpdatePayload = {
  id: string;
  departmentName?: string | null;
  activeStatus?: boolean;
};

type WorkforceUpdatePayload = Partial<Omit<WorkforceUserPayload, 'password' | 'username'>> & {
  active?: boolean;
  accountStatus?: string;
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

export async function getAdminAnalytics() {
  return request<AdminOperationalAnalytics>({
    url: '/admin/analytics',
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

export async function getAdminDepartments() {
  return request<DepartmentRecord[]>({
    url: '/admin/departments',
    method: 'GET',
    params: {
      includeInactive: true,
    },
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

export async function getAdminWorkforceAnalytics() {
  return request<Record<string, unknown>>({
    url: '/admin/workforce/analytics',
    method: 'GET',
  });
}

export async function getAdminWorkforceAttendance() {
  return request<EmployeeAttendanceRecord[]>({
    url: '/admin/workforce-attendance',
    method: 'GET',
  });
}

export async function createAdminDepartment(payload: DepartmentCreatePayload) {
  return request<DepartmentRecord>({
    url: '/admin/departments',
    method: 'POST',
    data: payload,
  });
}

export async function updateAdminDepartment({ id, ...payload }: DepartmentUpdatePayload) {
  return request<DepartmentRecord>({
    url: `/admin/departments/${encodeURIComponent(id)}`,
    method: 'PATCH',
    data: payload,
  });
}

export async function createAdminVisitor(payload: AdminVisitorRegistrationPayload) {
  const response = await request<VisitorRecord>({
    url: '/admin/visitors',
    method: 'POST',
    data: payload,
  });
  await trackFirebaseEvent('visitor_registered', { actor_role: 'ADMIN', visitor_type: payload.visitorType ?? 'WALK_IN' });
  return response;
}

export async function uploadAdminVisitorPhoto(asset: UploadAsset) {
  return uploadImage<SecurityPhotoUpload>({
    url: '/admin/visitors/photo',
    asset,
    fallbackName: 'admin-visitor-photo.jpg',
  });
}

export async function approveAdminWorkforce({ id, payload }: { id: string; payload?: WorkforceApprovalPayload }) {
  const response = await request<WorkforceOnboardingRecord>({
    url: `/admin/workforce-onboarding/${encodeURIComponent(id)}/approve`,
    method: 'PATCH',
    data: payload ?? {},
  });
  await trackFirebaseEvent('workforce_approval_action', { action: 'approve', actor_role: 'ADMIN' });
  return response;
}

export async function rejectAdminWorkforce({ id, reason }: ReasonPayload) {
  const response = await request<WorkforceOnboardingRecord>({
    url: `/admin/workforce-onboarding/${encodeURIComponent(id)}/reject`,
    method: 'PATCH',
    data: { reason },
  });
  await trackFirebaseEvent('workforce_approval_action', { action: 'reject', actor_role: 'ADMIN' });
  return response;
}

export async function requestAdminWorkforceModification({ id, reason }: ReasonPayload) {
  const response = await request<WorkforceOnboardingRecord>({
    url: `/admin/workforce-onboarding/${encodeURIComponent(id)}/request-modification`,
    method: 'PATCH',
    data: { reason },
  });
  await trackFirebaseEvent('workforce_approval_action', { action: 'request_modification', actor_role: 'ADMIN' });
  return response;
}

export async function approveAdminVisitor({ id, note }: VisitorDecisionPayload) {
  const response = await request<VisitorRecord>({
    url: `/admin/visitors/${encodeURIComponent(id)}/approve`,
    method: 'PATCH',
    data: { note: note ?? null },
  });
  await trackFirebaseEvent('visitor_approval_action', { action: 'approve', actor_role: 'ADMIN' });
  return response;
}

export async function rejectAdminVisitor({ id, note }: VisitorDecisionPayload) {
  const response = await request<VisitorRecord>({
    url: `/admin/visitors/${encodeURIComponent(id)}/reject`,
    method: 'PATCH',
    data: { note: note ?? null },
  });
  await trackFirebaseEvent('visitor_approval_action', { action: 'reject', actor_role: 'ADMIN' });
  return response;
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

export async function revokeAdminVisitor({ id, reason }: ReasonPayload) {
  return request<VisitorRecord>({
    url: `/admin/visitors/${encodeURIComponent(id)}/revoke`,
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

export async function reportAdminVisitorMismatch({ id, reason }: ReasonPayload) {
  return request<VisitorRecord>({
    url: `/admin/visitors/${encodeURIComponent(id)}/report-mismatch`,
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

export async function inviteAdminUser(payload: Omit<WorkforceUserPayload, 'password'>) {
  return request<WorkforceOnboardingRecord>({
    url: '/admin/users/invite',
    method: 'POST',
    data: payload,
  });
}

export async function updateAdminUser({ id, payload }: { id: string; payload: WorkforceUpdatePayload }) {
  return request<WorkforceOnboardingRecord>({
    url: `/admin/users/${encodeURIComponent(id)}`,
    method: 'PUT',
    data: payload,
  });
}

export async function resetAdminUserPassword({ id, newPassword }: { id: string; newPassword: string }) {
  return request<WorkforceOnboardingRecord>({
    url: `/admin/users/${encodeURIComponent(id)}/reset-password`,
    method: 'PATCH',
    data: { newPassword },
  });
}

export async function revokeAdminUserSessions(id: string) {
  return request<WorkforceOnboardingRecord>({
    url: `/admin/users/${encodeURIComponent(id)}/revoke-sessions`,
    method: 'PATCH',
  });
}

export async function resendAdminUserInvite(id: string) {
  return request<WorkforceOnboardingRecord>({
    url: `/admin/users/${encodeURIComponent(id)}/resend-invite`,
    method: 'PATCH',
  });
}

export async function revokeAdminUserInvite(id: string) {
  return request<WorkforceOnboardingRecord>({
    url: `/admin/users/${encodeURIComponent(id)}/revoke-invite`,
    method: 'PATCH',
  });
}

export async function archiveAdminUser(id: string) {
  return request<WorkforceOnboardingRecord>({
    url: `/admin/users/${encodeURIComponent(id)}/archive`,
    method: 'PATCH',
  });
}
