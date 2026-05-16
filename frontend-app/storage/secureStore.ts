import * as SecureStore from 'expo-secure-store';

export async function readSecureJson<T>(key: string): Promise<T | null> {
  const rawValue = await SecureStore.getItemAsync(key);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return null;
  }
}

export async function writeSecureJson<T>(key: string, value: T) {
  await SecureStore.setItemAsync(key, JSON.stringify(value));
}

export async function removeSecureValue(key: string) {
  await SecureStore.deleteItemAsync(key);
}
