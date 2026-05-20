# AccessFlow Firebase Infrastructure

Firebase is integrated as mobile operational infrastructure only. Spring Boot remains the authority for authentication, authorization, business workflows, notification targeting, audit history, and device ownership.

## Responsibilities

- Firebase Cloud Messaging: Android push transport and background delivery.
- Crashlytics: native/JS crash visibility, non-fatal runtime errors, scanner failures, notification failures, offline sync failures, auth recovery failures, and lifecycle recovery failures.
- Firebase Analytics: lightweight operational events only. No PII, QR payloads, names, email addresses, phone numbers, auth tokens, or business payloads are logged.
- Expo Notifications: notification channels, categories/actions, foreground response handling, and Expo push fallback.
- Runtime observability facade: provider-neutral instrumentation for global JS exceptions, unhandled async failures, navigation issues, API failure storms, sync reconnect loops, slow runtime operations, and Crashlytics context attributes. This keeps a future Sentry/tracing provider additive instead of invasive.

## Mobile Configuration

Set these values in the Expo/EAS environment:

```bash
EXPO_PUBLIC_ACCESSFLOW_FIREBASE_ENABLED=true
EXPO_PUBLIC_ACCESSFLOW_FIREBASE_MESSAGING_ENABLED=true
EXPO_PUBLIC_ACCESSFLOW_FIREBASE_CRASHLYTICS_ENABLED=true
EXPO_PUBLIC_ACCESSFLOW_FIREBASE_ANALYTICS_ENABLED=true
ACCESSFLOW_FIREBASE_ANDROID_GOOGLE_SERVICES_FILE=./google-services.json
```

`google-services.json` must come from the Firebase Android app whose package is `com.accessflow.mobile`. Keep it out of source control unless the release/security policy explicitly permits committing Firebase client config.

React Native Firebase requires a dev-client/EAS/native build. Expo Go can still start the JavaScript bundle because the Firebase runtime facade checks native module availability before requiring native modules.

## Backend Configuration

Spring Boot stores FCM and Expo tokens against the authenticated AccessFlow user/device. Direct FCM delivery is used when configured; Expo push remains a fallback.

```bash
PUSH_NOTIFICATIONS_ENABLED=true
FIREBASE_PUSH_ENABLED=true
FIREBASE_PROJECT_ID=accessflow-prod
FIREBASE_SERVICE_ACCOUNT_BASE64=base64-encoded-service-account-json
```

Alternative credential inputs are `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT_PATH`. Use exactly one credential source per environment.

## Push Pipeline

1. User signs in through Spring Boot auth.
2. Mobile runtime requests Android notification permission.
3. Mobile registers Expo token and FCM token with `/api/v1/notifications/devices`.
4. Spring Boot associates the tokens with the authenticated user, active role, and device id.
5. Workflow events create backend notifications first.
6. Spring Boot sends direct FCM when available, falling back to Expo push for devices without FCM or when Firebase is not configured.
7. Mobile handles foreground, background, opened, and cold-start notification paths without duplicating route handling.

## Analytics Events

Tracked events are intentionally sparse:

- `login_success`, `login_failure`
- `qr_scan_success`, `qr_scan_failure`
- `visitor_approval_action`, `workforce_approval_action`
- `offline_mode_activation`, `offline_operation_queued`, `offline_operation_synced`, `offline_sync_failure`
- `notification_received`, `notification_opened`, `notification_failure`
- `session_recovery`, `session_invalidated`, `runtime_failure`
- `operational_warning`, `app_runtime_initialized`, `app_state_changed`

## Crashlytics Context

Crash reports attach only low-risk operational context:

- app version, native build/runtime version, build id, environment, release channel, distribution channel
- active role, workspace code/name fallback, current navigation screen, Android version, device type, app state
- last error code/scope/level and bounded breadcrumbs for screen changes, API failure storms, sync loops, and recovery events

Crash reports do not include passwords, auth tokens, QR payloads, visitor details, names, emails, phone numbers, photos, credential payloads, or raw business payloads. User ids are converted to a local non-PII fingerprint before being sent to Crashlytics.

## Diagnostics Screen

Authenticated profile screens include an expandable app diagnostics panel with:

- app version, runtime version, build id, release channel, OTA status
- Crashlytics configured/available state, native Firebase availability, previous-crash and unsent-report indicators
- sync health, API reachability, network/offline mode, offline queue size, last offline sync, push permission, and runtime health

The panel is operational metadata only and intentionally excludes API base URLs, auth state internals, visitor records, QR data, push tokens, and account PII.

## Production Validation

Before release, verify on Android phones and tablets:

- Firebase initializes in an EAS/dev-client build.
- FCM token appears in Spring Boot `mobile_device_registrations`.
- Push delivery works in foreground, background, and cold-start states.
- Crashlytics receives a test non-fatal error and a controlled test crash.
- React render crashes are caught by the global error boundary and show recovery actions instead of a white screen.
- Unhandled JS exceptions and async failures appear as sanitized non-fatal Crashlytics records.
- Repeated API failures, backend timeouts, SSL failures, sync reconnect loops, and offline queue reconciliation failures create bounded diagnostic events instead of log spam.
- Offline scan queue failures and reconnect recovery create local diagnostics and sync metrics without exposing QR payloads.
- Navigation failures and scanner interruptions are visible in the operational diagnostics stream.
- Analytics DebugView shows only operational events.
- Auth, role routing, QR scanning, and offline sync still use Spring Boot APIs.
