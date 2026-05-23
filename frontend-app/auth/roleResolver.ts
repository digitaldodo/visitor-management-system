import { createAppError } from '../api/error';
import type { ActiveWorkspaceRole, BackendRole, WorkspaceAudience } from '../types/auth';

const audienceRoleMap: Record<WorkspaceAudience, ActiveWorkspaceRole[]> = {
  admin: ['ADMIN'],
  employee: ['EMPLOYEE'],
  security: ['SECURITY_GUARD'],
  visitor: ['VISITOR'],
};

const mobileWorkspaceRoles: ActiveWorkspaceRole[] = ['ADMIN', 'SECURITY_GUARD', 'EMPLOYEE', 'VISITOR'];
const defaultRoleOrder: ActiveWorkspaceRole[] = ['ADMIN', 'SECURITY_GUARD', 'EMPLOYEE', 'VISITOR'];
const employeeWorkspaceAliases: BackendRole[] = ['RECEPTION', 'OPERATOR', 'MANAGER'];

export function resolveActiveRole(roles: BackendRole[], audience?: WorkspaceAudience): ActiveWorkspaceRole {
  if (roles.includes('SUPER_ADMIN')) {
    throw createAppError({
      kind: 'auth',
      message: 'Super Admin access is not available in the mobile app. Use the web control plane.',
      recoverable: false,
    });
  }
  if (roles.includes('ADMIN')) {
    return 'ADMIN';
  }

  const expandedRoles = roles.some((role) => employeeWorkspaceAliases.includes(role)) && !roles.includes('EMPLOYEE')
    ? [...roles, 'EMPLOYEE' as BackendRole]
    : roles;
  const normalizedRoles = expandedRoles.filter((role): role is ActiveWorkspaceRole =>
    mobileWorkspaceRoles.includes(role as ActiveWorkspaceRole),
  );
  const audienceCandidates = audience ? audienceRoleMap[audience] : [];
  const orderedCandidates = [...audienceCandidates, ...defaultRoleOrder];

  const match = orderedCandidates.find((role) => normalizedRoles.includes(role));
  if (!match) {
    throw new Error('This AccessFlow account does not have a mobile operational role.');
  }

  return match;
}

export function canAccessAudience(roles: BackendRole[], audience: WorkspaceAudience) {
  if (roles.includes('ADMIN')) {
    return audience === 'admin';
  }
  if (audience === 'employee' && roles.some((role) => employeeWorkspaceAliases.includes(role))) {
    return true;
  }
  return audienceRoleMap[audience].some((role) => roles.includes(role));
}
