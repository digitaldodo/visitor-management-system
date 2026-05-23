import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef, type ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { enableFreeze } from 'react-native-screens';

import { AuthProvider } from '../auth/AuthProvider';
import { shouldRetryQuery } from '../api/queryRetry';
import { OperationalSnackbarProvider, useOperationalSnackbar } from '../components/feedback/OperationalSnackbar';
import { LocalizationProvider } from '../localization/LocalizationProvider';
import { PermissionEducationProvider } from '../permissions/permissionEducation';
import { OperationalRuntimeProvider } from '../runtime/OperationalRuntimeProvider';
import { MobileSecurityProvider, useMobileSecurity } from '../security/MobileSecurityProvider';
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

enableFreeze(true);

export function AppProviders({ children }: { children: ReactNode }) {
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
                      {children}
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
