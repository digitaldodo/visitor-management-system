import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';

import { apiConfig } from '../api/apiConfig';
import type { ActiveWorkspaceRole, WorkspaceAudience } from '../types/auth';

declare const require: (moduleName: string) => any;

type FirebaseModuleCache = {
  messaging?: any | null;
  crashlytics?: any | null;
  analytics?: any | null;
};

export type FirebaseMessagePayload = {
  messageId?: string | null;
  data?: Record<string, string>;
  notification?: {
    title?: string | null;
    body?: string | null;
    android?: {
      channelId?: string | null;
    };
  } | null;
  sentTime?: number;
  from?: string | null;
};

type FirebaseUserContext = {
  userId: string | null;
  role?: ActiveWorkspaceRole | null;
  audience?: WorkspaceAudience | null;
};

export type FirebaseOperationalContext = {
  currentWorkspace?: string | null;
  currentRole?: ActiveWorkspaceRole | null;
  currentAudience?: WorkspaceAudience | null;
  currentScreen?: string | null;
  deviceType?: string | null;
  osVersion?: string | null;
  appState?: string | null;
};

const SENSITIVE_KEY_PATTERN = /(token|password|secret|authorization|cookie|refresh|access|payload|qr|email|phone|name|visitor|address|otp|pin|credential|photo|image)/i;
const SENSITIVE_VALUE_PATTERN = /(bearer\s+[a-z0-9._-]+|eyj[a-z0-9._-]+|password=|token=|authorization=)/i;
const MAX_PARAM_LENGTH = 80;
const moduleCache: FirebaseModuleCache = {};

let initialized = false;
let operationalContext: FirebaseOperationalContext = {};

export async function initializeFirebaseRuntime() {
  if (initialized || !apiConfig.firebase.enabled || !hasNativeFirebase()) {
    return false;
  }
  initialized = true;

  await Promise.all([
    setCrashlyticsEnabled(apiConfig.firebase.crashlyticsEnabled),
    setAnalyticsEnabled(apiConfig.firebase.analyticsEnabled),
  ]);

  await setFirebaseRuntimeAttributes({
    environment: apiConfig.environment,
    release_channel: apiConfig.releaseChannel,
    distribution_channel: apiConfig.distributionChannel,
    app_version: apiConfig.appVersion,
    runtime_version: apiConfig.runtimeVersion,
    build_id: apiConfig.buildId,
  });

  await trackFirebaseEvent('app_runtime_initialized', {
    platform: Platform.OS,
    environment: apiConfig.environment,
    release_channel: apiConfig.releaseChannel,
  });

  return true;
}

export async function setFirebaseOperationalContext(context: FirebaseOperationalContext) {
  operationalContext = {
    ...operationalContext,
    ...context,
  };

  await setFirebaseRuntimeAttributes({
    workspace: operationalContext.currentWorkspace,
    active_role: operationalContext.currentRole,
    audience: operationalContext.currentAudience,
    current_screen: operationalContext.currentScreen,
    device_type: operationalContext.deviceType,
    os_version: operationalContext.osVersion,
    app_state: operationalContext.appState,
  });
}

export async function getFirebaseCrashReportingState() {
  const available = apiConfig.firebase.crashlyticsEnabled && hasNativeFirebase() && Boolean(loadCrashlyticsModule());
  let didCrashPreviously = false;
  let hasUnsentReports = false;

  if (available) {
    const crashlyticsModule = loadCrashlyticsModule();
    let crashlytics: unknown = null;
    try {
      crashlytics = crashlyticsModule?.getCrashlytics?.();
    } catch {
      crashlytics = null;
    }
    try {
      didCrashPreviously = Boolean(await crashlyticsModule.didCrashOnPreviousExecution?.(crashlytics));
    } catch {
      didCrashPreviously = false;
    }
    try {
      hasUnsentReports = Boolean(await crashlyticsModule.checkForUnsentReports?.(crashlytics));
    } catch {
      hasUnsentReports = false;
    }
  }

  return {
    initialized,
    available,
    enabled: apiConfig.firebase.crashlyticsEnabled,
    nativeAvailable: hasNativeFirebase(),
    didCrashPreviously,
    hasUnsentReports,
  };
}

