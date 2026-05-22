import { createNavigationContainerRef } from '@react-navigation/native';

import { getWorkspaceConfig, type WorkspaceNavigationTarget } from '../auth/workspaceConfig';
import type { ActiveWorkspaceRole } from '../types/auth';

export const navigationRef = createNavigationContainerRef();

export function navigateToWorkspace(target: WorkspaceNavigationTarget) {
  navigateToWorkspaceContext(target);
}

export function navigateToWorkspaceContext(target: WorkspaceNavigationTarget, params?: Record<string, unknown>) {
  if (!navigationRef.isReady()) {
    return;
  }

  const navigate = navigationRef.navigate as unknown as (name: string, params?: Record<string, unknown>) => void;

  switch (target) {
    case 'employee-badge':
      navigate('EmployeeTabs', { screen: 'Badge' });
      break;
    case 'employee-requests':
      navigate('EmployeeTabs', { screen: 'Requests', params });
      break;
    case 'employee-presence':
      navigate('EmployeeTabs', { screen: 'Presence', params });
      break;
    case 'employee-notifications':
      navigate('EmployeeTabs', { screen: 'Notifications', params });
      break;
    case 'visitor-home':
      navigate('VisitorTabs', { screen: 'Home' });
      break;
    case 'visitor-pass':
      navigate('VisitorTabs', { screen: 'Pass', params });
      break;
    case 'visitor-notifications':
      navigate('VisitorTabs', { screen: 'Notifications', params });
      break;
    case 'security-scan':
      navigate('SecurityStack', { screen: 'SecurityTabs', params: { screen: 'Scan' } });
      break;
    case 'security-visitor-detail':
      navigate('SecurityStack', { screen: 'VisitorDetail', params });
      break;
    case 'security-workforce':
      navigate('SecurityStack', { screen: 'SecurityTabs', params: { screen: 'Workforce', params } });
      break;
    case 'security-alerts':
      navigate('SecurityStack', { screen: 'SecurityTabs', params: { screen: 'Alerts', params } });
      break;
    case 'security-emergency':
      navigate('SecurityStack', { screen: 'SecurityTabs', params: { screen: 'Emergency', params } });
      break;
    case 'admin-operations':
      navigate('AdminStack', { screen: 'Dashboard', params });
      break;
    case 'admin-approvals':
      navigate('AdminStack', { screen: 'Approvals', params });
      break;
    case 'admin-visitors':
      navigate('AdminStack', { screen: 'Visitors', params });
      break;
    case 'admin-employees':
      navigate('AdminStack', { screen: 'Employees', params });
      break;
    case 'admin-emergency':
      navigate('AdminStack', { screen: 'Emergency', params });
      break;
  }
}

export function navigateToVisitorInviteRegistration(token: string) {
  if (!navigationRef.isReady() || !token.trim()) {
    return;
  }
  const navigate = navigationRef.navigate as unknown as (name: string, params?: Record<string, unknown>) => void;
  navigate('VisitorInviteRegistration', { token: token.trim() });
}

export function resetNavigationToRoleHome(role: ActiveWorkspaceRole) {
  if (!navigationRef.isReady()) {
    return;
  }

  const config = getWorkspaceConfig(role);
  if (config.navigator === 'AdminStack') {
    if (isCurrentRootRoute('AdminStack', 'Dashboard')) {
      return;
    }
    navigationRef.resetRoot({
      index: 0,
      routes: [{ name: 'AdminStack', params: { screen: 'Dashboard' } }],
    });
    return;
  }

  if (config.navigator === 'SecurityTabs') {
    if (isCurrentRootRoute('SecurityStack', 'SecurityTabs', 'Scan')) {
      return;
    }
    navigationRef.resetRoot({
      index: 0,
      routes: [{ name: 'SecurityStack', params: { screen: 'SecurityTabs', params: { screen: 'Scan' } } }],
    });
    return;
  }

  if (config.navigator === 'VisitorTabs') {
    if (isCurrentRootRoute('VisitorTabs', 'Home')) {
      return;
    }
    navigationRef.resetRoot({
      index: 0,
      routes: [{ name: 'VisitorTabs', params: { screen: 'Home' } }],
    });
    return;
  }

  if (isCurrentRootRoute('EmployeeTabs', 'Badge')) {
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

function isCurrentRootRoute(rootName: string, screen?: string, nestedScreen?: string) {
  if (!navigationRef.isReady()) {
    return false;
  }
  const state = navigationRef.getRootState();
  const route = state.routes[state.index ?? 0] as { name?: string; params?: { screen?: string; params?: { screen?: string } } } | undefined;
  if (route?.name !== rootName) {
    return false;
  }
  if (screen && route.params?.screen !== screen) {
    return false;
  }
  if (nestedScreen && route.params?.params?.screen !== nestedScreen) {
    return false;
  }
  return true;
}
