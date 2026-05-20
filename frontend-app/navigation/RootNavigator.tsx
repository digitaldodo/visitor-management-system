import Ionicons from '@expo/vector-icons/Ionicons';
import * as Linking from 'expo-linking';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthProvider';
import { getWorkspaceConfig } from '../auth/workspaceConfig';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { navigationRef } from './navigationRef';
import { recordObservedError, trackScreenContext } from '../runtime/observability';
import { useOperationalRuntime } from '../runtime/OperationalRuntimeProvider';
import { readOnboardingComplete } from '../storage/onboardingStorage';
import { navigationTheme, theme } from '../theme';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { AuthInterruptionScreen } from '../screens/common/AuthInterruptionScreen';
import { BootScreen } from '../screens/common/BootScreen';
import { LegalScreen } from '../screens/common/LegalScreen';
import { OperationalFeedScreen } from '../screens/common/OperationalFeedScreen';
import { SessionRecoveryScreen } from '../screens/common/SessionRecoveryScreen';
import { OnboardingScreen } from '../screens/onboarding/OnboardingScreen';
import { BadgeScreen } from '../screens/employee/BadgeScreen';
import { NotificationsScreen } from '../screens/employee/NotificationsScreen';
import { PresenceScreen } from '../screens/employee/PresenceScreen';
import { RequestsScreen } from '../screens/employee/RequestsScreen';
import { SettingsScreen } from '../screens/employee/SettingsScreen';
import { EmergencyOpsScreen } from '../screens/emergency/EmergencyOpsScreen';
import { AlertsScreen } from '../screens/security/AlertsScreen';
import { ProfileScreen } from '../screens/security/ProfileScreen';
import { ScanScreen } from '../screens/security/ScanScreen';
import { SecurityRegisterScreen } from '../screens/security/SecurityRegisterScreen';
import { VisitorDetailScreen } from '../screens/security/VisitorDetailScreen';
import { VisitorsScreen } from '../screens/security/VisitorsScreen';
import { WorkforceScreen } from '../screens/security/WorkforceScreen';
import {
  AdminAlertsScreen,
  AdminApprovalsScreen,
  AdminDashboardScreen,
  AdminEmployeesScreen,
  AdminMoreScreen,
  AdminRegisterScreen,
  AdminSettingsScreen,
  AdminVisitorsScreen,
  AdminWorkforceScreen,
} from '../screens/admin/AdminOperationalScreen';
import {
  VisitorHomeScreen,
  VisitorNotificationsScreen,
  VisitorPassScreen,
  VisitorProfileScreen,
  VisitorRequestScreen,
} from '../screens/visitor/VisitorScreens';
import { VisitorInviteRegistrationScreen } from '../screens/visitor/VisitorInviteRegistrationScreen';

const RootStack = createNativeStackNavigator();
const SecurityStack = createNativeStackNavigator();
const SecurityTabs = createBottomTabNavigator();
const EmployeeTabs = createBottomTabNavigator();
const VisitorTabs = createBottomTabNavigator();
const AdminTabs = createBottomTabNavigator();
const AuthStack = createNativeStackNavigator();

export function RootNavigator() {
  const auth = useAuth();
  const workspaceConfig = auth.status === 'authenticated'
    ? getWorkspaceConfig(auth.session.user.activeRole)
    : null;
  const activeRole = auth.status === 'authenticated' ? auth.session.user.activeRole : null;

  const captureCurrentRoute = () => {
    const route = navigationRef.getCurrentRoute() as { name?: string } | undefined;
    if (!route?.name) {
      return;
    }
    void trackScreenContext(route.name, activeRole);
  };

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navigationTheme}
      linking={linkingConfig}
      onReady={captureCurrentRoute}
      onStateChange={captureCurrentRoute}
      onUnhandledAction={(action) => {
        void recordObservedError({
          error: new Error(`Unhandled navigation action: ${String(action.type || 'unknown')}`),
          code: 'NAVIGATION_ACTION_UNHANDLED',
          scope: 'navigation',
          level: 'warn',
          context: {
            actionType: String(action.type || 'unknown'),
            role: activeRole ?? 'signed_out',
          },
        });
      }}
    >
      {auth.status === 'bootstrapping' ? (
        <BootScreen />
      ) : auth.status === 'auth-interrupted' ? (
        <AuthInterruptionScreen />
      ) : auth.status === 'recovery' ? (
        <SessionRecoveryScreen />
      ) : auth.status === 'signed-out' ? (
        <AuthNavigator />
      ) : (
        <RootStack.Navigator
          screenOptions={{
            headerShown: false,
            animation: 'fade',
          }}
        >
          {workspaceConfig?.navigator === 'SecurityTabs' ? (
            <RootStack.Screen name="SecurityStack" component={SecurityStackNavigator} />
          ) : workspaceConfig?.navigator === 'EmployeeTabs' ? (
            <RootStack.Screen name="EmployeeTabs" component={EmployeeNavigator} />
          ) : workspaceConfig?.navigator === 'VisitorTabs' ? (
            <RootStack.Screen name="VisitorTabs" component={VisitorNavigator} />
          ) : (
            <RootStack.Screen name="AdminStack" component={AdminNavigator} />
          )}
        </RootStack.Navigator>
      )}
    </NavigationContainer>
  );
}

