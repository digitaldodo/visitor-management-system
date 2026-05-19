import type { ActiveWorkspaceRole, WorkspaceAudience } from '../types/auth';

export type WorkspaceNavigatorName = 'SecurityTabs' | 'EmployeeTabs' | 'VisitorTabs' | 'AdminStack';
export type WorkspaceNavigationTarget =
  | 'employee-badge'
  | 'employee-requests'
  | 'employee-notifications'
  | 'visitor-home'
  | 'visitor-notifications'
  | 'security-scan'
  | 'security-alerts'
  | 'admin-operations';

type WorkspaceConfig = {
  audience: WorkspaceAudience;
  navigator: WorkspaceNavigatorName;
  homeTarget: WorkspaceNavigationTarget;
  notificationTarget: WorkspaceNavigationTarget;
};

const workspaceConfigMap: Record<ActiveWorkspaceRole, WorkspaceConfig> = {
  SECURITY_GUARD: {
    audience: 'security',
    navigator: 'SecurityTabs',
    homeTarget: 'security-scan',
    notificationTarget: 'security-alerts',
  },
  EMPLOYEE: {
    audience: 'employee',
    navigator: 'EmployeeTabs',
    homeTarget: 'employee-badge',
    notificationTarget: 'employee-notifications',
  },
  VISITOR: {
    audience: 'visitor',
    navigator: 'VisitorTabs',
    homeTarget: 'visitor-home',
    notificationTarget: 'visitor-notifications',
  },
  ADMIN: {
    audience: 'admin',
    navigator: 'AdminStack',
    homeTarget: 'admin-operations',
    notificationTarget: 'admin-operations',
  },
  SUPER_ADMIN: {
    audience: 'admin',
    navigator: 'AdminStack',
    homeTarget: 'admin-operations',
    notificationTarget: 'admin-operations',
  },
};

export function getWorkspaceConfig(role: ActiveWorkspaceRole) {
  return workspaceConfigMap[role];
}

export function isAdminRole(role: ActiveWorkspaceRole) {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

export function isNotificationAllowedForRole(role: ActiveWorkspaceRole, type?: string | null) {
  const normalized = String(type || '').trim().toUpperCase();
  if (!normalized) {
    return true;
  }

  if (normalized.startsWith('SYSTEM_')) {
    return true;
  }

  if (normalized.startsWith('SECURITY_')) {
    return role === 'SECURITY_GUARD' || isAdminRole(role);
  }

  if (normalized.startsWith('VISITOR_')) {
    return role === 'VISITOR' || role === 'EMPLOYEE' || isAdminRole(role);
  }

  if (normalized.startsWith('WORKFORCE_')) {
    return role === 'SECURITY_GUARD' || isAdminRole(role);
  }

  return true;
}