export async function getFirebaseMessagingToken() {
  if (Platform.OS !== 'android' || !apiConfig.firebase.messagingEnabled) {
    return null;
  }

  const messagingModule = loadMessagingModule();
  if (!messagingModule) {
    return null;
  }

  try {
    const messaging = messagingModule.getMessaging();
    await messagingModule.registerDeviceForRemoteMessages?.(messaging);
    const token = await messagingModule.getToken(messaging);
    return typeof token === 'string' && token.trim() ? token.trim() : null;
  } catch (error) {
    await recordFirebaseError(error, 'FCM_TOKEN_REGISTRATION_FAILED', {
      platform: Platform.OS,
    });
    return null;
  }
}

export function onFirebaseTokenRefresh(listener: (token: string) => void) {
  if (!apiConfig.firebase.messagingEnabled) {
    return undefined;
  }

  const messagingModule = loadMessagingModule();
  if (!messagingModule) {
    return undefined;
  }

  try {
    return messagingModule.onTokenRefresh(messagingModule.getMessaging(), listener);
  } catch {
    return undefined;
  }
}

export function onFirebaseForegroundMessage(listener: (message: FirebaseMessagePayload) => void | Promise<void>) {
  if (!apiConfig.firebase.messagingEnabled) {
    return undefined;
  }

  const messagingModule = loadMessagingModule();
  if (!messagingModule) {
    return undefined;
  }

  try {
    return messagingModule.onMessage(messagingModule.getMessaging(), listener);
  } catch {
    return undefined;
  }
}

export function onFirebaseNotificationOpened(listener: (message: FirebaseMessagePayload) => void | Promise<void>) {
  if (!apiConfig.firebase.messagingEnabled) {
    return undefined;
  }

  const messagingModule = loadMessagingModule();
  if (!messagingModule) {
    return undefined;
  }

  try {
    return messagingModule.onNotificationOpenedApp(messagingModule.getMessaging(), listener);
  } catch {
    return undefined;
  }
}

export async function getInitialFirebaseNotification() {
  if (!apiConfig.firebase.messagingEnabled) {
    return null;
  }

  const messagingModule = loadMessagingModule();
  if (!messagingModule) {
    return null;
  }

  try {
    return await messagingModule.getInitialNotification(messagingModule.getMessaging());
  } catch {
    return null;
  }
}

export function registerFirebaseBackgroundMessageHandler(handler: (message: FirebaseMessagePayload) => Promise<void>) {
  if (!apiConfig.firebase.messagingEnabled) {
    return false;
  }

  const messagingModule = loadMessagingModule();
  if (!messagingModule) {
    return false;
  }

  try {
    messagingModule.setBackgroundMessageHandler(messagingModule.getMessaging(), handler);
    return true;
  } catch {
    return false;
  }
}

export async function setFirebaseUserContext(context: FirebaseUserContext) {
  if (!apiConfig.firebase.enabled || !hasNativeFirebase()) {
    return;
  }

  const safeUserId = sanitizeUserId(context.userId);
  await Promise.all([
    setCrashlyticsUserContext(safeUserId, context),
    setAnalyticsUserContext(safeUserId, context),
  ]);
}

export async function clearFirebaseUserContext() {
  await Promise.all([
    setFirebaseUserContext({ userId: null }),
    trackFirebaseEvent('session_cleared', {
      environment: apiConfig.environment,
    }),
  ]);
}

export async function trackFirebaseEvent(name: string, params?: Record<string, unknown>) {
  if (!apiConfig.firebase.analyticsEnabled || !hasNativeFirebase()) {
    return;
  }

  const analyticsModule = loadAnalyticsModule();
  if (!analyticsModule) {
    return;
  }

  try {
    const eventName = sanitizeAnalyticsEventName(name);
    const eventParams = sanitizeAnalyticsParams({
      ...params,
      app_environment: apiConfig.environment,
      release_channel: apiConfig.releaseChannel,
    });
    await analyticsModule.logEvent(analyticsModule.getAnalytics(), eventName, eventParams);
  } catch {
    // Firebase analytics is operational telemetry only; it must never interrupt workflows.
  }
}