function AuthNavigator() {
  const [initialRoute, setInitialRoute] = useState<'Onboarding' | 'Login' | null>(null);

  useEffect(() => {
    let active = true;
    void readOnboardingComplete()
      .then((complete) => {
        if (active) {
          setInitialRoute(complete ? 'Login' : 'Onboarding');
        }
      })
      .catch(() => {
        if (active) {
          setInitialRoute('Onboarding');
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (!initialRoute) {
    return <BootScreen />;
  }

  return (
    <AuthStack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false, animation: 'fade_from_bottom' }}>
      <AuthStack.Screen name="Onboarding" component={OnboardingScreen} />
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Legal" component={LegalScreen} options={{ animation: 'slide_from_right' }} />
      <AuthStack.Screen name="VisitorInviteRegistration" component={VisitorInviteRegistrationScreen} />
    </AuthStack.Navigator>
  );
}

const linkingConfig = {
  prefixes: [Linking.createURL('/'), 'accessflow://'],
  config: {
    screens: {
      VisitorInviteRegistration: 'visitor-invite/:token',
    },
  },
};

function SecurityStackNavigator() {
  return (
    <SecurityStack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <SecurityStack.Screen name="SecurityTabs" component={SecurityNavigator} />
      <SecurityStack.Screen name="VisitorDetail" component={VisitorDetailScreen} />
    </SecurityStack.Navigator>
  );
}

function SecurityNavigator() {
  const screenOptions = useMobileTabOptions();
  const { devicePosture } = useOperationalRuntime();
  const restrictedOperationalMode = devicePosture.operationalModeEnabled && devicePosture.restrictedNavigation;

  return (
    <SecurityTabs.Navigator
      backBehavior="history"
      initialRouteName="Scan"
      screenOptions={screenOptions}
    >
      <SecurityTabs.Screen name="Scan" component={ScanScreen} />
      <SecurityTabs.Screen name="Visitors" component={VisitorsScreen} />
      {restrictedOperationalMode ? null : <SecurityTabs.Screen name="Register" component={SecurityRegisterScreen} />}
      {restrictedOperationalMode ? null : <SecurityTabs.Screen name="Workforce" component={WorkforceScreen} />}
      <SecurityTabs.Screen name="Alerts" component={AlertsScreen} />
      <SecurityTabs.Screen name="Emergency" component={EmergencyOpsScreen} />
      <SecurityTabs.Screen name="Profile" component={ProfileScreen} />
    </SecurityTabs.Navigator>
  );
}

function EmployeeNavigator() {
  const screenOptions = useMobileTabOptions();

  return (
    <EmployeeTabs.Navigator backBehavior="history" initialRouteName="Requests" screenOptions={screenOptions}>
      <EmployeeTabs.Screen name="Badge" component={BadgeScreen} />
      <EmployeeTabs.Screen name="Requests" component={RequestsScreen} />
      <EmployeeTabs.Screen name="Presence" component={PresenceScreen} />
      <EmployeeTabs.Screen name="Notifications" component={NotificationsScreen} />
      <EmployeeTabs.Screen name="Profile" component={SettingsScreen} />
    </EmployeeTabs.Navigator>
  );
}

function VisitorNavigator() {
  const screenOptions = useMobileTabOptions();

  return (
    <VisitorTabs.Navigator backBehavior="history" initialRouteName="Home" screenOptions={screenOptions}>
      <VisitorTabs.Screen name="Home" component={VisitorHomeScreen} />
      <VisitorTabs.Screen name="Request" component={VisitorRequestScreen} />
      <VisitorTabs.Screen name="Pass" component={VisitorPassScreen} />
      <VisitorTabs.Screen name="Notifications" component={VisitorNotificationsScreen} />
      <VisitorTabs.Screen name="Profile" component={VisitorProfileScreen} />
    </VisitorTabs.Navigator>
  );
}

function AdminNavigator() {
  const screenOptions = useMobileTabOptions();

  return (
    <AdminTabs.Navigator backBehavior="history" screenOptions={screenOptions}>
      <AdminTabs.Screen name="Dashboard" component={AdminDashboardScreen} />
      <AdminTabs.Screen name="Approvals" component={AdminApprovalsScreen} />
      <AdminTabs.Screen name="Workforce" component={AdminWorkforceScreen} />
      <AdminTabs.Screen name="Alerts" component={AdminAlertsScreen} />
      <AdminTabs.Screen name="More" component={AdminMoreScreen} options={{ tabBarLabel: 'More' }} />
      <AdminTabs.Screen name="Live" component={OperationalFeedScreen} options={{ tabBarButton: () => null }} />
      <AdminTabs.Screen name="Visitors" component={AdminVisitorsScreen} options={{ tabBarButton: () => null }} />
      <AdminTabs.Screen name="Emergency" component={EmergencyOpsScreen} options={{ tabBarButton: () => null }} />
      <AdminTabs.Screen name="Register" component={AdminRegisterScreen} options={{ tabBarButton: () => null }} />
      <AdminTabs.Screen name="Employees" component={AdminEmployeesScreen} options={{ tabBarButton: () => null }} />
      <AdminTabs.Screen name="Profile" component={AdminSettingsScreen} options={{ tabBarButton: () => null }} />
    </AdminTabs.Navigator>
  );
}

function useMobileTabOptions() {
  const insets = useSafeAreaInsets();
  const layout = useResponsiveLayout();

  return ({ route }: { route: { name: string } }) => ({
    headerShown: false,
    lazy: true,
    freezeOnBlur: true,
    tabBarActiveTintColor: theme.colors.primary,
    tabBarInactiveTintColor: theme.colors.textMuted,
    tabBarActiveBackgroundColor: theme.colors.primarySoft,
    tabBarHideOnKeyboard: true,
    tabBarStyle: {
      height: layout.tabBarHeight + insets.bottom,
      paddingTop: layout.isSmallPhone ? 5 : 7,
      paddingBottom: Math.max(insets.bottom, 8),
      backgroundColor: theme.colors.surfaceSubtle,
      borderTopColor: theme.colors.border,
      borderTopWidth: 1,
      elevation: 12,
    },
    tabBarItemStyle: {
      minHeight: layout.isSmallPhone ? 52 : 58,
      borderRadius: theme.radii.lg,
      marginHorizontal: 3,
    },
    tabBarLabelStyle: {
      fontSize: layout.isSmallPhone ? 10 : 11,
      fontWeight: '700' as const,
    },
    tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
      <Ionicons color={color} name={iconForRoute(route.name)} size={focused ? 23 : 21} />
    ),
  });
}

function iconForRoute(routeName: string): keyof typeof Ionicons.glyphMap {
  const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
    Scan: 'qr-code-outline',
    Visitors: 'people-outline',
    Workforce: 'shield-checkmark-outline',
    Register: 'reader-outline',
    Alerts: 'alert-circle-outline',
    Emergency: 'warning-outline',
    Profile: 'person-circle-outline',
    Badge: 'card-outline',
    Requests: 'clipboard-outline',
    Presence: 'time-outline',
    Notifications: 'notifications-outline',
    Settings: 'settings-outline',
    Home: 'home-outline',
    Request: 'add-circle-outline',
    Pass: 'ticket-outline',
    Dashboard: 'grid-outline',
    Approvals: 'checkmark-done-outline',
    Employees: 'id-card-outline',
    Live: 'pulse-outline',
    More: 'ellipsis-horizontal-circle-outline',
  };

  return iconMap[routeName] || 'ellipse-outline';
}
