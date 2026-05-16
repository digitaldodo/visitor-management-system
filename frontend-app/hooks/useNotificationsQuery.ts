import { useQuery } from '@tanstack/react-query';

import { getNotifications } from '../services/notificationService';

export function useNotificationsQuery(limit = 20) {
  return useQuery({
    queryKey: ['notifications', limit],
    queryFn: () => getNotifications(limit),
    placeholderData: (previous) => previous,
  });
}
