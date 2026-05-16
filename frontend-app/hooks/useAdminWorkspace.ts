import { useQuery } from '@tanstack/react-query';

import { getAdminOverview, getAdminReports, getAdminWorkforceOnboarding } from '../services/adminService';

export function useAdminOverview() {
  return useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: getAdminOverview,
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
