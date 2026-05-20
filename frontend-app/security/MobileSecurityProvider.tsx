import * as ScreenCapture from 'expo-screen-capture';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { apiConfig } from '../api/apiConfig';
import { useAuth } from '../auth/AuthProvider';
import { collectDeviceIntegritySignals } from '../auth/deviceTrust';
import { recordDiagnosticEvent } from '../runtime/diagnostics';
import { recordOperationalMetric } from '../runtime/telemetry';
import type { DeviceIntegritySignals } from '../types/runtime';

type MobileSecurityState = {
  integrity: DeviceIntegritySignals | null;
  warning: string | null;
  screenshotProtectionActive: boolean;
  sensitiveScreenCount: number;
  certificatePinningReady: boolean;
  certificatePinningEnforced: boolean;
  certificatePinningWarning: string | null;
  sensitiveOperationsRestricted: boolean;
  registerSensitiveScreen: (reason?: string) => () => void;
  refreshIntegrity: () => Promise<DeviceIntegritySignals | null>;
};

const MobileSecurityContext = createContext<MobileSecurityState | null>(null);

let pinningInitialized = false;

export function MobileSecurityProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const sensitiveReasonsRef = useRef<Map<number, string>>(new Map());
  const sensitiveIdRef = useRef(0);
  const [integrity, setIntegrity] = useState<DeviceIntegritySignals | null>(null);
  const [sensitiveScreenCount, setSensitiveScreenCount] = useState(0);
  const [appStateStatus, setAppStateStatus] = useState<AppStateStatus>(AppState.currentState);
  const [screenshotProtectionActive, setScreenshotProtectionActive] = useState(false);
  const [certificatePinningWarning, setCertificatePinningWarning] = useState<string | null>(null);

  const refreshIntegrity = useCallback(async () => {
    const signals = await collectDeviceIntegritySignals();
    setIntegrity(signals);

    if (signals.suspicious) {
      await recordDiagnosticEvent({
        level: signals.rootedOrJailbroken || signals.tamperedRuntime ? 'error' : 'warn',
        scope: 'security',
        code: 'DEVICE_INTEGRITY_WARNING',
        message: 'Untrusted environment detected.',
        context: {
          rootedOrJailbroken: signals.rootedOrJailbroken,
          emulator: signals.emulator,
          debugBuild: signals.debugBuild,
          tamperedRuntime: signals.tamperedRuntime,
          reasons: signals.reasons.join(','),
        },
      });
      await recordOperationalMetric({
        name: 'mobile_security_event',
        value: 1,
        tags: {
          code: 'DEVICE_INTEGRITY_WARNING',
          rootedOrJailbroken: signals.rootedOrJailbroken,
          tamperedRuntime: signals.tamperedRuntime,
        },
      });
    }

    return signals;
  }, []);

  const registerSensitiveScreen = useCallback((reason = 'sensitive-screen') => {
    const id = sensitiveIdRef.current + 1;
    sensitiveIdRef.current = id;
    sensitiveReasonsRef.current.set(id, reason);
    setSensitiveScreenCount(sensitiveReasonsRef.current.size);

    return () => {
      sensitiveReasonsRef.current.delete(id);
      setSensitiveScreenCount(sensitiveReasonsRef.current.size);
    };
  }, []);

  useEffect(() => {
    void initializeCertificatePinning().then((warning) => {
      setCertificatePinningWarning(warning);
    });
  }, []);

  useEffect(() => {
    if (auth.status === 'authenticated') {
      void refreshIntegrity();
    } else {
      setIntegrity(null);
    }
  }, [auth.status, refreshIntegrity]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;
      setAppStateStatus(nextState);
      if (nextState === 'active' && previousState !== 'active' && auth.status === 'authenticated') {
        void refreshIntegrity();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [auth.status, refreshIntegrity]);

  useEffect(() => {
    const shouldProtect = Boolean(
      apiConfig.security.screenshotProtectionEnabled
        && auth.status === 'authenticated'
        && (sensitiveScreenCount > 0 || appStateStatus !== 'active'),
    );

    if (shouldProtect === screenshotProtectionActive) {
      return;
    }

    setScreenshotProtectionActive(shouldProtect);
    const operation = shouldProtect
      ? ScreenCapture.preventScreenCaptureAsync()
      : ScreenCapture.allowScreenCaptureAsync();

    void operation.catch(async (error) => {
      await recordDiagnosticEvent({
        level: 'warn',
        scope: 'security',
        code: 'SCREEN_CAPTURE_POLICY_FAILED',
        message: error instanceof Error ? error.message : 'Screen capture policy could not be applied.',
        context: {
          active: shouldProtect,
          platform: Platform.OS,
        },
      });
    });
  }, [appStateStatus, auth.status, screenshotProtectionActive, sensitiveScreenCount]);

  const warning = useMemo(() => {
    if (!integrity?.suspicious) {
      return null;
    }
    if (integrity.rootedOrJailbroken) {
      return 'This device does not meet security requirements. Sensitive operations may be restricted.';
    }
    if (integrity.tamperedRuntime) {
      return 'Untrusted environment detected. Sign in from an approved AccessFlow build.';
    }
    if (integrity.emulator || integrity.debugBuild) {
      return 'Development runtime detected. Production controls remain enforced for sensitive screens.';
    }
    return 'Untrusted environment detected.';
  }, [integrity]);

  const sensitiveOperationsRestricted = Boolean(
    integrity && (integrity.rootedOrJailbroken || integrity.tamperedRuntime)
      && apiConfig.environment !== 'development',
  );

  const value = useMemo<MobileSecurityState>(
    () => ({
      integrity,
      warning,
      screenshotProtectionActive,
      sensitiveScreenCount,
      certificatePinningReady: apiConfig.security.certificatePinningPrepared && !certificatePinningWarning,
      certificatePinningEnforced: apiConfig.security.certificatePinningEnforced,
      certificatePinningWarning,
      sensitiveOperationsRestricted,
      registerSensitiveScreen,
      refreshIntegrity,
    }),
    [
      certificatePinningWarning,
      integrity,
      registerSensitiveScreen,
      refreshIntegrity,
      screenshotProtectionActive,
      sensitiveOperationsRestricted,
      sensitiveScreenCount,
      warning,
    ],
  );

  return (
    <MobileSecurityContext.Provider value={value}>
      {children}
    </MobileSecurityContext.Provider>
  );
}

