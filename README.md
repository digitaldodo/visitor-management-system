# AccessFlow

AccessFlow is a role-based visitor and workforce access management system. It combines a static HTML/CSS/JavaScript frontend with a Spring Boot API, MongoDB persistence, JWT authentication, QR-based visitor passes, employee attendance QR scanning, Cloudinary photo storage, and Render deployment.

Detailed architecture, flows, RBAC, database, API, deployment, and runtime documentation lives in [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md).

## Core Features

- Audience-aware login for visitors, employees, security guards, admins, and super admins.
- Visitor self-service visit requests, host approvals, pre-approvals, rescheduling, QR pass generation, and public pass verification.
- Security portal for queue monitoring, visitor QR scanning, visitor check-in/check-out, recurring visitor management, workforce onboarding, and employee attendance scans.
- Employee portal for visitor approvals, pre-approvals, attendance history, and reusable employee badge access.
- Admin portal for organization-scoped users, departments, workforce approvals, visitor operations, reports, analytics, and super-admin platform controls.
- Backend-enforced RBAC, organization isolation, audit logging, refresh-token rotation, and stale-session recovery.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | Static HTML, CSS, ES modules |
| Backend | Java 21, Spring Boot 3.5, Spring Security |
| Database | MongoDB / MongoDB Atlas |
| Auth | JWT access tokens plus opaque refresh tokens |
| Media | Cloudinary |
| Email | SendGrid |
| QR | ZXing |
| Deployment | Render static site and Render Docker web service |

## Architecture Summary

```text
Browser static frontend
  -> Render static site: accessflow-web
  -> Spring Boot API: accessflow-api-goww
  -> MongoDB collections for users, organizations, visitors, attendance, notifications, and audit logs
  -> Cloudinary for visitor/workforce photos
  -> SendGrid for OTP and notification email
```

The frontend is a multi-entry static app. `frontend/index.html` handles public login and registration, while role-specific pages under `frontend/pages/` load dashboard modules from `frontend/js/`. Shared runtime, session, HTTP, role guard, notification, badge, and visitor modules live in `frontend/js/shared/`.

The backend is layered by controllers, services, repositories, DTOs, entities, security filters, and configuration. Business rules for visitor lifecycle, QR validation, workforce onboarding, attendance, organization isolation, and auditing live in services.

## Project Structure

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
  assets/
  css/
  js/
  pages/
  scripts/build-static.mjs
render.yaml
PROJECT_OVERVIEW.md
README.md
```

## Environment Setup

Use `.env.example` as the shape reference and never commit real secrets.

Backend production variables:

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

## Local Development

Run the backend:

```bash
cd backend
mvn spring-boot:run
```

Build and serve the frontend:

```bash
cd frontend
API_BASE_URL=http://localhost:8080/api/v1 node ./scripts/build-static.mjs
python -m http.server 4173 --directory dist
```

For local API testing, use the `API_BASE_URL` build variable; unbuilt static files default to the production API and should not carry ad hoc localhost fallbacks.

## Deployment

`render.yaml` defines two Render services:

- `accessflow-api-goww`: Docker web service built from `backend/Dockerfile`.
- `accessflow-web`: static site built from `frontend/` and published from `frontend/dist/`.

Render frontend build:

```bash
test -n "$API_BASE_URL"
node ./scripts/build-static.mjs
```

Backend deploy uses the Spring `prod` profile, binds to `0.0.0.0:${PORT:-10000}`, validates production environment settings, and expects secure CORS values. For the default Render services:

```text
FRONTEND_PUBLIC_URL=https://accessflow-web.onrender.com
CORS_ALLOWED_ORIGINS=https://accessflow-web.onrender.com
API_BASE_URL=https://accessflow-api-goww.onrender.com/api/v1
```

## Render Versioning Notes

The frontend build writes `frontend/dist/assets/app-manifest.json`, injects `assets/js/env.js`, and stamps local JS/CSS/module imports with a deploy token. HTML and runtime manifests are served `no-store`; versioned JS and CSS are immutable. `boot.js`, `appRuntime.js`, and `appErrorBoundary.js` detect deployment mismatches, stale assets, and runtime failures, then recover by refreshing the app while preserving the main session where possible.

## RBAC Overview

| Role | Primary surface |
| --- | --- |
| `SUPER_ADMIN` | Platform-wide admin controls, organizations, monitoring, homepage settings, super-admin OTP creation |
| `ADMIN` | Organization-scoped users, departments, workforce approvals, visitor access, reports |
| `SECURITY_GUARD` | Checkpoint operations, visitor verification, workforce intake, employee attendance scanning |
| `EMPLOYEE` | Host approvals, pre-approvals, own attendance, own badge |
| `VISITOR` | Self-service visit requests, history, approved pass access |

Frontend role guards hide unavailable navigation, but backend route rules, `@PreAuthorize`, JWT validation, organization checks, host ownership checks, and lifecycle checks are the authority.

## Verification

```bash
cd backend
mvn test
mvn -DskipTests package
docker build -t accessflow-api-goww .
```

Useful health endpoints:

- `/api/v1/health`
- `/api/v1/health/live`
- `/api/v1/health/ready`
- `/actuator/health`
