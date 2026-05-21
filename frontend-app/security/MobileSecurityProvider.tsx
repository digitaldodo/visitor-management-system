import * as ScreenCapture from 'expo-screen-capture';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { apiConfig } from '../api/apiConfig';
import { useAuth } from '../auth/AuthProvider';
import { collectDeviceIntegritySignals } from '../auth/deviceIdentity';
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
const TLS_WARNING_THROTTLE_MS = 30 * 60_000;
const TLS_FAILURES_BEFORE_USER_NOTICE = 5;

export function MobileSecurityProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const sensitiveReasonsRef = useRef<Map<number, string>>(new Map());
  const sensitiveIdRef = useRef(0);
  const certificateFailuresRef = useRef<Record<string, { count: number; lastWarnedAt: number }>>({});
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

  const handleCertificateValidationFailure = useCallback((error: { serverHostname?: string; message?: string }) => {
    const host = error.serverHostname ?? 'unknown';
    const previous = certificateFailuresRef.current[host] ?? { count: 0, lastWarnedAt: 0 };
    const now = Date.now();
    const next = { count: previous.count + 1, lastWarnedAt: previous.lastWarnedAt };
    certificateFailuresRef.current[host] = next;

    void recordDiagnosticEvent({
      level: 'error',
      scope: 'security',
      code: 'TLS_PIN_VALIDATION_FAILED',
      message: 'Secure connection validation failed for AccessFlow backend communication.',
      context: {
        host,
        detail: error.message ?? null,
        count: next.count,
      },
    });

    if (
      !apiConfig.security.certificatePinningEnforced
      || next.count < TLS_FAILURES_BEFORE_USER_NOTICE
      || now - previous.lastWarnedAt < TLS_WARNING_THROTTLE_MS
    ) {
      return;
    }

    certificateFailuresRef.current[host] = { ...next, lastWarnedAt: now };
    setCertificatePinningWarning('Secure connection verification is taking longer than expected. AccessFlow is retrying protected actions.');
  }, []);

  useEffect(() => {
    void initializeCertificatePinning(handleCertificateValidationFailure).then((warning) => {
      setCertificatePinningWarning(warning);
    });
  }, [handleCertificateValidationFailure]);

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
      return 'This device needs organization review before sensitive actions are available.';
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

async function initializeCertificatePinning(
  onValidationFailure: (error: { serverHostname?: string; message?: string }) => void,
) {
  if (pinningInitialized || !apiConfig.security.certificatePinningEnabled) {
    return null;
  }

  const pinHosts = Object.keys(apiConfig.security.certificatePins);
  if (!pinHosts.length) {
    await recordDiagnosticEvent({
      level: apiConfig.security.certificatePinningEnforced ? 'error' : 'warn',
      scope: 'security',
      code: 'TLS_PINNING_NOT_CONFIGURED',
      message: 'TLS pinning is enabled but no certificate pins are configured.',
      context: {
        environment: apiConfig.environment,
      },
    });
    return null;
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
      const diagnosticMessage = 'Native TLS pinning module is unavailable in this runtime.';
      await recordDiagnosticEvent({
        level: apiConfig.security.certificatePinningEnforced ? 'error' : 'warn',
        scope: 'security',
        code: 'TLS_PINNING_MODULE_UNAVAILABLE',
        message: diagnosticMessage,
        context: {
          platform: Platform.OS,
          environment: apiConfig.environment,
        },
      });
      return null;
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
      onValidationFailure(error);
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
    const diagnosticMessage = error instanceof Error ? error.message : 'TLS pinning initialization failed.';
    await recordDiagnosticEvent({
      level: apiConfig.security.certificatePinningEnforced ? 'error' : 'warn',
      scope: 'security',
      code: 'TLS_PINNING_INITIALIZATION_FAILED',
      message: diagnosticMessage,
      context: {
        environment: apiConfig.environment,
      },
    });
    return null;
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
