import { request } from '../api/apiClient';
import type { PageResponse } from '../types/api';
import type {
  EmployeeAttendanceRecord,
  EmployeeBadge,
  NotificationRecord,
  SecurityOverview,
  UserProfile,
  VisitorRecord,
} from '../types/domain';

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

export async function getEmployeeNotifications() {
  return request<NotificationRecord[]>({
    url: '/employee/notifications',
    method: 'GET',
  });
}

export async function getEmployeeProfile() {
  return request<UserProfile>({
    url: '/employee/profile',
    method: 'GET',
  });
}
