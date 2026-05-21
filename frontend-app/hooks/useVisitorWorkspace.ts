import { useMutation, useQuery } from '@tanstack/react-query';

import {
  getVisitorHistory,
  getVisitorHosts,
  getVisitorNotifications,
  getVisitorOverview,
  getVisitorPass,
  getVisitorVisits,
  registerVisitorAccount,
  requestVisitorReschedule,
  requestVisitorVisit,
  uploadVisitorVisitPhoto,
} from '../services/visitorService';

export function useVisitorOverview() {
  return useQuery({
    queryKey: ['visitor', 'overview'],
    queryFn: getVisitorOverview,
    placeholderData: (previous) => previous,
  });
}

export function useVisitorVisits() {
  return useQuery({
    queryKey: ['visitor', 'visits'],
    queryFn: getVisitorVisits,
    placeholderData: (previous) => previous,
  });
}

export function useVisitorHistory() {
  return useQuery({
    queryKey: ['visitor', 'history'],
    queryFn: getVisitorHistory,
    placeholderData: (previous) => previous,
  });
}

export function useVisitorHosts(query?: string, companyCode?: string) {
  const normalizedQuery = (query || '').trim();
  return useQuery({
    queryKey: ['visitor', 'hosts', normalizedQuery, companyCode],
    queryFn: ({ signal }) => getVisitorHosts(normalizedQuery, companyCode, signal),
    enabled: normalizedQuery.length >= 2 && Boolean((companyCode || '').trim()),
  });
}

export function useVisitorPass(visitorId?: string | null) {
  return useQuery({
    queryKey: ['visitor', 'pass', visitorId],
    queryFn: () => getVisitorPass(String(visitorId)),
    enabled: Boolean(visitorId),
    placeholderData: (previous) => previous,
  });
}

export function useVisitorNotifications(limit = 25) {
  return useQuery({
    queryKey: ['visitor', 'notifications', limit],
    queryFn: () => getVisitorNotifications(limit),
    placeholderData: (previous) => previous,
  });
}

export function useRegisterVisitorAccountMutation() {
  return useMutation({
    mutationFn: registerVisitorAccount,
  });
}

export function useRequestVisitorVisitMutation() {
  return useMutation({
    mutationFn: (payload: Parameters<typeof requestVisitorVisit>[0]) => requestVisitorVisit(payload),
  });
}

export function useUploadVisitorVisitPhotoMutation() {
  return useMutation({
    mutationFn: uploadVisitorVisitPhoto,
  });
}

export function useRequestVisitorRescheduleMutation() {
  return useMutation({
    mutationFn: ({ visitorId, payload }: { visitorId: string; payload: Parameters<typeof requestVisitorReschedule>[1] }) =>
      requestVisitorReschedule(visitorId, payload),
  });
}
