import { useQuery } from '@tanstack/react-query';

import { getPublicOrganizations } from '../services/organizationService';

export function usePublicOrganizations(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['organizations', 'public'],
    queryFn: ({ signal }) => getPublicOrganizations(signal),
    placeholderData: (previous) => previous,
    enabled: options?.enabled ?? true,
    staleTime: 10 * 60_000,
    retry: 2,
  });
}