export function useMobileSecurity() {
  const context = useContext(MobileSecurityContext);
  if (!context) {
    throw new Error('useMobileSecurity must be used within MobileSecurityProvider.');
  }
  return context;
}

export function useSensitiveScreenProtection(reason?: string, enabled = true) {
  const { registerSensitiveScreen } = useMobileSecurity();

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    return registerSensitiveScreen(reason);
  }, [enabled, reason, registerSensitiveScreen]);
}

async function initializeCertificatePinning() {
  if (pinningInitialized || !apiConfig.security.certificatePinningEnabled) {
    return null;
  }

  const pinHosts = Object.keys(apiConfig.security.certificatePins);
  if (!pinHosts.length) {
    const message = apiConfig.security.certificatePinningEnforced
      ? 'TLS pinning is enforced but no certificate pins are configured.'
      : 'TLS pinning is prepared but no certificate pins are configured.';
    await recordDiagnosticEvent({
      level: apiConfig.security.certificatePinningEnforced ? 'error' : 'warn',
      scope: 'security',
      code: 'TLS_PINNING_NOT_CONFIGURED',
      message,
      context: {
        environment: apiConfig.environment,
      },
    });
    return message;
  }

  try {
    const sslPinning = optionalRequire('react-native-ssl-public-key-pinning') as {
      initializeSslPinning?: (configuration: Record<string, {
        includeSubdomains?: boolean;
        publicKeyHashes: string[];
      }>) => Promise<void>;
      addSslPinningErrorListener?: (listener: (error: { serverHostname?: string; message?: string }) => void) => { remove: () => void };
    } | null;

    if (!sslPinning?.initializeSslPinning) {
      const message = 'Native TLS pinning module is unavailable in this runtime.';
      await recordDiagnosticEvent({
        level: apiConfig.security.certificatePinningEnforced ? 'error' : 'warn',
        scope: 'security',
        code: 'TLS_PINNING_MODULE_UNAVAILABLE',
        message,
        context: {
          platform: Platform.OS,
          environment: apiConfig.environment,
        },
      });
      return message;
    }

    const configuration = Object.fromEntries(
      Object.entries(apiConfig.security.certificatePins).map(([host, pinSet]) => [
        host,
        {
          includeSubdomains: pinSet.includeSubdomains,
          publicKeyHashes: [...pinSet.publicKeyHashes, ...pinSet.backupPublicKeyHashes],
        },
      ]),
    );

    await sslPinning.initializeSslPinning(configuration);
    sslPinning.addSslPinningErrorListener?.((error) => {
      void recordDiagnosticEvent({
        level: 'error',
        scope: 'security',
        code: 'TLS_PIN_VALIDATION_FAILED',
        message: 'Certificate validation failed for AccessFlow backend communication.',
        context: {
          host: error.serverHostname ?? null,
          detail: error.message ?? null,
        },
      });
    });

    pinningInitialized = true;
    await recordDiagnosticEvent({
      level: 'info',
      scope: 'security',
      code: 'TLS_PINNING_INITIALIZED',
      message: 'TLS certificate pinning initialized for AccessFlow backend communication.',
      context: {
        hosts: pinHosts.join(','),
        enforced: apiConfig.security.certificatePinningEnforced,
      },
    });
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'TLS pinning initialization failed.';
    await recordDiagnosticEvent({
      level: apiConfig.security.certificatePinningEnforced ? 'error' : 'warn',
      scope: 'security',
      code: 'TLS_PINNING_INITIALIZATION_FAILED',
      message,
      context: {
        environment: apiConfig.environment,
      },
    });
    return message;
  }
}

function optionalRequire(moduleName: string) {
  try {
    const dynamicRequire = eval('require') as (name: string) => unknown;
    return dynamicRequire(moduleName);
  } catch {
    return null;
  }
}
