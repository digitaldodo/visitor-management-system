import { useMutation, useQuery } from '@tanstack/react-query';

import {
  checkInVisitor,
  checkInWithQr,
  createVisitorRegistration,
  createWorkforceOnboarding,
  denyVisitorEntry,
  escalateVisitorIssue,
  getSecurityAttendance,
  getSecurityEmployees,
  getSecurityHosts,
  getSecurityMonitoring,
  getSecurityOverview,
  getSecurityVisitorPass,
  getSecurityVisitorById,
  getSecurityVisitorInvites,
  getSecurityVisitors,
  getSecurityWorkforceOnboardingRequests,
  manualEmployeeCheckIn,
  manualEmployeeCheckOut,
  markSecurityVisitorBadgePrinted,
  overrideCheckInVisitor,
  reactivateVisitor,
  reportVisitorMismatch,
  resendSecurityVisitorInvite,
  revokeSecurityVisitorInvite,
  revokeVisitor,
  scanEmployeeQr,
  suspendVisitor,
  uploadVisitorPhoto,
  uploadWorkforcePhoto,
  verifyQrPayload,
  checkOutVisitor,
} from '../services/securityService';

export function useSecurityOverview() {
  return useQuery({
    queryKey: ['security', 'overview'],
    queryFn: getSecurityOverview,
  });
}

export function useSecurityVisitors(query?: string, status?: string, page = 0, size = 20, from?: string, to?: string) {
  return useQuery({
    queryKey: ['security', 'visitors', query ?? '', status ?? 'ALL', page, size, from ?? '', to ?? ''],
    queryFn: () => getSecurityVisitors({ query, status, page, size, from, to }),
    placeholderData: (previous) => previous,
  });
}

export function useSecurityVisitor(visitorId?: string | null) {
  return useQuery({
    queryKey: ['security', 'visitor', visitorId ?? ''],
    queryFn: () => getSecurityVisitorById(String(visitorId)),
    enabled: Boolean(visitorId),
  });
}

export function useSecurityVisitorPass(visitorId?: string | null) {
  return useQuery({
    queryKey: ['security', 'visitor-pass', visitorId ?? ''],
    queryFn: () => getSecurityVisitorPass(String(visitorId)),
    enabled: Boolean(visitorId),
    placeholderData: (previous) => previous,
  });
}

export function useSecurityVisitorInvites() {
  return useQuery({
    queryKey: ['security', 'visitor-invites'],
    queryFn: getSecurityVisitorInvites,
    placeholderData: (previous) => previous,
  });
}

export function useResendSecurityVisitorInviteMutation() {
  return useMutation({
    mutationFn: resendSecurityVisitorInvite,
  });
}

export function useRevokeSecurityVisitorInviteMutation() {
  return useMutation({
    mutationFn: ({ inviteId, reason }: { inviteId: string; reason: string }) =>
      revokeSecurityVisitorInvite(inviteId, reason),
  });
}

export function useMarkSecurityVisitorBadgePrintedMutation() {
  return useMutation({
    mutationFn: markSecurityVisitorBadgePrinted,
  });
}

export function useSecurityMonitoring(query?: string) {
  return useQuery({
    queryKey: ['security', 'monitoring', query ?? ''],
    queryFn: () => getSecurityMonitoring(query),
    placeholderData: (previous) => previous,
  });
}

export function useSecurityAttendance() {
  return useQuery({
    queryKey: ['security', 'attendance'],
    queryFn: getSecurityAttendance,
    placeholderData: (previous) => previous,
  });
}

export function useSecurityEmployees(query?: string) {
  return useQuery({
    queryKey: ['security', 'employees', query ?? ''],
    queryFn: ({ signal }) => getSecurityEmployees(query, signal),
    placeholderData: (previous) => previous,
  });
}

export function useSecurityHosts(query?: string) {
  return useQuery({
    queryKey: ['security', 'hosts', query ?? ''],
    queryFn: ({ signal }) => getSecurityHosts(query, signal),
    enabled: Boolean(query && query.trim().length >= 2),
  });
}

export function useVerifyQrMutation() {
  return useMutation({
    mutationFn: (qrPayload: string) => verifyQrPayload(qrPayload),
  });
}

export function useQrCheckInMutation() {
  return useMutation({
    mutationFn: (qrPayload: string) => checkInWithQr(qrPayload),
  });
}

export function useEmployeeQrScanMutation() {
  return useMutation({
    mutationFn: (qrPayload: string) => scanEmployeeQr(qrPayload),
  });
}

export function useManualEmployeeCheckInMutation() {
  return useMutation({
    mutationFn: manualEmployeeCheckIn,
  });
}

export function useManualEmployeeCheckOutMutation() {
  return useMutation({
    mutationFn: manualEmployeeCheckOut,
  });
}

export function useCreateVisitorMutation() {
  return useMutation({
    mutationFn: createVisitorRegistration,
  });
}

export function useUploadVisitorPhotoMutation() {
  return useMutation({
    mutationFn: uploadVisitorPhoto,
  });
}

export function useUploadWorkforcePhotoMutation() {
  return useMutation({
    mutationFn: uploadWorkforcePhoto,
  });
}

export function useCreateWorkforceOnboardingMutation() {
  return useMutation({
    mutationFn: createWorkforceOnboarding,
  });
}

export function useSecurityWorkforceOnboardingRequests() {
  return useQuery({
    queryKey: ['security', 'workforce-onboarding'],
    queryFn: getSecurityWorkforceOnboardingRequests,
    placeholderData: (previous) => previous,
  });
}

export function useCheckInVisitorMutation() {
  return useMutation({
    mutationFn: checkInVisitor,
  });
}

export function useOverrideCheckInMutation() {
  return useMutation({
    mutationFn: overrideCheckInVisitor,
  });
}

export function useCheckOutVisitorMutation() {
  return useMutation({
    mutationFn: (visitorId: string) => checkOutVisitor(visitorId),
  });
}

export function useDenyVisitorMutation() {
  return useMutation({
    mutationFn: denyVisitorEntry,
  });
}

export function useSuspendVisitorMutation() {
  return useMutation({
    mutationFn: suspendVisitor,
  });
}

export function useRevokeVisitorMutation() {
  return useMutation({
    mutationFn: revokeVisitor,
  });
}

export function useReactivateVisitorMutation() {
  return useMutation({
    mutationFn: reactivateVisitor,
  });
}

export function useEscalateVisitorMutation() {
  return useMutation({
    mutationFn: escalateVisitorIssue,
  });
}

export function useReportVisitorMismatchMutation() {
  return useMutation({
    mutationFn: reportVisitorMismatch,
  });
}
