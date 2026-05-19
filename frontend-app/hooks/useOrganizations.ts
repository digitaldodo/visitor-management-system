import { useQuery } from '@tanstack/react-query';

import { getPublicOrganizations } from '../services/organizationService';

export function usePublicOrganizations() {
  return useQuery({
    queryKey: ['organizations', 'public'],
    queryFn: getPublicOrganizations,
    placeholderData: (previous) => previous,
    staleTime: 10 * 60_000,
    retry: 2,
  });
}
