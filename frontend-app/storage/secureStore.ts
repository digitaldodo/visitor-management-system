import * as SecureStore from 'expo-secure-store';

export type SecureStoreHardeningOptions = Pick<SecureStore.SecureStoreOptions, 'keychainAccessible' | 'requireAuthentication' | 'authenticationPrompt'>;

const defaultOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function readSecureJson<T>(key: string, options?: SecureStoreHardeningOptions): Promise<T | null> {
  const rawValue = await SecureStore.getItemAsync(key, {
    ...defaultOptions,
    ...options,
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

export async function readSecureValue(key: string, options?: SecureStoreHardeningOptions) {
  return SecureStore.getItemAsync(key, {
    ...defaultOptions,
    ...options,
  });
}

export async function writeSecureJson<T>(key: string, value: T, options?: SecureStoreHardeningOptions) {
  await SecureStore.setItemAsync(key, JSON.stringify(value), {
    ...defaultOptions,
    ...options,
  });
}

export async function writeSecureValue(key: string, value: string, options?: SecureStoreHardeningOptions) {
  await SecureStore.setItemAsync(key, value, {
    ...defaultOptions,
    ...options,
  });
}

export async function removeSecureValue(key: string) {
  await SecureStore.deleteItemAsync(key);
}
