import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

export function navigateToWorkspace(target: 'employee-requests' | 'employee-notifications' | 'security-alerts' | 'admin-operations') {
  if (!navigationRef.isReady()) {
    return;
  }

  const navigate = navigationRef.navigate as unknown as (name: string, params?: Record<string, unknown>) => void;

  switch (target) {
    case 'employee-requests':
      navigate('EmployeeTabs', { screen: 'Requests' });
      break;
    case 'employee-notifications':
      navigate('EmployeeTabs', { screen: 'Notifications' });
      break;
    case 'security-alerts':
      navigate('SecurityTabs', { screen: 'Alerts' });
      break;
    case 'admin-operations':
      navigate('AdminStack', { screen: 'AdminOperational' });
      break;
  }
}
