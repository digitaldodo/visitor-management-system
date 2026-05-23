import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';

import type { AuthSession } from '../types/auth';
import type { RuntimeSnapshot } from '../types/runtime';
import { readSecureValue, removeSecureValue, writeSecureJson, writeSecureValue } from './secureStore';

const SESSION_KEY = 'accessflow.mobile.session';
const RUNTIME_KEY = 'accessflow.mobile.runtime';
const DEVICE_ID_KEY = 'accessflow.mobile.device-id';
const INSTALLATION_ID_KEY = 'accessflow.mobile.installation-id';
const ASYNC_STORAGE_DEVICE_ID_KEY = 'accessflow.mobile.device-id';
const SESSION_LOCK_KEY = 'accessflow.mobile.session-lock';

export class SecureSessionStorageError extends Error {
  constructor(message = 'Secure session storage could not be read.') {
    super(message);
    this.name = 'SecureSessionStorageError';
  }
}

export class SecureSessionCorruptionError extends Error {
  constructor(message = 'Secure session payload is invalid.') {
    super(message);
    this.name = 'SecureSessionCorruptionError';
  }
}

export async function readPersistedSession() {
  try {
    const rawValue = await readSecureValue(SESSION_KEY);
    if (!rawValue) {
      return null;
    }

    try {
      return JSON.parse(rawValue) as AuthSession;
    } catch {
      throw new SecureSessionCorruptionError();
    }
  } catch (error) {
    if (error instanceof SecureSessionCorruptionError) {
      throw error;
    }
    throw new SecureSessionStorageError(error instanceof Error ? error.message : undefined);
  }
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

export async function clearSessionLockState() {
  await AsyncStorage.removeItem(SESSION_LOCK_KEY);
}

export async function readOrCreateDeviceId() {
  const existing = await readSecureValue(DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }

  const migratedValue = await AsyncStorage.getItem(ASYNC_STORAGE_DEVICE_ID_KEY).catch(() => null);
  const nextValue = migratedValue || [
    'afm',
    normalizeDevicePart(Application.applicationId),
    secureRandomToken(),
  ].filter(Boolean).join('-');
  await writeSecureValue(DEVICE_ID_KEY, nextValue);
  await AsyncStorage.removeItem(ASYNC_STORAGE_DEVICE_ID_KEY).catch(() => undefined);
  return nextValue;
}

export async function readOrCreateInstallationId() {
  const existing = await readSecureValue(INSTALLATION_ID_KEY);
  if (existing) {
    return existing;
  }

  const nextValue = `afi-${secureRandomToken()}`;
  await writeSecureValue(INSTALLATION_ID_KEY, nextValue);
  return nextValue;
}

function secureRandomToken() {
  if (typeof Crypto.randomUUID === 'function') {
    return Crypto.randomUUID();
  }

  const bytes = Crypto.getRandomBytes(18);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeDevicePart(value?: string | null) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

export function isSecureSessionCorruption(error: unknown) {
  return error instanceof SecureSessionCorruptionError;
}
