import type { ActiveWorkspaceRole, BackendRole, WorkspaceAudience } from '../types/auth';

const audienceRoleMap: Record<WorkspaceAudience, ActiveWorkspaceRole[]> = {
  admin: ['SUPER_ADMIN', 'ADMIN'],
  employee: ['EMPLOYEE'],
  security: ['SECURITY_GUARD'],
  visitor: ['VISITOR'],
};

const defaultRoleOrder: ActiveWorkspaceRole[] = ['VISITOR', 'SECURITY_GUARD', 'EMPLOYEE', 'ADMIN', 'SUPER_ADMIN'];

export function resolveActiveRole(roles: BackendRole[], audience?: WorkspaceAudience): ActiveWorkspaceRole {
  const normalizedRoles = roles.filter((role): role is ActiveWorkspaceRole =>
    ['VISITOR', 'SECURITY_GUARD', 'EMPLOYEE', 'ADMIN', 'SUPER_ADMIN'].includes(role),
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
