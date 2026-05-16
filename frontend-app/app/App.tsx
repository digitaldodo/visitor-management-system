import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { RootNavigator } from '../navigation/RootNavigator';
import { OperationalRuntimeProvider } from '../runtime/OperationalRuntimeProvider';
import { AppErrorBoundary } from './AppErrorBoundary';
import { theme } from '../theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnReconnect: true,
      refetchOnMount: 'always',
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
      <StatusBar style="dark" backgroundColor={theme.colors.canvas} />
      <RootNavigator />
    </>
  );
}

export default function AccessFlowApp() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <OperationalRuntimeProvider>
              <AppErrorBoundary>
                <AppBootstrap />
              </AppErrorBoundary>
            </OperationalRuntimeProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
