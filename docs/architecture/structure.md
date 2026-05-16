# Structure Guide

## Structure Notes

- The current repository contains generated output in `frontend/dist/` and compiled output in `backend/target/`.
- The trees below focus on source-owned structure first, then call out generated runtime artifacts separately.

## Backend Source Tree

```text
backend/
+-- Dockerfile
+-- pom.xml
\-- src/
    +-- main/
    |   +-- java/com/visitor/management/
    |   |   +-- VisitorManagementApplication.java
    |   |   +-- config/
    |   |   +-- controller/
    |   |   +-- dto/
    |   |   +-- entity/
    |   |   +-- exception/
    |   |   +-- repository/
    |   |   +-- security/
    |   |   +-- service/
    |   |   \-- validation/
    |   \-- resources/
    |       +-- application.yml
    |       +-- application-local.yml
    |       +-- application-prod.yml
    |       \-- logback-spring.xml
    \-- test/
        +-- java/com/visitor/management/
        |   +-- VisitorManagementApplicationTests.java
        |   \-- service/DepartmentServiceTest.java
        \-- resources/application-test.yml
```

## Backend Folder Responsibilities

| Folder | Responsibility | Depends on |
| --- | --- | --- |
| `config/` | properties, indexes, CORS, Cloudinary wiring, startup validation, scheduling/caching support | Spring Boot config, entities, repositories |
| `controller/` | HTTP endpoints grouped by audience and domain | services, DTOs |
| `dto/` | request and response contracts | entities for enum references |
| `entity/` | MongoDB documents and enums | Spring Data Mongo |
| `exception/` | typed application exceptions and global handler | Spring MVC |
| `repository/` | Spring Data Mongo repository interfaces | entities |
| `security/` | JWT, filters, route security, auth entrypoints | `JwtService`, repositories, properties |
| `service/` | business logic, QR handling, onboarding, analytics, notifications | repositories, config, external integrations |
| `validation/` | shared username validation | DTOs and services |

## Backend Generated Runtime Artifacts Present In Repo

Current generated backend folders in the working tree:

- `backend/target/classes/`
- `backend/target/test-classes/`
- `backend/target/surefire-reports/`
- packaged jar outputs under `backend/target/`

These are build outputs, not source modules.

## Frontend Source Tree

```text
frontend/
+-- index.html
+-- assets/
|   +-- branding/
|   \-- js/
|       +-- env.js
|       \-- boot.js
+-- css/
|   +-- admin/
|   +-- employee/
|   +-- pass/
|   +-- security/
|   +-- shared/
|   \-- visitor/
+-- js/
|   +-- admin/dashboard.js
|   +-- employee/dashboard.js
|   +-- pass/verify.js
|   +-- security/dashboard.js
|   +-- shared/
|   |   +-- accessService.js
|   |   +-- appErrorBoundary.js
|   |   +-- appRuntime.js
|   |   +-- authApi.js
|   |   +-- badgeStudio.js
|   |   +-- config.js
|   |   +-- departmentApi.js
|   |   +-- dom.js
|   |   +-- employeeBadgeStudio.js
|   |   +-- employeeDirectoryApi.js
|   |   +-- formatters.js
|   |   +-- healthApi.js
|   |   +-- homepageApi.js
|   |   +-- hostPicker.js
|   |   +-- httpClient.js
|   |   +-- notificationApi.js
|   |   +-- organizationApi.js
|   |   +-- phoneInput.js
|   |   +-- portalShell.js
|   |   +-- roleGuard.js
|   |   +-- session.js
|   |   +-- toast.js
|   |   +-- validation.js
|   |   \-- visitorModule.js
|   +-- visitor/dashboard.js
|   +-- auth.js
|   \-- passwordReset.js
+-- pages/
|   +-- admin/index.html
|   +-- employee/index.html
|   +-- forgot-password/index.html
|   +-- pass/index.html
|   +-- reset-password/index.html
|   +-- security/index.html
|   +-- verify-otp/index.html
|   \-- visitor/index.html
+-- scripts/build-static.mjs
\-- shared/README.md
```

## Frontend Folder Responsibilities

| Folder | Responsibility | Depends on |
| --- | --- | --- |
| `assets/js/` | runtime bootstrapping and deploy-time environment constants | browser globals |
| `assets/branding/` | logos and favicon used by all portals | static asset loading |
| `css/shared/` | shared base, auth, and portal shell styles | HTML entry shells |
| `css/{role}/` | role-specific visual systems | role HTML and JS |
| `js/shared/` | session, runtime, API wrappers, shell utilities, shared visitor and badge modules | browser, backend API |
| `js/admin/` | admin workspace driver | shared modules |
| `js/employee/` | employee dashboard driver | shared modules |
| `js/security/` | security operations driver | shared modules |
| `js/visitor/` | visitor self-service driver | shared modules |
| `js/pass/` | public badge verification driver | shared API wrappers |
| `pages/` | protected and public HTML entry points | shared and role JS |
| `scripts/` | static build and version stamping | Node.js |

## Frontend Generated Runtime Artifacts Present In Repo

Current generated frontend build output:

- `frontend/dist/index.html`
- `frontend/dist/pages/**`
- `frontend/dist/js/**`
- `frontend/dist/css/**`
- `frontend/dist/assets/app-manifest.json`
- rewritten asset query tokens in the generated HTML/JS/CSS

## Module Relationships

### Frontend

- `auth.js` owns public login, registration, and homepage content.
- `passwordReset.js` owns forgot-password, OTP verify, and reset-password pages.
- `dashboard.js` files own portal composition and orchestration.
- `accessService.js`, `authApi.js`, `organizationApi.js`, and peers wrap endpoint groups.
- `visitorModule.js` is shared by admin, employee, and security visitor CRUD surfaces.
- `badgeStudio.js` and `employeeBadgeStudio.js` render print/export badge assets.

### Backend

- controllers map 1:1 to audience or domain surfaces
- `VisitorService` is the visitor lifecycle hub
- `EmployeeAttendanceService` is the workforce presence hub
- `WorkforceOnboardingService` owns employee pending-approval flow
- `AdminUserService` owns internal user creation and privileged user mutation
- `OrganizationService` and `DepartmentService` own tenant metadata
