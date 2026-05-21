import { request } from '../api/apiClient';
import { trackFirebaseEvent } from '../runtime/firebaseRuntime';
import { uploadImage, type UploadAsset } from './uploadService';
import type { PageResponse } from '../types/api';
import type {
  EmployeeAttendanceRecord,
  EmployeeBadge,
  NotificationInbox,
  NotificationRecord,
  SecurityPhotoUpload,
  SecurityOverview,
  UserProfile,
  VisitorInviteRecord,
  VisitorRecord,
} from '../types/domain';

export type EmployeeProfileUpdatePayload = {
  phone?: string | null;
  phoneCountryCode?: string | null;
  emergencyContact?: string | null;
  preferredLanguage?: string | null;
  employeePhotoUrl?: string | null;
  notificationEmailEnabled?: boolean;
  notificationInAppEnabled?: boolean;
};

export type EmployeePasswordUpdatePayload = {
  currentPassword: string;
  newPassword: string;
};

export type VisitorDecisionPayload = {
  note?: string | null;
};

export type VisitorReschedulePayload = {
  scheduledStartTime: string;
  scheduledEndTime?: string | null;
  expectedDurationMinutes?: number | null;
  timezone?: string | null;
  note?: string | null;
};

export type VisitorInviteCreatePayload = {
  visitorName: string;
  visitorEmail?: string | null;
  phoneCountryCode?: string | null;
  visitorPhone?: string | null;
  companyName?: string | null;
  purposeOfVisit: string;
  visitorType?: string | null;
  scheduledStartTime: string;
  scheduledEndTime?: string | null;
  expectedDurationMinutes?: number | null;
  timezone?: string | null;
  approvalRequired?: boolean;
  expiresInHours?: number | null;
  note?: string | null;
};

export async function getEmployeeOverview() {
  return request<SecurityOverview>({
    url: '/employee/overview',
    method: 'GET',
  });
}

export async function getEmployeeBadge() {
  return request<EmployeeBadge>({
    url: '/employee/badge',
    method: 'GET',
  });
}

export async function getEmployeeApprovals() {
  return request<PageResponse<VisitorRecord>>({
    url: '/employee/approvals',
    method: 'GET',
  });
}

export async function getEmployeePreApprovals() {
  return request<VisitorRecord[]>({
    url: '/employee/pre-approvals',
    method: 'GET',
  });
}

export async function getEmployeeVisitorInvites() {
  return request<VisitorInviteRecord[]>({
    url: '/employee/visitor-invites',
    method: 'GET',
  });
}

export async function createEmployeeVisitorInvite(payload: VisitorInviteCreatePayload) {
  const response = await request<VisitorInviteRecord>({
    url: '/employee/visitor-invites',
    method: 'POST',
    data: payload,
  });
  await trackFirebaseEvent('visitor_invite_created', { actor_role: 'EMPLOYEE', approval_required: Boolean(payload.approvalRequired) });
  return response;
}

export async function revokeEmployeeVisitorInvite(inviteId: string, reason: string) {
  const response = await request<VisitorInviteRecord>({
    url: `/employee/visitor-invites/${encodeURIComponent(inviteId)}/revoke`,
    method: 'PATCH',
    data: { reason },
  });
  await trackFirebaseEvent('visitor_invite_revoked', { actor_role: 'EMPLOYEE' });
  return response;
}

export async function getEmployeeAttendance() {
  return request<EmployeeAttendanceRecord[]>({
    url: '/employee/attendance',
    method: 'GET',
  });
}

export async function getEmployeeNotifications(limit = 25) {
  return request<NotificationInbox>({
    url: '/notifications',
    method: 'GET',
    params: {
      limit,
    },
  });
}

export async function getEmployeeProfile() {
  return request<UserProfile>({
    url: '/employee/profile',
    method: 'GET',
  });
}

export async function updateEmployeeProfile(payload: EmployeeProfileUpdatePayload) {
  return request<UserProfile>({
    url: '/employee/profile',
    method: 'PATCH',
    data: payload,
  });
}

export async function updateEmployeePassword(payload: EmployeePasswordUpdatePayload) {
  return request<{ success: boolean }>({
    url: '/employee/profile/password',
    method: 'PATCH',
    data: payload,
  });
}

export async function uploadEmployeeProfilePhoto(asset: UploadAsset) {
  return uploadImage<SecurityPhotoUpload>({
    url: '/employee/profile/photo',
    asset,
    fallbackName: 'employee-photo.jpg',
  });
}

export async function approveEmployeeVisitor(visitorId: string, payload?: VisitorDecisionPayload) {
  const response = await request<VisitorRecord>({
    url: `/employee/visitors/${encodeURIComponent(visitorId)}/approve`,
    method: 'PATCH',
    data: payload ?? {},
  });
  await trackFirebaseEvent('visitor_approval_action', { action: 'approve', actor_role: 'EMPLOYEE' });
  return response;
}

export async function rejectEmployeeVisitor(visitorId: string, payload?: VisitorDecisionPayload) {
  const response = await request<VisitorRecord>({
    url: `/employee/visitors/${encodeURIComponent(visitorId)}/reject`,
    method: 'PATCH',
    data: payload ?? {},
  });
  await trackFirebaseEvent('visitor_approval_action', { action: 'reject', actor_role: 'EMPLOYEE' });
  return response;
}

export async function rescheduleEmployeeVisitor(visitorId: string, payload: VisitorReschedulePayload) {
  return request<VisitorRecord>({
    url: `/employee/visitors/${encodeURIComponent(visitorId)}/reschedule`,
    method: 'PATCH',
    data: payload,
  });
}

export async function markEmployeeNotificationRead(notificationId: string) {
  return request<NotificationInbox>({
    url: `/notifications/${encodeURIComponent(notificationId)}/read`,
    method: 'PATCH',
  });
}

export async function markAllEmployeeNotificationsRead() {
  return request<NotificationInbox>({
    url: '/notifications/read-all',
    method: 'PATCH',
  });
}
