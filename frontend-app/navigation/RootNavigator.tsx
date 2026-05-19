import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthProvider';
import { getWorkspaceConfig } from '../auth/workspaceConfig';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { navigationRef } from './navigationRef';
import { navigationTheme, theme } from '../theme';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { AdminOperationalScreen } from '../screens/admin/AdminOperationalScreen';
import { BootScreen } from '../screens/common/BootScreen';
import { SessionRecoveryScreen } from '../screens/common/SessionRecoveryScreen';
import { BadgeScreen } from '../screens/employee/BadgeScreen';
import { NotificationsScreen } from '../screens/employee/NotificationsScreen';
import { PresenceScreen } from '../screens/employee/PresenceScreen';
import { RequestsScreen } from '../screens/employee/RequestsScreen';
import { SettingsScreen } from '../screens/employee/SettingsScreen';
import { AlertsScreen } from '../screens/security/AlertsScreen';
import { ProfileScreen } from '../screens/security/ProfileScreen';
import { ScanScreen } from '../screens/security/ScanScreen';
import { SecurityRegisterScreen } from '../screens/security/SecurityRegisterScreen';
import { VisitorsScreen } from '../screens/security/VisitorsScreen';
import { WorkforceScreen } from '../screens/security/WorkforceScreen';
import {
  VisitorHomeScreen,
  VisitorNotificationsScreen,
  VisitorPassScreen,
  VisitorProfileScreen,
  VisitorRequestScreen,
} from '../screens/visitor/VisitorScreens';

const RootStack = createNativeStackNavigator();
const SecurityTabs = createBottomTabNavigator();
const EmployeeTabs = createBottomTabNavigator();
const VisitorTabs = createBottomTabNavigator();
const AuthStack = createNativeStackNavigator();
const AdminStack = createNativeStackNavigator();

export function RootNavigator() {
  const auth = useAuth();
  const workspaceConfig = auth.status === 'authenticated'
    ? getWorkspaceConfig(auth.session.user.activeRole)
    : null;

  return (
    <NavigationContainer ref={navigationRef} theme={navigationTheme}>
      {auth.status === 'bootstrapping' ? (
        <BootScreen />
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
            <RootStack.Screen name="SecurityTabs" component={SecurityNavigator} />
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
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
    </AuthStack.Navigator>
  );
}

function SecurityNavigator() {
  const screenOptions = useMobileTabOptions();

  return (
    <SecurityTabs.Navigator backBehavior="history" screenOptions={screenOptions}>
      <SecurityTabs.Screen name="Scan" component={ScanScreen} />
      <SecurityTabs.Screen name="Visitors" component={VisitorsScreen} />
      <SecurityTabs.Screen name="Register" component={SecurityRegisterScreen} />
      <SecurityTabs.Screen name="Workforce" component={WorkforceScreen} />
      <SecurityTabs.Screen name="Alerts" component={AlertsScreen} />
      <SecurityTabs.Screen name="Profile" component={ProfileScreen} />
    </SecurityTabs.Navigator>
  );
}

function EmployeeNavigator() {
  const screenOptions = useMobileTabOptions();

  return (
    <EmployeeTabs.Navigator backBehavior="history" screenOptions={screenOptions}>
      <EmployeeTabs.Screen name="Badge" component={BadgeScreen} />
      <EmployeeTabs.Screen name="Requests" component={RequestsScreen} />
      <EmployeeTabs.Screen name="Presence" component={PresenceScreen} />
      <EmployeeTabs.Screen name="Notifications" component={NotificationsScreen} />
      <EmployeeTabs.Screen name="Settings" component={SettingsScreen} />
    </EmployeeTabs.Navigator>
  );
}

function VisitorNavigator() {
  const screenOptions = useMobileTabOptions();

  return (
    <VisitorTabs.Navigator backBehavior="history" screenOptions={screenOptions}>
      <VisitorTabs.Screen name="Home" component={VisitorHomeScreen} />
      <VisitorTabs.Screen name="Request" component={VisitorRequestScreen} />
      <VisitorTabs.Screen name="Pass" component={VisitorPassScreen} />
      <VisitorTabs.Screen name="Notifications" component={VisitorNotificationsScreen} />
      <VisitorTabs.Screen name="Profile" component={VisitorProfileScreen} />
    </VisitorTabs.Navigator>
  );
}

function AdminNavigator() {
  return (
    <AdminStack.Navigator screenOptions={{ headerShown: false }}>
      <AdminStack.Screen name="AdminOperational" component={AdminOperationalScreen} />
    </AdminStack.Navigator>
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
    Profile: 'person-circle-outline',
    Badge: 'card-outline',
    Requests: 'clipboard-outline',
    Presence: 'time-outline',
    Notifications: 'notifications-outline',
    Settings: 'settings-outline',
    Home: 'home-outline',
    Request: 'add-circle-outline',
    Pass: 'ticket-outline',
  };

  return iconMap[routeName] || 'ellipse-outline';
}
