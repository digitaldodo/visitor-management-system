import type { ActiveWorkspaceRole } from '../types/auth';

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super admin workspace',
  ADMIN: 'Admin workspace',
  EMPLOYEE: 'Employee workspace',
  SECURITY_GUARD: 'Security workspace',
  RECEPTION: 'Reception workspace',
  OPERATOR: 'Operator workspace',
  MANAGER: 'Manager workspace',
  VISITOR: 'Visitor workspace',
};

export function roleLabel(role?: ActiveWorkspaceRole | string | null) {
  const normalized = String(role || '').trim().toUpperCase();
  if (!normalized) {
    return 'Workspace';
  }
  return ROLE_LABELS[normalized] || humanizeRole(normalized);
}

function humanizeRole(role: string) {
  return role
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
