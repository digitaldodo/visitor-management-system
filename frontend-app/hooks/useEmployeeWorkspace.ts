import { useMutation, useQuery } from '@tanstack/react-query';

import {
  approveEmployeeVisitor,
  createEmployeeVisitorInvite,
  getEmployeeApprovals,
  getEmployeeAttendance,
  getEmployeeBadge,
  getEmployeeNotifications,
  getEmployeeOverview,
  getEmployeePreApprovals,
  getEmployeeVisitorInvites,
  getEmployeeProfile,
  markAllEmployeeNotificationsRead,
  markEmployeeNotificationRead,
  rejectEmployeeVisitor,
  revokeEmployeeVisitorInvite,
  rescheduleEmployeeVisitor,
  updateEmployeePassword,
  updateEmployeeProfile,
  uploadEmployeeProfilePhoto,
} from '../services/employeeService';

export function useEmployeeOverview() {
  return useQuery({
    queryKey: ['employee', 'overview'],
    queryFn: getEmployeeOverview,
    placeholderData: (previous) => previous,
  });
}

export function useEmployeeBadge() {
  return useQuery({
    queryKey: ['employee', 'badge'],
    queryFn: getEmployeeBadge,
    placeholderData: (previous) => previous,
    refetchInterval: (query) => {
      const intervalSeconds = query.state.data?.qrRefreshIntervalSeconds ?? 60;
      return Math.max(20, intervalSeconds - 10) * 1000;
    },
    refetchIntervalInBackground: false,
    staleTime: 15_000,
  });
}

export function useEmployeeApprovals() {
  return useQuery({
    queryKey: ['employee', 'approvals'],
    queryFn: getEmployeeApprovals,
    placeholderData: (previous) => previous,
  });
}

export function useEmployeePreApprovals() {
  return useQuery({
    queryKey: ['employee', 'pre-approvals'],
    queryFn: getEmployeePreApprovals,
    placeholderData: (previous) => previous,
  });
}

export function useEmployeeVisitorInvites() {
  return useQuery({
    queryKey: ['employee', 'visitor-invites'],
    queryFn: getEmployeeVisitorInvites,
    placeholderData: (previous) => previous,
  });
}

export function useCreateEmployeeVisitorInviteMutation() {
  return useMutation({
    mutationFn: createEmployeeVisitorInvite,
  });
}

export function useRevokeEmployeeVisitorInviteMutation() {
  return useMutation({
    mutationFn: ({ inviteId, reason }: { inviteId: string; reason: string }) =>
      revokeEmployeeVisitorInvite(inviteId, reason),
  });
}

export function useEmployeeAttendance() {
  return useQuery({
    queryKey: ['employee', 'attendance'],
    queryFn: getEmployeeAttendance,
    placeholderData: (previous) => previous,
  });
}

export function useEmployeeNotifications(limit = 25) {
  return useQuery({
    queryKey: ['employee', 'notifications', limit],
    queryFn: () => getEmployeeNotifications(limit),
    placeholderData: (previous) => previous,
  });
}

export function useEmployeeProfile() {
  return useQuery({
    queryKey: ['employee', 'profile'],
    queryFn: getEmployeeProfile,
    placeholderData: (previous) => previous,
  });
}

export function useUpdateEmployeeProfileMutation() {
  return useMutation({
    mutationFn: updateEmployeeProfile,
  });
}

export function useUpdateEmployeePasswordMutation() {
  return useMutation({
    mutationFn: updateEmployeePassword,
  });
}

export function useUploadEmployeeProfilePhotoMutation() {
  return useMutation({
    mutationFn: uploadEmployeeProfilePhoto,
  });
}

export function useApproveEmployeeVisitorMutation() {
  return useMutation({
    mutationFn: ({ visitorId, note }: { visitorId: string; note?: string | null }) =>
      approveEmployeeVisitor(visitorId, note ? { note } : undefined),
  });
}

export function useRejectEmployeeVisitorMutation() {
  return useMutation({
    mutationFn: ({ visitorId, note }: { visitorId: string; note?: string | null }) =>
      rejectEmployeeVisitor(visitorId, note ? { note } : undefined),
  });
}

export function useRescheduleEmployeeVisitorMutation() {
  return useMutation({
    mutationFn: ({ visitorId, payload }: { visitorId: string; payload: Parameters<typeof rescheduleEmployeeVisitor>[1] }) =>
      rescheduleEmployeeVisitor(visitorId, payload),
  });
}

export function useMarkEmployeeNotificationReadMutation() {
  return useMutation({
    mutationFn: markEmployeeNotificationRead,
  });
}

export function useMarkAllEmployeeNotificationsReadMutation() {
  return useMutation({
    mutationFn: markAllEmployeeNotificationsRead,
  });
}
