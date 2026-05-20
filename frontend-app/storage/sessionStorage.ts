import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';

import type { AuthSession } from '../types/auth';
import type { RuntimeSnapshot, SessionLockState } from '../types/runtime';
import { readSecureJson, readSecureValue, removeSecureValue, writeSecureJson, writeSecureValue } from './secureStore';

const SESSION_KEY = 'accessflow.mobile.session';
const RUNTIME_KEY = 'accessflow.mobile.runtime';
const DEVICE_ID_KEY = 'accessflow.mobile.device-id';
const LEGACY_DEVICE_ID_KEY = 'accessflow.mobile.device-id';
const SESSION_LOCK_KEY = 'accessflow.mobile.session-lock';

export async function readPersistedSession(options?: { requireAuthentication?: boolean }) {
  return readSecureJson<AuthSession>(SESSION_KEY, options?.requireAuthentication ? {
    requireAuthentication: true,
    authenticationPrompt: 'Unlock AccessFlow secure session',
  } : undefined);
}

export async function writePersistedSession(session: AuthSession, options?: { requireAuthentication?: boolean }) {
  await writeSecureJson(SESSION_KEY, session, options?.requireAuthentication ? {
    requireAuthentication: true,
    authenticationPrompt: 'Protect AccessFlow secure session',
  } : undefined);
}

export async function clearPersistedSession() {
  await removeSecureValue(SESSION_KEY);
}

export async function readRuntimeSnapshot() {
  const rawValue = await AsyncStorage.getItem(RUNTIME_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as RuntimeSnapshot;
  } catch {
    await AsyncStorage.removeItem(RUNTIME_KEY);
    return null;
  }
}

export async function writeRuntimeSnapshot(snapshot: RuntimeSnapshot) {
  await AsyncStorage.setItem(RUNTIME_KEY, JSON.stringify(snapshot));
}

export async function clearRuntimeSnapshot() {
  await AsyncStorage.removeItem(RUNTIME_KEY);
}

export async function readSessionLockState() {
  const rawValue = await AsyncStorage.getItem(SESSION_LOCK_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as SessionLockState;
  } catch {
    await AsyncStorage.removeItem(SESSION_LOCK_KEY);
    return null;
  }
}

export async function writeSessionLockState(lockState: SessionLockState) {
  await AsyncStorage.setItem(SESSION_LOCK_KEY, JSON.stringify(lockState));
}

export async function clearSessionLockState() {
  await AsyncStorage.removeItem(SESSION_LOCK_KEY);
}

export async function readOrCreateDeviceId() {
  const existing = await readSecureValue(DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }

  const legacyValue = await AsyncStorage.getItem(LEGACY_DEVICE_ID_KEY).catch(() => null);
  const nextValue = legacyValue || [
    'afm',
    normalizeDevicePart(Application.applicationId),
    Date.now().toString(36),
    Math.random().toString(36).slice(2, 12),
    Math.random().toString(36).slice(2, 12),
  ].filter(Boolean).join('-');
  await writeSecureValue(DEVICE_ID_KEY, nextValue);
  await AsyncStorage.removeItem(LEGACY_DEVICE_ID_KEY).catch(() => undefined);
  return nextValue;
}

function normalizeDevicePart(value?: string | null) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}
