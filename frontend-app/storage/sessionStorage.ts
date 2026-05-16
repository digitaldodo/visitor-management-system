import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AuthSession } from '../types/auth';
import type { RuntimeSnapshot } from '../types/runtime';
import { readSecureJson, removeSecureValue, writeSecureJson } from './secureStore';

const SESSION_KEY = 'accessflow.mobile.session';
const RUNTIME_KEY = 'accessflow.mobile.runtime';
const DEVICE_ID_KEY = 'accessflow.mobile.device-id';

export async function readPersistedSession() {
  return readSecureJson<AuthSession>(SESSION_KEY);
}

export async function writePersistedSession(session: AuthSession) {
  await writeSecureJson(SESSION_KEY, session);
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
    return null;
  }
}

export async function writeRuntimeSnapshot(snapshot: RuntimeSnapshot) {
  await AsyncStorage.setItem(RUNTIME_KEY, JSON.stringify(snapshot));
}

export async function clearRuntimeSnapshot() {
  await AsyncStorage.removeItem(RUNTIME_KEY);
}

export async function readOrCreateDeviceId() {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }

  const nextValue = `afm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  await AsyncStorage.setItem(DEVICE_ID_KEY, nextValue);
  return nextValue;
}
