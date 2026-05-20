import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_COMPLETE_KEY = 'accessflow.mobile.onboarding-complete.v1';

export async function readOnboardingComplete() {
  return (await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY)) === 'true';
}

export async function writeOnboardingComplete() {
  await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
}

export async function resetOnboardingComplete() {
  await AsyncStorage.removeItem(ONBOARDING_COMPLETE_KEY);
}
