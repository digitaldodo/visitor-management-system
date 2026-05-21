import * as SecureStore from 'expo-secure-store';

const defaultOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function readSecureJson<T>(key: string): Promise<T | null> {
  const rawValue = await SecureStore.getItemAsync(key, {
    ...defaultOptions,
  });
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return null;
  }
}

export async function readSecureValue(key: string) {
  return SecureStore.getItemAsync(key, {
    ...defaultOptions,
  });
}

export async function writeSecureJson<T>(key: string, value: T) {
  await SecureStore.setItemAsync(key, JSON.stringify(value), {
    ...defaultOptions,
  });
}

export async function writeSecureValue(key: string, value: string) {
  await SecureStore.setItemAsync(key, value, {
    ...defaultOptions,
  });
}

export async function removeSecureValue(key: string) {
  await SecureStore.deleteItemAsync(key);
}
