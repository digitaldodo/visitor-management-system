import { createNavigationContainerRef } from '@react-navigation/native';

import { getWorkspaceConfig, type WorkspaceNavigationTarget } from '../auth/workspaceConfig';
import type { ActiveWorkspaceRole } from '../types/auth';

export const navigationRef = createNavigationContainerRef();

export function navigateToWorkspace(target: WorkspaceNavigationTarget) {
  if (!navigationRef.isReady()) {
    return;
  }

  const navigate = navigationRef.navigate as unknown as (name: string, params?: Record<string, unknown>) => void;

  switch (target) {
    case 'employee-badge':
      navigate('EmployeeTabs', { screen: 'Badge' });
      break;
    case 'employee-requests':
      navigate('EmployeeTabs', { screen: 'Requests' });
      break;
    case 'employee-notifications':
      navigate('EmployeeTabs', { screen: 'Notifications' });
      break;
    case 'visitor-home':
      navigate('VisitorTabs', { screen: 'Home' });
      break;
    case 'visitor-notifications':
      navigate('VisitorTabs', { screen: 'Notifications' });
      break;
    case 'security-scan':
      navigate('SecurityTabs', { screen: 'Scan' });
      break;
    case 'security-alerts':
      navigate('SecurityTabs', { screen: 'Alerts' });
      break;
    case 'admin-operations':
      navigate('AdminStack', { screen: 'AdminOperational' });
      break;
  }
}

export function resetNavigationToRoleHome(role: ActiveWorkspaceRole) {
  if (!navigationRef.isReady()) {
    return;
  }

  const config = getWorkspaceConfig(role);
  if (config.navigator === 'AdminStack') {
    navigationRef.resetRoot({
      index: 0,
      routes: [{ name: 'AdminStack', params: { screen: 'AdminOperational' } }],
    });
    return;
  }

  if (config.navigator === 'SecurityTabs') {
    navigationRef.resetRoot({
      index: 0,
      routes: [{ name: 'SecurityTabs', params: { screen: 'Scan' } }],
    });
    return;
  }

  if (config.navigator === 'VisitorTabs') {
    navigationRef.resetRoot({
      index: 0,
      routes: [{ name: 'VisitorTabs', params: { screen: 'Home' } }],
    });
    return;
  }

  navigationRef.resetRoot({
    index: 0,
    routes: [{ name: 'EmployeeTabs', params: { screen: 'Badge' } }],
  });
}

export function resetNavigationToAuth() {
  if (!navigationRef.isReady()) {
    return;
  }

  navigationRef.resetRoot({
    index: 0,
    routes: [{ name: 'Login' }],
  });
}
