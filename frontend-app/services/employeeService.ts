import { request } from '../api/apiClient';
import type { PageResponse } from '../types/api';
import type {
  EmployeeAttendanceRecord,
  EmployeeBadge,
  NotificationInbox,
  NotificationRecord,
  SecurityPhotoUpload,
  SecurityOverview,
  UserProfile,
  VisitorRecord,
} from '../types/domain';

type UploadAsset = {
  uri: string;
  name?: string;
  type?: string;
};

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
  const formData = createUploadFormData(asset);
  return request<SecurityPhotoUpload>({
    url: '/employee/profile/photo',
    method: 'POST',
    data: formData,
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
}

export async function approveEmployeeVisitor(visitorId: string, payload?: VisitorDecisionPayload) {
  return request<VisitorRecord>({
    url: `/employee/visitors/${encodeURIComponent(visitorId)}/approve`,
    method: 'PATCH',
    data: payload ?? {},
  });
}

export async function rejectEmployeeVisitor(visitorId: string, payload?: VisitorDecisionPayload) {
  return request<VisitorRecord>({
    url: `/employee/visitors/${encodeURIComponent(visitorId)}/reject`,
    method: 'PATCH',
    data: payload ?? {},
  });
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

function createUploadFormData(asset: UploadAsset) {
  const formData = new FormData();
  formData.append('file', {
    uri: asset.uri,
    name: asset.name ?? 'employee-photo.jpg',
    type: asset.type ?? 'image/jpeg',
  } as unknown as Blob);
  return formData;
}
