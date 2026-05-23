import Ionicons from '@expo/vector-icons/Ionicons';
import * as Linking from 'expo-linking';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthProvider';
import { getWorkspaceConfig } from '../auth/workspaceConfig';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { useLocalization, type TranslationKey } from '../localization/LocalizationProvider';
import { navigationRef } from './navigationRef';
import { recordObservedError, trackScreenContext } from '../runtime/observability';
import { useOperationalRuntime } from '../runtime/OperationalRuntimeProvider';
import { readOnboardingComplete } from '../storage/onboardingStorage';
import { navigationTheme, theme } from '../theme';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { EmailVerificationScreen } from '../screens/auth/EmailVerificationScreen';
import { BootScreen } from '../screens/common/BootScreen';
import { LegalScreen } from '../screens/common/LegalScreen';
import { OperationalFeedScreen } from '../screens/common/OperationalFeedScreen';
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
  AdminAnalyticsScreen,
  AdminApprovalsScreen,
  AdminDashboardScreen,
  AdminEmployeesScreen,
  AdminHelpScreen,
  AdminMoreScreen,
  AdminOrganizationScreen,
  AdminRegisterScreen,
  AdminReportsScreen,
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

const adminPrimaryRoutes = ['Dashboard', 'Approvals', 'Visitors', 'Workforce', 'More'];

const adminRouteFocusMap: Record<string, string> = {
  Analytics: 'Dashboard',
  Alerts: 'Dashboard',
  Live: 'Dashboard',
  Employees: 'Workforce',
  Emergency: 'More',
  Help: 'More',
  Register: 'Visitors',
  Reports: 'More',
  Organization: 'More',
  Profile: 'More',
};

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
          <RootStack.Screen name="VisitorInviteRegistration" component={VisitorInviteRegistrationScreen} options={{ animation: 'slide_from_right' }} />
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
      <AuthStack.Screen name="VerifyEmail" component={EmailVerificationScreen} options={{ animation: 'slide_from_right' }} />
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
      VerifyEmail: 'verify-email',
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
    <AdminTabs.Navigator backBehavior="history" initialRouteName="Dashboard" screenOptions={screenOptions} tabBar={(props) => <AdminBottomTabBar {...props} />}>
      <AdminTabs.Screen name="Dashboard" component={AdminDashboardScreen} />
      <AdminTabs.Screen name="Approvals" component={AdminApprovalsScreen} />
      <AdminTabs.Screen name="Visitors" component={AdminVisitorsScreen} />
      <AdminTabs.Screen name="Workforce" component={AdminWorkforceScreen} />
      <AdminTabs.Screen name="More" component={AdminMoreScreen} />
      <AdminTabs.Screen name="Analytics" component={AdminAnalyticsScreen} options={{ tabBarButton: () => null }} />
      <AdminTabs.Screen name="Alerts" component={AdminAlertsScreen} options={{ tabBarButton: () => null }} />
      <AdminTabs.Screen name="Live" component={OperationalFeedScreen} options={{ tabBarButton: () => null }} />
      <AdminTabs.Screen name="Emergency" component={EmergencyOpsScreen} options={{ tabBarButton: () => null }} />
      <AdminTabs.Screen name="Register" component={AdminRegisterScreen} options={{ tabBarButton: () => null }} />
      <AdminTabs.Screen name="Employees" component={AdminEmployeesScreen} options={{ tabBarButton: () => null }} />
      <AdminTabs.Screen name="Reports" component={AdminReportsScreen} options={{ tabBarButton: () => null }} />
      <AdminTabs.Screen name="Organization" component={AdminOrganizationScreen} options={{ tabBarButton: () => null }} />
      <AdminTabs.Screen name="Help" component={AdminHelpScreen} options={{ tabBarButton: () => null }} />
      <AdminTabs.Screen name="Profile" component={AdminSettingsScreen} options={{ tabBarButton: () => null }} />
    </AdminTabs.Navigator>
  );
}

function AdminBottomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const layout = useResponsiveLayout();
  const { t } = useLocalization();
  const activeRouteName = state.routes[state.index]?.name;
  const activePrimaryRoute = adminRouteFocusMap[activeRouteName] ?? activeRouteName;
  const visibleRoutes = useMemo(
    () => state.routes.filter((route) => adminPrimaryRoutes.includes(route.name)),
    [state.routes],
  );

  return (
    <View
      style={[
        adminTabStyles.host,
        {
          height: layout.tabBarHeight + Math.max(insets.bottom, 10),
          paddingBottom: Math.max(insets.bottom, 10),
          paddingHorizontal: layout.tabBarHorizontalPadding,
        },
      ]}
    >
      <View style={[adminTabStyles.rail, { maxWidth: layout.tabBarMaxWidth, minHeight: layout.tabBarHeight - 8 }]}>
        {visibleRoutes.map((route) => {
          const descriptor = descriptors[route.key];
          const focused = activePrimaryRoute === route.name;
          return (
            <AdminTabItem
              key={route.key}
              focused={focused}
              iconName={iconForRoute(route.name)}
              label={typeof descriptor.options.tabBarLabel === 'string' ? descriptor.options.tabBarLabel : t(navLabelKeyForRoute(route.name))}
              navigation={navigation}
              routeParams={route.params}
              routeKey={route.key}
              routeName={route.name}
            />
          );
        })}
      </View>
    </View>
  );
}

const AdminTabItem = memo(function AdminTabItem({
  focused,
  iconName,
  label,
  navigation,
  routeParams,
  routeKey,
  routeName,
}: {
  focused: boolean;
  iconName: keyof typeof Ionicons.glyphMap;
  label: string;
  navigation: BottomTabBarProps['navigation'];
  routeParams?: object;
  routeKey: string;
  routeName: string;
}) {
  const progress = useRef(new Animated.Value(focused ? 1 : 0)).current;

  const handleLongPress = useCallback(() => {
    navigation.emit({ type: 'tabLongPress', target: routeKey });
  }, [navigation, routeKey]);

  const handlePress = useCallback(() => {
    const event = navigation.emit({
      type: 'tabPress',
      target: routeKey,
      canPreventDefault: true,
    });

    if (!focused && !event.defaultPrevented) {
      navigation.navigate(routeName, routeParams);
    }
  }, [focused, navigation, routeKey, routeName, routeParams]);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: focused ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [focused, progress]);

  const activeOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const inactiveOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const activeScale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="tab"
      accessibilityState={focused ? { selected: true } : {}}
      hitSlop={6}
      testID={`admin-tab-${routeName}`}
      onLongPress={handleLongPress}
      onPress={handlePress}
      style={({ pressed }) => [
        adminTabStyles.item,
        pressed ? adminTabStyles.itemPressed : null,
      ]}
    >
      <View style={adminTabStyles.iconWrap}>
        <Animated.View style={[adminTabStyles.activePill, { opacity: activeOpacity, transform: [{ scale: activeScale }] }]} />
        <Animated.View style={[adminTabStyles.inactiveIconLayer, { opacity: inactiveOpacity }]}>
          <Ionicons color={theme.colors.textMuted} name={iconName} size={21} />
        </Animated.View>
        <Animated.View style={[adminTabStyles.activeIconLayer, { opacity: activeOpacity, transform: [{ scale: activeScale }] }]}>
          <Ionicons color={theme.colors.textPrimary} name={iconName} size={23} />
        </Animated.View>
      </View>
      <Text
        allowFontScaling
        maxFontSizeMultiplier={1.12}
        numberOfLines={1}
        style={[adminTabStyles.label, focused ? adminTabStyles.labelActive : null]}
      >
        {label}
      </Text>
      <Animated.View style={[adminTabStyles.activeDot, { opacity: activeOpacity, transform: [{ scale: activeScale }] }]} />
    </Pressable>
  );
});

