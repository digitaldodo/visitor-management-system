import { getWorkspaceConfig, isNotificationAllowedForRole, type WorkspaceNavigationTarget } from '../auth/workspaceConfig';
import { navigateToVisitorInviteRegistration, navigateToWorkspace, navigateToWorkspaceContext } from '../navigation/navigationRef';
import type { ActiveWorkspaceRole } from '../types/auth';
import type { OperationalEvent } from '../types/operationalSync';

export type OperationalDeepLinkPayload = {
  type?: string | null;
  category?: string | null;
  visitorId?: string | null;
  workforceId?: string | null;
  employeeId?: string | null;
  incidentId?: string | null;
  credentialId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  actionUrl?: string | null;
};

export function openOperationalDeepLink(role: ActiveWorkspaceRole, payload: OperationalDeepLinkPayload) {
  const inviteToken = role === 'VISITOR' ? inviteTokenFromActionUrl(payload.actionUrl) : null;
  if (inviteToken) {
    navigateToVisitorInviteRegistration(inviteToken);
    return true;
  }
  const target = resolveOperationalDeepLink(role, payload);
  if (!target) {
    return false;
  }
  navigateToWorkspaceContext(target.target, target.params);
  return true;
}

function inviteTokenFromActionUrl(actionUrl?: string | null) {
  const value = String(actionUrl || '');
  const marker = '/visitor-invite/';
  const markerIndex = value.indexOf(marker);
  if (markerIndex >= 0) {
    return value.slice(markerIndex + marker.length).split(/[?#]/)[0] || null;
  }
  const schemeMarker = 'accessflow://visitor-invite/';
  if (value.startsWith(schemeMarker)) {
    return value.slice(schemeMarker.length).split(/[?#]/)[0] || null;
  }
  return null;
}

export function resolveOperationalDeepLink(
  role: ActiveWorkspaceRole,
  payload: OperationalDeepLinkPayload,
): { target: WorkspaceNavigationTarget; params?: Record<string, unknown> } | null {
  if (!isNotificationAllowedForRole(role, payload.type || payload.category)) {
    return null;
  }

  const normalizedType = String(payload.type || payload.category || payload.targetType || payload.actionUrl || '').toUpperCase();
  const targetId = payload.visitorId || payload.incidentId || payload.workforceId || payload.employeeId || payload.credentialId || payload.targetId || null;
  const targetType = String(payload.targetType || '').toUpperCase();

  if (payload.visitorId || targetType.includes('VISITOR') || normalizedType.includes('VISITOR') || normalizedType.includes('BADGE')) {
    if (role === 'SECURITY_GUARD') {
      return { target: 'security-visitor-detail', params: { visitorId: payload.visitorId || targetId } };
    }
    if (role === 'ADMIN') {
      return { target: 'admin-visitors', params: { visitorId: payload.visitorId || targetId } };
    }
    if (role === 'VISITOR') {
      return { target: 'visitor-pass', params: { visitorId: payload.visitorId || targetId } };
    }
    return { target: 'employee-requests', params: { visitorId: payload.visitorId || targetId } };
  }

  if (payload.incidentId || normalizedType.includes('EMERGENCY') || normalizedType.includes('INCIDENT') || normalizedType.includes('SUSPICIOUS')) {
    return role === 'ADMIN'
      ? { target: 'admin-emergency', params: { incidentId: payload.incidentId || targetId } }
      : role === 'SECURITY_GUARD'
        ? { target: 'security-emergency', params: { incidentId: payload.incidentId || targetId } }
        : { target: getWorkspaceConfig(role).notificationTarget };
  }

  if (payload.workforceId || payload.employeeId || targetType.includes('EMPLOYEE') || targetType.includes('WORKFORCE') || normalizedType.includes('WORKFORCE')) {
    if (role === 'ADMIN') {
      return { target: 'admin-employees', params: { workforceId: payload.workforceId || payload.employeeId || targetId } };
    }
    if (role === 'SECURITY_GUARD') {
      return { target: 'security-workforce', params: { workforceId: payload.workforceId || payload.employeeId || targetId } };
    }
    return { target: 'employee-presence', params: { employeeId: payload.employeeId || targetId } };
  }

  if (normalizedType.includes('APPROVAL')) {
    return role === 'ADMIN' ? { target: 'admin-approvals' } : { target: 'employee-requests' };
  }

  return { target: getWorkspaceConfig(role).notificationTarget };
}

export function openOperationalEvent(role: ActiveWorkspaceRole, event: OperationalEvent) {
  return openOperationalDeepLink(role, {
    type: event.type,
    category: event.category,
    targetType: event.targetType,
    targetId: event.targetId,
  });
}

export function openWorkspaceFallback(target: WorkspaceNavigationTarget) {
  navigateToWorkspace(target);
}
