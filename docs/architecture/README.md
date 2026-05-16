# AccessFlow Architecture Package

This package documents the current AccessFlow implementation as it exists in this repository on `main`. It is based on the real code under `frontend/`, `backend/`, and `render.yaml`.

## Scope

- Static multi-entry frontend built with HTML, CSS, and ES modules
- Spring Boot 3.5 backend with MongoDB
- JWT access tokens plus opaque refresh tokens
- Organization-scoped visitor and workforce workflows
- Visitor QR passes and employee static QR attendance
- Render deployment, frontend asset versioning, and runtime recovery

## Read This First

1. [System Overview](./system-overview.md)
2. [Frontend Architecture](./frontend-architecture.md)
3. [Backend Architecture](./backend-architecture.md)
4. [Auth And Runtime Flows](./flows-auth-runtime.md)
5. [Visitor, Workforce, And Security Flows](./flows-visitor-workforce-security.md)
6. [Database And RBAC](./database-and-rbac.md)
7. [API Reference](./api-reference.md)
8. [Structure Guide](./structure.md)
9. [Deployment And Versioning](./deployment-versioning.md)

## Current System Highlights

- The login experience lives at `/` and uses audience-aware login for `visitor`, `employee`, `security`, and `admin`.
- The admin portal is a path-routed workspace under `/admin/*`.
- The employee, security, and visitor portals are separate HTML entry points that use hash-based in-page routing.
- Visitor lifecycle rules, QR issuance, access windows, recurring visitor logic, and checkpoint verification are centralized in `backend/src/main/java/com/visitor/management/service/VisitorService.java`.
- Workforce onboarding and static employee QR activation are split between `WorkforceOnboardingService` and `EmployeeAttendanceService`.
- Frontend runtime recovery is implemented by `frontend/assets/js/boot.js`, `frontend/js/shared/appRuntime.js`, and `frontend/js/shared/appErrorBoundary.js`.
- Render deploys the frontend as a static site and the backend as a Docker web service.

## Source Of Truth

The most important implementation entry points behind this documentation are:

- `frontend/index.html`
- `frontend/js/auth.js`
- `frontend/js/admin/dashboard.js`
- `frontend/js/employee/dashboard.js`
- `frontend/js/security/dashboard.js`
- `frontend/js/visitor/dashboard.js`
- `frontend/js/shared/appRuntime.js`
- `frontend/js/shared/httpClient.js`
- `backend/src/main/java/com/visitor/management/security/SecurityConfig.java`
- `backend/src/main/java/com/visitor/management/service/AuthService.java`
- `backend/src/main/java/com/visitor/management/service/VisitorService.java`
- `backend/src/main/java/com/visitor/management/service/EmployeeAttendanceService.java`
- `backend/src/main/java/com/visitor/management/service/WorkforceOnboardingService.java`
- `backend/src/main/java/com/visitor/management/service/AdminUserService.java`
- `backend/src/main/java/com/visitor/management/service/OrganizationService.java`
- `render.yaml`

## Notes

- This package describes the current repository layout, including the generated `frontend/dist/` and compiled `backend/target/` outputs where they affect runtime and deployment, but the structure guide focuses primarily on source-owned files.
- Login returns a raw `AuthResponse` object. Most other endpoints return `ApiResponse<T>`.
- Role names in backend code are `SUPER_ADMIN`, `ADMIN`, `EMPLOYEE`, `SECURITY_GUARD`, and `VISITOR`.