export async function logFirebaseBreadcrumb(message: string, params?: Record<string, unknown>) {
  if (!apiConfig.firebase.crashlyticsEnabled || !hasNativeFirebase()) {
    return;
  }

  const crashlyticsModule = loadCrashlyticsModule();
  if (!crashlyticsModule) {
    return;
  }

  try {
    const suffix = params ? ` ${JSON.stringify(sanitizeAnalyticsParams(params))}` : '';
    crashlyticsModule.log(crashlyticsModule.getCrashlytics(), `${message.slice(0, 180)}${suffix}`.slice(0, 300));
  } catch {
    // Crash breadcrumbs must be best-effort.
  }
}

export async function recordFirebaseError(error: unknown, code: string, params?: Record<string, unknown>) {
  if (!apiConfig.firebase.crashlyticsEnabled || !hasNativeFirebase()) {
    return;
  }

  const crashlyticsModule = loadCrashlyticsModule();
  if (!crashlyticsModule) {
    return;
  }

  try {
    const crashlytics = crashlyticsModule.getCrashlytics();
    const sanitizedParams = sanitizeAnalyticsParams(params);
    await setFirebaseRuntimeAttributes({
      last_error_code: code,
      last_error_scope: sanitizedParams.scope,
      last_error_level: sanitizedParams.level,
      last_error_screen: operationalContext.currentScreen,
      active_role: operationalContext.currentRole,
      workspace: operationalContext.currentWorkspace,
    });
    crashlyticsModule.log(
      crashlytics,
      `error:${sanitizeAnalyticsEventName(code)} ${JSON.stringify(sanitizedParams)}`.slice(0, 300),
    );
    crashlyticsModule.recordError(crashlytics, normalizeError(error, code), code);
  } catch {
    // Non-fatal reporting is best-effort.
  }
}

function hasNativeFirebase() {
  return Boolean(
    (NativeModules as Record<string, unknown>).RNFBAppModule
    || (NativeModules as Record<string, unknown>).RNFBMessagingModule
    || Constants.appOwnership !== 'expo',
  );
}

async function setCrashlyticsEnabled(enabled: boolean) {
  const crashlyticsModule = loadCrashlyticsModule();
  if (!crashlyticsModule) {
    return;
  }

  try {
    await crashlyticsModule.setCrashlyticsCollectionEnabled(crashlyticsModule.getCrashlytics(), enabled);
  } catch {
    // Native module availability differs between Expo Go and dev-client builds.
  }
}

async function setAnalyticsEnabled(enabled: boolean) {
  const analyticsModule = loadAnalyticsModule();
  if (!analyticsModule) {
    return;
  }

  try {
    await analyticsModule.setAnalyticsCollectionEnabled(analyticsModule.getAnalytics(), enabled);
  } catch {
    // Native module availability differs between Expo Go and dev-client builds.
  }
}

async function setFirebaseRuntimeAttributes(attributes: Record<string, unknown>) {
  const crashlyticsModule = loadCrashlyticsModule();
  if (!crashlyticsModule) {
    return;
  }

  try {
    await crashlyticsModule.setAttributes(
      crashlyticsModule.getCrashlytics(),
      Object.fromEntries(
        Object.entries(sanitizeAnalyticsParams(attributes)).map(([key, value]) => [key, String(value)]),
      ),
    );
  } catch {
    // Attribute writes are best-effort.
  }
}

