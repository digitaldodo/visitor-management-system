import { request } from '../api/apiClient';
import type {
  EmergencyEvacuationRegister,
  EmergencyIncident,
  EmergencyIncidentSeverity,
  EmergencyState,
} from '../types/domain';

export type EmergencyLockdownPayload = {
  reason: string;
  scope?: string | null;
  confirmOperationalOnly: boolean;
};

export type EmergencyBroadcastPayload = {
  title: string;
  message: string;
  severity?: EmergencyIncidentSeverity;
  scope?: string | null;
  evacuation?: boolean;
};

export type EmergencyPanicPayload = {
  checkpoint?: string | null;
  note?: string | null;
  deliberate: boolean;
};

export type EmergencyFlagPayload = {
  id: string;
  note: string;
  checkpoint?: string | null;
};

export async function getEmergencyState() {
  return request<EmergencyState>({
    url: '/emergency/state',
    method: 'GET',
  });
}

export async function getEmergencyFeed() {
  return request<EmergencyIncident[]>({
    url: '/emergency/feed',
    method: 'GET',
  });
}

export async function getEmergencyEvacuationRegister() {
  return request<EmergencyEvacuationRegister>({
    url: '/emergency/evacuation-register',
    method: 'GET',
  });
}

export async function startEmergencyLockdown(payload: EmergencyLockdownPayload) {
  return request<EmergencyState>({
    url: '/emergency/lockdown',
    method: 'POST',
    data: payload,
  });
}

export async function clearEmergencyLockdown(payload: EmergencyLockdownPayload) {
  return request<EmergencyState>({
    url: '/emergency/lockdown/clear',
    method: 'PATCH',
    data: payload,
  });
}

export async function sendEmergencyBroadcast(payload: EmergencyBroadcastPayload) {
  return request<EmergencyIncident>({
    url: '/emergency/broadcasts',
    method: 'POST',
    data: payload,
  });
}

export async function triggerEmergencyPanic(payload: EmergencyPanicPayload) {
  return request<EmergencyIncident>({
    url: '/emergency/panic',
    method: 'POST',
    data: payload,
  });
}

export async function flagSuspiciousVisitor(payload: EmergencyFlagPayload) {
  return request<EmergencyIncident>({
    url: `/emergency/visitors/${encodeURIComponent(payload.id)}/suspicious`,
    method: 'POST',
    data: {
      note: payload.note,
      checkpoint: payload.checkpoint ?? null,
    },
  });
}

export async function flagSuspiciousWorkforce(payload: EmergencyFlagPayload) {
  return request<EmergencyIncident>({
    url: `/emergency/workforce/${encodeURIComponent(payload.id)}/suspicious`,
    method: 'POST',
    data: {
      note: payload.note,
      checkpoint: payload.checkpoint ?? null,
    },
  });
}
