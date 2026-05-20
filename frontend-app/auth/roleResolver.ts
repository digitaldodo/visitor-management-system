import { createAppError } from '../api/error';
import type { ActiveWorkspaceRole, BackendRole, WorkspaceAudience } from '../types/auth';

const audienceRoleMap: Record<WorkspaceAudience, ActiveWorkspaceRole[]> = {
  admin: ['ADMIN'],
  employee: ['EMPLOYEE'],
  security: ['SECURITY_GUARD'],
  visitor: ['VISITOR'],
};

const mobileWorkspaceRoles: ActiveWorkspaceRole[] = ['VISITOR', 'SECURITY_GUARD', 'EMPLOYEE', 'ADMIN'];
const defaultRoleOrder: ActiveWorkspaceRole[] = ['VISITOR', 'SECURITY_GUARD', 'EMPLOYEE', 'ADMIN'];

export function resolveActiveRole(roles: BackendRole[], audience?: WorkspaceAudience): ActiveWorkspaceRole {
  if (roles.includes('SUPER_ADMIN')) {
    throw createAppError({
      kind: 'auth',
      message: 'Super Admin access is not available in the mobile app. Use the web control plane.',
      recoverable: false,
    });
  }

  const normalizedRoles = roles.filter((role): role is ActiveWorkspaceRole =>
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
  return audienceRoleMap[audience].some((role) => roles.includes(role));
}
