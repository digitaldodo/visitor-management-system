import { useMutation, useQuery } from '@tanstack/react-query';

import {
  clearEmergencyLockdown,
  flagSuspiciousVisitor,
  flagSuspiciousWorkforce,
  getEmergencyEvacuationRegister,
  getEmergencyFeed,
  getEmergencyState,
  sendEmergencyBroadcast,
  startEmergencyLockdown,
  triggerEmergencyPanic,
} from '../services/emergencyService';

export function useEmergencyState(enabled = true) {
  return useQuery({
    queryKey: ['emergency', 'state'],
    queryFn: getEmergencyState,
    enabled,
    refetchInterval: 30_000,
    placeholderData: (previous) => previous,
  });
}

export function useEmergencyFeed(enabled = true) {
  return useQuery({
    queryKey: ['emergency', 'feed'],
    queryFn: getEmergencyFeed,
    enabled,
    refetchInterval: 20_000,
    placeholderData: (previous) => previous,
  });
}

export function useEmergencyEvacuationRegister(enabled = true) {
  return useQuery({
    queryKey: ['emergency', 'evacuation-register'],
    queryFn: getEmergencyEvacuationRegister,
    enabled,
    refetchInterval: 20_000,
    placeholderData: (previous) => previous,
  });
}

export function useEmergencyPanicMutation() {
  return useMutation({ mutationFn: triggerEmergencyPanic });
}

export function useEmergencyBroadcastMutation() {
  return useMutation({ mutationFn: sendEmergencyBroadcast });
}

export function useStartLockdownMutation() {
  return useMutation({ mutationFn: startEmergencyLockdown });
}

export function useClearLockdownMutation() {
  return useMutation({ mutationFn: clearEmergencyLockdown });
}

export function useFlagSuspiciousVisitorMutation() {
  return useMutation({ mutationFn: flagSuspiciousVisitor });
}

export function useFlagSuspiciousWorkforceMutation() {
  return useMutation({ mutationFn: flagSuspiciousWorkforce });
}
