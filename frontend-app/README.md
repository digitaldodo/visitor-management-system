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
