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
  getSecurityVisitorById,
  getSecurityVisitors,
  manualEmployeeCheckIn,
  manualEmployeeCheckOut,
  overrideCheckInVisitor,
  reactivateVisitor,
  reportVisitorMismatch,
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

export function useSecurityVisitors(query?: string, status?: string) {
  return useQuery({
    queryKey: ['security', 'visitors', query ?? '', status ?? 'ALL'],
    queryFn: () => getSecurityVisitors({ query, status }),
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
    queryFn: () => getSecurityEmployees(query),
    placeholderData: (previous) => previous,
  });
}

export function useSecurityHosts(query?: string) {
  return useQuery({
    queryKey: ['security', 'hosts', query ?? ''],
    queryFn: () => getSecurityHosts(query),
    enabled: Boolean(query && query.trim().length >= 2),
  });
}

export function useVerifyQrMutation() {
  return useMutation({
    mutationFn: verifyQrPayload,
  });
}

export function useQrCheckInMutation() {
  return useMutation({
    mutationFn: checkInWithQr,
  });
}

export function useEmployeeQrScanMutation() {
  return useMutation({
    mutationFn: scanEmployeeQr,
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
    mutationFn: checkOutVisitor,
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