function useMobileTabOptions() {
  const insets = useSafeAreaInsets();
  const layout = useResponsiveLayout();
  const { t } = useLocalization();

  return ({ route }: { route: { name: string } }) => ({
    headerShown: false,
    lazy: true,
    freezeOnBlur: true,
    tabBarActiveTintColor: theme.colors.primary,
    tabBarInactiveTintColor: theme.colors.textMuted,
    tabBarHideOnKeyboard: true,
    tabBarLabelPosition: 'below-icon' as const,
    tabBarStyle: {
      height: layout.tabBarHeight + insets.bottom,
      paddingTop: layout.isSmallPhone ? 6 : 8,
      paddingBottom: Math.max(insets.bottom, 10),
      paddingHorizontal: layout.tabBarHorizontalPadding,
      backgroundColor: theme.colors.surfaceSubtle,
      borderTopColor: theme.colors.border,
      borderTopWidth: 1,
      elevation: 12,
    },
    tabBarItemStyle: {
      flex: 1,
      minHeight: layout.isSmallPhone ? 56 : 62,
      borderRadius: theme.radii.md,
      marginHorizontal: 2,
      paddingVertical: 4,
    },
    tabBarLabelStyle: {
      fontSize: layout.isSmallPhone ? 10 : 11.5,
      fontWeight: '700' as const,
      lineHeight: layout.isSmallPhone ? 13 : 15,
      textAlign: 'center' as const,
      marginTop: 2,
    },
    tabBarLabel: t(navLabelKeyForRoute(route.name)),
    tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
      <Ionicons color={color} name={iconForRoute(route.name)} size={focused ? 23 : 21} />
    ),
  });
}

function navLabelKeyForRoute(routeName: string): TranslationKey {
  const labelMap: Record<string, TranslationKey> = {
    Scan: 'nav.qr',
    Visitors: 'nav.visitors',
    Workforce: 'nav.workforce',
    Register: 'nav.register',
    Alerts: 'nav.alerts',
    Emergency: 'nav.emergency',
    Profile: 'nav.profile',
    Badge: 'nav.badge',
    Requests: 'nav.requests',
    Presence: 'nav.presence',
    Notifications: 'nav.notifications',
    Home: 'nav.home',
    Request: 'nav.request',
    Pass: 'nav.pass',
    Dashboard: 'nav.home',
    Analytics: 'nav.analytics',
    Approvals: 'nav.approvals',
    Employees: 'nav.employees',
    Reports: 'nav.reports',
    Organization: 'nav.organization',
    Help: 'nav.help',
    Live: 'nav.activity',
    More: 'nav.more',
  };

  return labelMap[routeName] || 'nav.more';
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
    Dashboard: 'home-outline',
    Analytics: 'analytics-outline',
    Approvals: 'checkmark-done-outline',
    Employees: 'id-card-outline',
    Reports: 'document-text-outline',
    Organization: 'business-outline',
    Help: 'help-circle-outline',
    Live: 'pulse-outline',
    More: 'ellipsis-horizontal-circle-outline',
  };

  return iconMap[routeName] || 'ellipse-outline';
}

const adminTabStyles = StyleSheet.create({
  host: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSubtle,
    borderTopColor: theme.colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 18,
  },
  rail: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: 4,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(9, 17, 30, 0.94)',
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  item: {
    flex: 1,
    minWidth: 0,
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: theme.radii.md,
    paddingHorizontal: 2,
    paddingVertical: 4,
  },
  itemPressed: {
    opacity: 0.82,
  },
  iconWrap: {
    width: 38,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activePill: {
    position: 'absolute',
    width: 38,
    height: 30,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.primarySoft,
  },
  inactiveIconLayer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeIconLayer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    width: '100%',
    color: theme.colors.textMuted,
    fontSize: 10.5,
    fontWeight: '700',
    lineHeight: 13,
    textAlign: 'center',
  },
  labelActive: {
    color: theme.colors.textPrimary,
    fontWeight: '800',
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.primary,
  },
});
