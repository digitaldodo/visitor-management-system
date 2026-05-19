# AccessFlow Android Deployment

This app is linked to Expo project `f6f82d40-344d-4ae9-93bf-a58c869db1ac` through `extra.eas.projectId` in `app.json` and `app.config.js`. EAS profiles also pass the same value through `EXPO_PUBLIC_ACCESSFLOW_EXPO_PROJECT_ID`.

## One-time Setup

```bash
cd frontend-app
npm install
npm run eas:whoami
```

If `npm run eas:whoami` reports that no account is authenticated, run one of these before building:

```bash
npx eas-cli@latest login
```

or set `EXPO_TOKEN` for CI or a non-interactive terminal.

## Internal Enterprise APK

Use the `preview` profile for guard tablets and organization testing:

```bash
npm run build:preview:android
```

This runs:

```bash
npx eas-cli@latest build --platform android --profile preview
```

The profile uses internal distribution, APK output, production API config, OTA channel `preview`, and `autoIncrement: versionCode` so testers can install newer APKs over older APKs.

After the build finishes, share the EAS build URL or QR code from the Expo dashboard with testers. Android testers can open the link on the device and install the APK directly after allowing installs from the browser or file manager used by the organization.

## Local APK Smoke Build

For a local packaging smoke test on a machine with Android build tooling:

```bash
npm run build:preview:android:local
```

Cloud EAS builds remain the source of truth for signed internal artifacts.

## Production Play Store AAB

Use the `production` profile for Google Play:

```bash
npm run build:production:android
```

This runs:

```bash
npx eas-cli@latest build --platform android --profile production
```

The production profile emits an Android App Bundle, uses channel `production`, and keeps OTA updates enabled with the production API base URL.

## OTA Updates

Publish OTA updates only when JavaScript and assets are compatible with the native runtime already installed on devices:

```bash
npm run update:preview
npm run update:production
```

Runtime compatibility is guarded by `runtimeVersion.policy = appVersion`. When native dependencies, permissions, Expo SDK, plugins, or any native config changes, bump `expo.version` and build a new APK/AAB instead of relying on OTA.

## Versioning Rules

- `expo.version` is the semantic app/runtime version.
- `android.versionCode` starts at `15` and is auto-incremented by EAS build profiles.
- `EXPO_PUBLIC_ACCESSFLOW_BUILD_ID` defaults to `version+versionCode`.
- Do not publish OTA updates across runtime versions.

## Android Permission Policy

Allowed Android permissions are limited to camera scanning, notification prompts, biometric unlock, and image selection:

- `android.permission.CAMERA`
- `android.permission.POST_NOTIFICATIONS`
- `android.permission.USE_BIOMETRIC`
- `android.permission.USE_FINGERPRINT`
- `android.permission.READ_MEDIA_IMAGES`
- `android.permission.READ_EXTERNAL_STORAGE` for older Android media pickers

Audio recording, video media reads, overlay windows, legacy external storage writes, and system settings writes are blocked in Expo config.

## Validation Commands

Run these before requesting or sharing a build:

```bash
npm run typecheck
npm run doctor
npx expo config --json
npx eas-cli@latest build --platform android --profile preview --non-interactive
```

The final command requires Expo authentication and creates the preview APK build.