async function setCrashlyticsUserContext(userId: string, context: FirebaseUserContext) {
  const crashlyticsModule = loadCrashlyticsModule();
  if (!crashlyticsModule) {
    return;
  }

  try {
    const crashlytics = crashlyticsModule.getCrashlytics();
    await crashlyticsModule.setUserId(crashlytics, userId);
    await crashlyticsModule.setAttributes(crashlytics, {
      active_role: context.role ?? 'signed_out',
      audience: context.audience ?? 'signed_out',
      environment: apiConfig.environment,
    });
  } catch {
    // User/session correlation is best-effort and privacy-safe.
  }
}

async function setAnalyticsUserContext(userId: string, context: FirebaseUserContext) {
  const analyticsModule = loadAnalyticsModule();
  if (!analyticsModule) {
    return;
  }

  try {
    const analytics = analyticsModule.getAnalytics();
    await analyticsModule.setUserId(analytics, userId || null);
    await analyticsModule.setUserProperties(analytics, {
      active_role: context.role ?? null,
      audience: context.audience ?? null,
      environment: apiConfig.environment,
      release_channel: apiConfig.releaseChannel,
    });
  } catch {
    // Analytics user properties are best-effort.
  }
}

function loadMessagingModule() {
  if (moduleCache.messaging !== undefined) {
    return moduleCache.messaging;
  }
  moduleCache.messaging = loadFirebaseModule('@react-native-firebase/messaging');
  return moduleCache.messaging;
}

function loadCrashlyticsModule() {
  if (moduleCache.crashlytics !== undefined) {
    return moduleCache.crashlytics;
  }
  moduleCache.crashlytics = loadFirebaseModule('@react-native-firebase/crashlytics');
  return moduleCache.crashlytics;
}

function loadAnalyticsModule() {
  if (moduleCache.analytics !== undefined) {
    return moduleCache.analytics;
  }
  moduleCache.analytics = loadFirebaseModule('@react-native-firebase/analytics');
  return moduleCache.analytics;
}

function loadFirebaseModule(moduleName: string) {
  if (!apiConfig.firebase.enabled || !hasNativeFirebase()) {
    return null;
  }

  try {
    if (moduleName === '@react-native-firebase/messaging') {
      return require('@react-native-firebase/messaging');
    }
    if (moduleName === '@react-native-firebase/crashlytics') {
      return require('@react-native-firebase/crashlytics');
    }
    if (moduleName === '@react-native-firebase/analytics') {
      return require('@react-native-firebase/analytics');
    }
    return null;
  } catch {
    return null;
  }
}

function sanitizeAnalyticsEventName(name: string) {
  const normalized = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
  return (normalized || 'operational_event').slice(0, 40);
}

function sanitizeAnalyticsParams(params?: Record<string, unknown>) {
  if (!params) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(params)
      .filter(([key, value]) => value !== undefined && !SENSITIVE_KEY_PATTERN.test(key))
      .map(([key, value]) => [
        key.slice(0, 40),
        sanitizeAnalyticsValue(value),
      ])
      .filter(([, value]) => value !== undefined),
  ) as Record<string, string | number | boolean | null>;
}

function sanitizeAnalyticsValue(value: unknown) {
  if (value === null || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'string') {
    const safeValue = SENSITIVE_VALUE_PATTERN.test(value) ? '[redacted]' : value;
    return safeValue.slice(0, MAX_PARAM_LENGTH);
  }

  return JSON.stringify(value).slice(0, MAX_PARAM_LENGTH);
}

function sanitizeUserId(userId: string | null) {
  return userId ? `af-user-${fingerprintValue(userId)}`.slice(0, 120) : '';
}

function normalizeError(error: unknown, code: string) {
  if (error instanceof Error) {
    error.message = sanitizeErrorMessage(error.message, code);
    return error;
  }
  return new Error(`${code}: ${typeof error === 'string' ? sanitizeErrorMessage(error, code) : 'Unknown Firebase operational error'}`);
}

function sanitizeErrorMessage(message: string, fallback: string) {
  const normalized = String(message || fallback);
  return SENSITIVE_VALUE_PATTERN.test(normalized) ? `${fallback}: sensitive error details redacted` : normalized.slice(0, 500);
}

function fingerprintValue(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}
