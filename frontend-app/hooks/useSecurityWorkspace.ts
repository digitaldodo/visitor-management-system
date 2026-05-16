import { useMutation, useQuery } from '@tanstack/react-query';

import {
  checkInWithQr,
  getSecurityAttendance,
  getSecurityEmployees,
  getSecurityMonitoring,
  getSecurityOverview,
  getSecurityVisitors,
  verifyQrPayload,
} from '../services/securityService';

export function useSecurityOverview() {
  return useQuery({
    queryKey: ['security', 'overview'],
    queryFn: getSecurityOverview,
  });
}

export function useSecurityVisitors(query?: string) {
  return useQuery({
    queryKey: ['security', 'visitors', query ?? ''],
    queryFn: () => getSecurityVisitors({ query }),
  });
}

export function useSecurityMonitoring(query?: string) {
  return useQuery({
    queryKey: ['security', 'monitoring', query ?? ''],
    queryFn: () => getSecurityMonitoring(query),
  });
}

export function useSecurityAttendance() {
  return useQuery({
    queryKey: ['security', 'attendance'],
    queryFn: getSecurityAttendance,
  });
}

export function useSecurityEmployees(query?: string) {
  return useQuery({
    queryKey: ['security', 'employees', query ?? ''],
    queryFn: () => getSecurityEmployees(query),
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
