# AccessFlow Mobile

Android-first Expo mobile foundation for AccessFlow. This app is intentionally thin: Spring Boot remains the source of truth for auth, role checks, visitor workflows, QR validation, notifications, and operational rules.

## Stack

- Expo + React Native + TypeScript
- React Navigation
- TanStack Query
- Axios with JWT injection and refresh handling
- Expo Secure Store + AsyncStorage

## Architecture

```text
frontend-app/
  app/            App bootstrap and error boundary
  auth/           Auth provider and role resolution
  api/            Runtime config, axios client, error normalization
  components/     Reusable buttons, cards, form fields, layout
  hooks/          Query hooks for role workspaces
  navigation/     Auth stack, role routing, protected tabs
  screens/        Auth, recovery, security, employee, admin screens
  services/       Thin backend endpoint adapters only
  storage/        Secure session persistence and runtime snapshots
  theme/          Shared tokens and navigation theme
  types/          Auth, API, runtime, and domain models
```

## Environment

Create `.env` from `.env.example`.

```bash
EXPO_PUBLIC_ACCESSFLOW_API_BASE_URL=https://accessflow-api-goww.onrender.com/api/v1
```

No endpoint is hardcoded in the app logic. The backend URL must come from the Expo public environment.

## Enterprise Release Channels

AccessFlow Mobile is linked to Expo project `f6f82d40-344d-4ae9-93bf-a58c869db1ac` and uses isolated Expo/EAS channels for `development`, `preview`, `staging`, `internal`, and `production`.

```bash
npm run build:preview:android
npm run build:production:android
npm run update:preview
npm run update:staging
npm run update:production
```

Preview and internal Android builds produce APK artifacts for direct enterprise testing. Production Android builds produce Play Store-ready AAB artifacts. OTA updates are runtime-version gated with `runtimeVersion.policy = appVersion`; bump `expo.version` for native/runtime changes so incompatible updates cannot land on stale binaries. The backend `/api/versions` handshake remains the compatibility source of truth for minimum app/runtime versions, forced update windows, rollback flags, and staged rollout metadata.

See [docs/android-deployment.md](docs/android-deployment.md) for the full EAS Android deployment workflow.

## Operational Readiness

Phase 6 infrastructure now includes privacy-safe local diagnostics, operational metrics buffering, authenticated telemetry flushes, OTA update checks, forced-update locks, emergency-launch recovery capture, stale-cache reconciliation, remote session-policy polling, and bounded offline scan queueing. Offline queued scans are retry preparation only; backend validation is still required before granting access.

The app is prepared for future managed-device controls through device posture state: shared guard tablets, kiosk-ready devices, organization-owned devices, remote logout, suspicious-device locks, certificate pinning, and attestation hooks.

## Store Review Notes

Android permissions are intentionally limited to camera/scanning, notifications, biometric unlock, secure storage, and image selection for credential/photo workflows. Audio recording is explicitly blocked in Expo config and camera recording is disabled.

## Run

```bash
npm install
npm run start
```

Useful checks:

```bash
npm run typecheck
npm run doctor
```

## Mobile scope

Current operational shells:

- Security: `Scan`, `Visitors`, `Workforce`, `Alerts`, `Profile`
- Employee: `Badge`, `Requests`, `Presence`, `Notifications`, `Settings`

The foundation is also ready for:

- QR camera workflows
- push notifications
- offline-tolerant sync improvements
- employee badge rendering
- device-specific guard workflows
