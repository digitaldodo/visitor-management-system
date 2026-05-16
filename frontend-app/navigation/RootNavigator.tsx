import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '../auth/AuthProvider';
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
import { VisitorsScreen } from '../screens/security/VisitorsScreen';
import { WorkforceScreen } from '../screens/security/WorkforceScreen';

const RootStack = createNativeStackNavigator();
const SecurityTabs = createBottomTabNavigator();
const EmployeeTabs = createBottomTabNavigator();
const AuthStack = createNativeStackNavigator();
const AdminStack = createNativeStackNavigator();

export function RootNavigator() {
  const auth = useAuth();

  return (
    <NavigationContainer ref={navigationRef} theme={navigationTheme}>
      {auth.status === 'bootstrapping' ? (
        <BootScreen />
      ) : auth.status === 'recovery' ? (
        <SessionRecoveryScreen />
      ) : auth.status === 'signed-out' ? (
        <AuthNavigator />
      ) : (
        <RootStack.Navigator screenOptions={{ headerShown: false }}>
          {auth.session.user.activeRole === 'SECURITY_GUARD' ? (
            <RootStack.Screen name="SecurityTabs" component={SecurityNavigator} />
          ) : auth.session.user.activeRole === 'EMPLOYEE' ? (
            <RootStack.Screen name="EmployeeTabs" component={EmployeeNavigator} />
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
  return (
    <SecurityTabs.Navigator screenOptions={tabScreenOptions}>
      <SecurityTabs.Screen name="Scan" component={ScanScreen} />
      <SecurityTabs.Screen name="Visitors" component={VisitorsScreen} />
      <SecurityTabs.Screen name="Workforce" component={WorkforceScreen} />
      <SecurityTabs.Screen name="Alerts" component={AlertsScreen} />
      <SecurityTabs.Screen name="Profile" component={ProfileScreen} />
    </SecurityTabs.Navigator>
  );
}

function EmployeeNavigator() {
  return (
    <EmployeeTabs.Navigator screenOptions={tabScreenOptions}>
      <EmployeeTabs.Screen name="Badge" component={BadgeScreen} />
      <EmployeeTabs.Screen name="Requests" component={RequestsScreen} />
      <EmployeeTabs.Screen name="Presence" component={PresenceScreen} />
      <EmployeeTabs.Screen name="Notifications" component={NotificationsScreen} />
      <EmployeeTabs.Screen name="Settings" component={SettingsScreen} />
    </EmployeeTabs.Navigator>
  );
}

function AdminNavigator() {
  return (
    <AdminStack.Navigator screenOptions={{ headerShown: false }}>
      <AdminStack.Screen name="AdminOperational" component={AdminOperationalScreen} />
    </AdminStack.Navigator>
  );
}

const tabScreenOptions = ({ route }: { route: { name: string } }) => ({
  headerShown: false,
  tabBarActiveTintColor: theme.colors.primary,
  tabBarInactiveTintColor: theme.colors.textMuted,
  tabBarStyle: {
    height: 72,
    paddingTop: 6,
    paddingBottom: 8,
    backgroundColor: theme.colors.surface,
    borderTopColor: theme.colors.border,
  },
  tabBarLabelStyle: {
    fontSize: 12,
    fontWeight: '700' as const,
  },
  tabBarIcon: ({ color, size }: { color: string; size: number }) => (
    <Ionicons color={color} name={iconForRoute(route.name)} size={size} />
  ),
});

function iconForRoute(routeName: string): keyof typeof Ionicons.glyphMap {
  const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
    Scan: 'qr-code-outline',
    Visitors: 'people-outline',
    Workforce: 'shield-checkmark-outline',
    Alerts: 'alert-circle-outline',
    Profile: 'person-circle-outline',
    Badge: 'card-outline',
    Requests: 'clipboard-outline',
    Presence: 'time-outline',
    Notifications: 'notifications-outline',
    Settings: 'settings-outline',
  };

  return iconMap[routeName] || 'ellipse-outline';
}
