import * as LocalAuthentication from 'expo-local-authentication';

export type BiometricReadiness = {
  available: boolean;
  enrolled: boolean;
  label: string;
};

const fallbackReadiness: BiometricReadiness = {
  available: false,
  enrolled: false,
  label: 'Device unlock ready',
};

export async function getBiometricReadiness(): Promise<BiometricReadiness> {
  try {
    const [available, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);

    return {
      available,
      enrolled,
      label: labelForBiometricTypes(types),
    };
  } catch {
    return fallbackReadiness;
  }
}

function labelForBiometricTypes(types: LocalAuthentication.AuthenticationType[]) {
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return 'Face unlock ready';
  }

  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return 'Fingerprint ready';
  }

  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
    return 'Iris unlock ready';
  }

  return fallbackReadiness.label;
}
