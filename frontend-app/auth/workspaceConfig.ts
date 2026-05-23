import type { ActiveWorkspaceRole, WorkspaceAudience } from '../types/auth';

type WorkspaceNavigatorName = 'SecurityTabs' | 'EmployeeTabs' | 'VisitorTabs' | 'AdminStack';
export type WorkspaceNavigationTarget =
  | 'employee-badge'
  | 'employee-requests'
  | 'employee-presence'
  | 'employee-notifications'
  | 'visitor-home'
  | 'visitor-pass'
  | 'visitor-notifications'
  | 'security-scan'
  | 'security-visitor-detail'
  | 'security-workforce'
  | 'security-alerts'
  | 'security-emergency'
  | 'admin-operations'
  | 'admin-approvals'
  | 'admin-visitors'
  | 'admin-employees'
  | 'admin-emergency';

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
};

export function getWorkspaceConfig(role: ActiveWorkspaceRole) {
  return workspaceConfigMap[role];
}

function isAdminRole(role: ActiveWorkspaceRole) {
  return role === 'ADMIN';
}

export function isNotificationAllowedForRole(role: ActiveWorkspaceRole, type?: string | null, category?: string | null) {
  const normalized = String(type || '').trim().toUpperCase();
  const normalizedCategory = String(category || '').trim().toUpperCase();
  if (normalizedCategory === 'SECURITY') {
    return role === 'SECURITY_GUARD' || isAdminRole(role);
  }
  if (normalizedCategory === 'WORKFORCE') {
    if (normalized === 'WORKFORCE_ONBOARDING_REQUESTED' || normalized === 'WORKFORCE_CREDENTIAL_DISABLED') {
      return role === 'SECURITY_GUARD' || isAdminRole(role);
    }
    return role === 'SECURITY_GUARD' || role === 'EMPLOYEE' || isAdminRole(role);
  }
  if (normalizedCategory === 'VISITOR') {
    return role === 'VISITOR' || role === 'EMPLOYEE' || role === 'SECURITY_GUARD' || isAdminRole(role);
  }
  if (normalizedCategory === 'SYSTEM') {
    return true;
  }

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
    return role === 'VISITOR' || role === 'EMPLOYEE' || role === 'SECURITY_GUARD' || isAdminRole(role);
  }

  if (normalized.startsWith('WORKFORCE_')) {
    return role === 'SECURITY_GUARD' || isAdminRole(role);
  }

  return true;
}
