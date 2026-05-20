import { useMutation, useQuery } from '@tanstack/react-query';

import {
  approveAdminVisitor,
  approveAdminWorkforce,
  checkInAdminVisitor,
  checkOutAdminVisitor,
  denyAdminVisitor,
  disableAdminUser,
  enableAdminUser,
  getAdminAnalytics,
  escalateAdminVisitor,
  getAdminOverview,
  getAdminReports,
  getAdminUsers,
  getAdminVisitors,
  getAdminWorkforceAttendance,
  getAdminWorkforceOnboarding,
  reactivateAdminVisitor,
  rejectAdminVisitor,
  rejectAdminWorkforce,
  suspendAdminVisitor,
} from '../services/adminService';

export function useAdminOverview() {
  return useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: getAdminOverview,
    placeholderData: (previous) => previous,
  });
}

export function useAdminAnalytics() {
  return useQuery({
    queryKey: ['admin', 'analytics'],
    queryFn: getAdminAnalytics,
    staleTime: 45_000,
    placeholderData: (previous) => previous,
  });
}

export function useAdminWorkforceOnboarding() {
  return useQuery({
    queryKey: ['admin', 'workforce-onboarding'],
    queryFn: getAdminWorkforceOnboarding,
    placeholderData: (previous) => previous,
  });
}

export function useAdminReports() {
  return useQuery({
    queryKey: ['admin', 'reports'],
    queryFn: getAdminReports,
    placeholderData: (previous) => previous,
  });
}

export function useAdminVisitors(query?: string, status?: string, page = 0, size = 24, from?: string, to?: string) {
  return useQuery({
    queryKey: ['admin', 'visitors', query ?? '', status ?? 'ALL', page, size, from ?? '', to ?? ''],
    queryFn: () => getAdminVisitors({ query, status, page, size, from, to }),
    placeholderData: (previous) => previous,
  });
}

export function useAdminUsers() {
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: getAdminUsers,
    placeholderData: (previous) => previous,
  });
}

export function useAdminWorkforceAttendance() {
  return useQuery({
    queryKey: ['admin', 'workforce-attendance'],
    queryFn: getAdminWorkforceAttendance,
    placeholderData: (previous) => previous,
  });
}

export function useApproveAdminWorkforceMutation() {
  return useMutation({ mutationFn: approveAdminWorkforce });
}

export function useRejectAdminWorkforceMutation() {
  return useMutation({ mutationFn: rejectAdminWorkforce });
}

export function useApproveAdminVisitorMutation() {
  return useMutation({ mutationFn: approveAdminVisitor });
}

export function useRejectAdminVisitorMutation() {
  return useMutation({ mutationFn: rejectAdminVisitor });
}

export function useCheckInAdminVisitorMutation() {
  return useMutation({ mutationFn: checkInAdminVisitor });
}

export function useCheckOutAdminVisitorMutation() {
  return useMutation({ mutationFn: checkOutAdminVisitor });
}

export function useDenyAdminVisitorMutation() {
  return useMutation({ mutationFn: denyAdminVisitor });
}

export function useSuspendAdminVisitorMutation() {
  return useMutation({ mutationFn: suspendAdminVisitor });
}

export function useReactivateAdminVisitorMutation() {
  return useMutation({ mutationFn: reactivateAdminVisitor });
}

export function useEscalateAdminVisitorMutation() {
  return useMutation({ mutationFn: escalateAdminVisitor });
}

export function useDisableAdminUserMutation() {
  return useMutation({ mutationFn: disableAdminUser });
}

export function useEnableAdminUserMutation() {
  return useMutation({ mutationFn: enableAdminUser });
}
