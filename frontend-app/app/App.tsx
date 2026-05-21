import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { OperationalSnackbarProvider } from '../components/feedback/OperationalSnackbar';
import { useOperationalSnackbar } from '../components/feedback/OperationalSnackbar';
import { LocalizationProvider } from '../localization/LocalizationProvider';
import { RootNavigator } from '../navigation/RootNavigator';
import { PermissionEducationProvider } from '../permissions/permissionEducation';
import { OperationalLockOverlay } from '../runtime/OperationalLockOverlay';
import { OperationalRuntimeProvider } from '../runtime/OperationalRuntimeProvider';
import { MobileSecurityProvider, useMobileSecurity } from '../security/MobileSecurityProvider';
import { AppErrorBoundary } from './AppErrorBoundary';
import { theme } from '../theme';
import type { AppError } from '../types/api';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => shouldRetryQuery(failureCount, error as unknown as AppError | undefined),
      staleTime: 45_000,
      gcTime: 10 * 60_000,
      refetchOnReconnect: true,
      refetchOnMount: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

function AppBootstrap() {
  const { status } = useAuth();

  useEffect(() => {
    if (status !== 'bootstrapping') {
      void SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [status]);

  return (
    <>
      <StatusBar style="light" backgroundColor={theme.colors.canvas} />
      <RootNavigator />
      <OperationalLockOverlay />
    </>
  );
}

function AppBoundaryHost() {
  const auth = useAuth();

  return (
    <AppErrorBoundary
      onRecoverShell={auth.recoverAppShell}
      onSafeLogout={auth.logout}
    >
      <AppBootstrap />
    </AppErrorBoundary>
  );
}

function RuntimeFeedbackBridge() {
  const mobileSecurity = useMobileSecurity();
  const { showSnackbar } = useOperationalSnackbar();
  const lastCertificateWarningRef = useRef<string | null>(null);
  const lastCertificateWarningAtRef = useRef(0);

  useEffect(() => {
    if (
      mobileSecurity.certificatePinningWarning
      && (
        mobileSecurity.certificatePinningWarning !== lastCertificateWarningRef.current
        || Date.now() - lastCertificateWarningAtRef.current > 30 * 60_000
      )
    ) {
      lastCertificateWarningRef.current = mobileSecurity.certificatePinningWarning;
      lastCertificateWarningAtRef.current = Date.now();
      showSnackbar({
        message: mobileSecurity.certificatePinningWarning,
        tone: 'danger',
        durationMs: 5200,
        dedupeKey: 'certificate-pinning-warning',
        minIntervalMs: 30 * 60_000,
      });
    }
  }, [
    mobileSecurity.certificatePinningWarning,
    showSnackbar,
  ]);

  return null;
}

export default function AccessFlowApp() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <LocalizationProvider>
            <PermissionEducationProvider>
              <AuthProvider>
                <MobileSecurityProvider>
                  <OperationalRuntimeProvider>
                    <OperationalSnackbarProvider>
                      <RuntimeFeedbackBridge />
                      <AppBoundaryHost />
                    </OperationalSnackbarProvider>
                  </OperationalRuntimeProvider>
                </MobileSecurityProvider>
              </AuthProvider>
            </PermissionEducationProvider>
          </LocalizationProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function shouldRetryQuery(failureCount: number, error?: AppError) {
  if (!error) {
    return failureCount < 2;
  }

  if (error.kind === 'auth' || error.kind === 'config' || error.kind === 'version') {
    return false;
  }

  if (error.status && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429) {
    return false;
  }

  return failureCount < 2;
}
