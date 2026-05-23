import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { useAuth } from '../auth/AuthProvider';
import { RootNavigator } from '../navigation/RootNavigator';
import { AppProviders } from '../providers/AppProviders';
import { OperationalLockOverlay } from '../runtime/OperationalLockOverlay';
import { AppErrorBoundary } from './AppErrorBoundary';
import { theme } from '../theme';

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

export default function AccessFlowApp() {
  return (
    <AppProviders>
      <AppBoundaryHost />
    </AppProviders>
  );
}
