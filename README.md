# AccessFlow

AccessFlow is a role-based visitor and workforce access management system for controlled facilities. It combines a static multi-entry frontend with a Spring Boot API, MongoDB persistence, JWT authentication, QR-driven check-in flows, Cloudinary-backed photo storage, Firebase-backed mobile observability/push infrastructure, and Render deployment.

Detailed architecture, lifecycle flows, RBAC, API coverage, database design, and deployment internals live in [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md).

Firebase is mobile operational infrastructure only: Android FCM, Crashlytics, and lightweight analytics. Spring Boot remains the source of truth for auth, business logic, notification targeting, and security decisions. See [frontend-app/docs/firebase-infrastructure.md](frontend-app/docs/firebase-infrastructure.md).

Offline operations are intentionally mobile-first. Web portals keep live recovery and notification resilience, while privileged offline queueing stays on mobile checkpoint surfaces. See [frontend-app/docs/offline-notification-parity.md](frontend-app/docs/offline-notification-parity.md).

## Core Features

- Audience-aware sign-in for `SUPER_ADMIN`, `ADMIN`, `SECURITY_GUARD`, `EMPLOYEE`, and `VISITOR`.
- Visitor self-service registration, email verification, visit requests, host approvals, rescheduling, and approved pass access.
- Security operations for QR verification, visitor check-in/check-out, badge printing, recurring visitor management, and workforce intake.
- Workforce onboarding with admin approval, static employee QR activation, and attendance scan or manual override workflows.
- Organization-scoped administration for users, departments, visitor operations, reports, attendance analytics, and platform-level controls.
- Runtime recovery for stale sessions, deployment mismatches, stale assets, and frontend API configuration drift.

## Tech Stack

| Layer | Implementation |
| --- | --- |
| Frontend | Static HTML, CSS, ES modules |
| Backend | Java 21, Spring Boot 3.5.14, Spring Security |
| Database | MongoDB / MongoDB Atlas |
| Auth | JWT access tokens + opaque hashed refresh tokens |
| Media | Cloudinary |
| Email | SendGrid |
| QR | ZXing |
| API docs | springdoc OpenAPI |
| Deployment | Render static site + Render Docker web service |

## Architecture Summary

```text
Browser
  -> Render static frontend
  -> runtime boot, session restore, version check
  -> Spring Boot API
  -> MongoDB collections for users, visitors, orgs, attendance, notifications, audits, tokens
  -> Cloudinary for photo uploads
  -> SendGrid for verification, OTP, and notification email
```

The frontend is a multi-entry static app:

- `/` serves login and visitor registration.
- `/admin/*`, `/employee`, and `/security` are Render rewrites to role-specific portals.
- Public pass verification runs through `/pass/*` and `/verify/*`.
- The visitor portal is served from `frontend/pages/visitor/index.html`.

The backend is layered into controllers, services, repositories, DTOs, entities, security filters, and startup/configuration components. Business rules for approvals, QR validation, onboarding, org isolation, and audit logging live in the service layer.

## Repository Structure

```text
backend/
  Dockerfile
  pom.xml
  src/main/java/com/visitor/management/
    config/
    controller/
    dto/
    entity/
    exception/
    repository/
    security/
    service/
    validation/
frontend/
  index.html
  assets/js/
  css/
  js/
  pages/
  scripts/build-static.mjs
render.yaml
.env.example
README.md
PROJECT_OVERVIEW.md
```

## Environment Setup

Use `.env.example` as the reference shape for production and local configuration.

Backend variables:

```text
MONGODB_URI
JWT_SECRET
FRONTEND_PUBLIC_URL
CORS_ALLOWED_ORIGINS
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
SENDGRID_API_KEY
SENDGRID_FROM_EMAIL
SUPER_ADMIN_USERNAME
SUPER_ADMIN_EMAIL
SUPER_ADMIN_PASSWORD
```

Frontend build variable:

```text
API_BASE_URL
```

## Local Setup

Run the backend:

```bash
cd backend
mvn spring-boot:run
```

Build and serve the frontend:

```bash
cd frontend
$env:API_BASE_URL="http://localhost:8080/api/v1"
node ./scripts/build-static.mjs
python -m http.server 4173 --directory dist
```

Notes:

- `frontend/scripts/build-static.mjs` refuses to build without `API_BASE_URL`.
- Render builds are guarded against accidental localhost API targets.
- The frontend runtime can recover from malformed runtime API config by falling back to the production API host.

## Deployment

`render.yaml` defines two Render services:

- `accessflow-api-goww`: Docker web service built from `backend/Dockerfile`
- `accessflow-web`: static site built from `frontend/` and published from `frontend/dist/`

Frontend build command:

```bash
test -n "$API_BASE_URL"
node ./scripts/build-static.mjs
```

Backend deployment expectations:

- Spring profile: `prod`
- Health check: `/api/v1/health/live`
- Bind host/port: `0.0.0.0:${PORT:-10000}`
- Production guardrails validate Mongo URI, JWT secret, frontend origin, and CORS origin configuration

Default Render values in this repo:

```text
FRONTEND_PUBLIC_URL=https://accessflow-web.onrender.com
CORS_ALLOWED_ORIGINS=https://accessflow-web.onrender.com
API_BASE_URL=https://accessflow-api-goww.onrender.com/api/v1
```

## Render Notes

- HTML entry points and `assets/app-manifest.json` are served with `Cache-Control: no-store`.
- `assets/js/boot.js`, `/css/*`, and `/js/*` are immutable because the build stamps them with a deployment token.
- `boot.js`, `appRuntime.js`, and `appErrorBoundary.js` detect stale runtime/module states and recover by refreshing the active page.
- Session preservation is attempted during deployment refreshes; invalid auth state still clears the stored session.

## RBAC Snapshot

| Role | Primary area |
| --- | --- |
| `SUPER_ADMIN` | platform analytics, organizations, monitoring, homepage settings, super-admin creation |
| `ADMIN` | org-scoped users, departments, workforce approvals, visitors, reports, attendance analytics |
| `SECURITY_GUARD` | checkpoint operations, QR verification, workforce intake, employee attendance |
| `EMPLOYEE` | visitor approvals, pre-approvals, own profile, own attendance, own badge |
| `VISITOR` | visit requests, visit history, reschedule requests, approved pass access |

Frontend navigation hides unavailable surfaces, but backend route rules, `@PreAuthorize`, JWT checks, organization checks, and lifecycle checks are authoritative.

## Verification

```bash
cd backend
mvn test
mvn -DskipTests package
docker build -t accessflow-api-goww .
```

Useful endpoints:

- `/api/v1/health`
- `/api/v1/health/live`
- `/api/v1/health/ready`
- `/api/versions`
- `/swagger-ui.html`

## Further Reading

Use [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) for:

- full system architecture and Mermaid diagrams
- detailed auth, visitor, workforce, security, admin, and runtime flows
- frontend and backend architecture breakdowns
- database design and indexes
- RBAC matrix and endpoint catalog
- responsive strategy, versioning, and deployment lifecycle details
