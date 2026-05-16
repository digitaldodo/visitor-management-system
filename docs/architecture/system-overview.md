# System Overview

## Architecture Summary

AccessFlow is a role-based visitor and workforce access system with a static frontend and a Spring Boot API. The frontend is split into a public landing/auth shell, role-specific portals, and a public badge verification page. The backend owns all business rules for organization scoping, approvals, QR issuance, workforce activation, audit logging, and runtime security.

## System Architecture

```mermaid
flowchart LR
    subgraph FE["Frontend on Render Static Site"]
        Landing["/ login + register<br/>frontend/index.html"]
        Admin["/admin/*<br/>admin workspace"]
        Employee["/employee<br/>employee portal"]
        Security["/security<br/>security portal"]
        Visitor["/pages/visitor/index.html<br/>visitor portal"]
        Pass["/pass/:token or /verify/:token<br/>public pass verification"]
        Runtime["boot.js + appRuntime.js<br/>version and recovery"]
    end

    subgraph API["Spring Boot API on Render Docker Service"]
        Auth["AuthController + AuthService"]
        Org["OrganizationController + OrganizationService"]
        Portal["Admin/Employee/Security/Visitor controllers"]
        VisitorSvc["VisitorService"]
        Workforce["WorkforceOnboardingService"]
        Attendance["EmployeeAttendanceService"]
        Notify["NotificationService + async email dispatcher"]
        Audit["AccessAuditService"]
        Filters["JWT, rate limit, sanitization,<br/>request logging"]
    end

    subgraph Data["MongoDB"]
        Users["users"]
        Visitors["visitors"]
        AttendanceLogs["employee_attendance_logs"]
        Notifications["notifications"]
        AuditLogs["access_audit_logs + visitor_audit_logs"]
        Tokens["refresh_tokens + password_reset_tokens + super_admin_creation_otps"]
        Orgs["organizations + departments + homepage_settings"]
    end

    Cloudinary["Cloudinary<br/>visitor/workforce photo storage"]
    SendGrid["SendGrid<br/>OTP and notification email"]

    Landing --> Runtime
    Admin --> Runtime
    Employee --> Runtime
    Security --> Runtime
    Visitor --> Runtime
    Pass --> Runtime

    Runtime --> Auth
    Runtime --> Portal
    Runtime --> Org

    Portal --> VisitorSvc
    Portal --> Workforce
    Portal --> Attendance
    Auth --> Notify
    VisitorSvc --> Notify
    Workforce --> Audit
    Attendance --> Audit

    Auth --> Users
    Auth --> Tokens
    Org --> Orgs
    VisitorSvc --> Visitors
    VisitorSvc --> AuditLogs
    Workforce --> Users
    Attendance --> Users
    Attendance --> AttendanceLogs
    Notify --> Notifications
    Audit --> AuditLogs

    VisitorSvc --> Cloudinary
    Workforce --> Cloudinary
    Notify --> SendGrid
    Auth --> SendGrid
    Filters --> Auth
    Filters --> Portal
```

## Frontend To Backend Interaction

```mermaid
sequenceDiagram
    participant Browser as Browser App
    participant Runtime as Runtime + Session Layer
    participant API as Spring Boot API
    participant DB as MongoDB

    Browser->>Runtime: Load entry HTML and boot.js
    Runtime->>Runtime: Check stored app version
    Runtime->>Runtime: Restore local session if present

    alt login
        Browser->>API: POST /api/v1/auth/login
        API->>DB: Validate user + organization + role
        API-->>Browser: AuthResponse(access + refresh)
        Runtime->>Runtime: Persist session
        Runtime->>Browser: Redirect to role portal
    end

    Browser->>API: GET protected portal data
    API->>DB: Apply JWT auth + role scope + org scope
    API-->>Browser: ApiResponse<T>

    alt access token expired
        Browser->>API: POST /api/v1/auth/refresh
        API->>DB: Validate and rotate refresh token
        API-->>Browser: New AuthResponse
        Runtime->>Runtime: Replace stored session
        Browser->>API: Retry original request
    end
```

## Deployment Architecture

```mermaid
flowchart TD
    Git["GitHub repository"] --> RenderWeb["Render static service<br/>accessflow-web"]
    Git --> RenderApi["Render Docker service<br/>accessflow-api"]

    RenderWeb --> Dist["frontend/dist/"]
    RenderApi --> Jar["Spring Boot jar in Docker image"]

    Dist --> Browser["User browser"]
    Browser --> RenderApi

    RenderApi --> Mongo["MongoDB Atlas / MongoDB"]
    RenderApi --> Cloudinary["Cloudinary"]
    RenderApi --> SendGrid["SendGrid"]
```

## RBAC Architecture

```mermaid
flowchart TD
    Login["Audience-aware login"] --> Token["JWT access token<br/>roles claim"]
    Token --> FEGuard["Frontend requireRole() + portal redirect"]
    Token --> BEFilter["JwtAuthenticationFilter"]
    BEFilter --> RouteRules["SecurityConfig route matchers"]
    RouteRules --> MethodRules["@PreAuthorize rules"]
    MethodRules --> ServiceScope["Service-level org/host checks"]

    FEGuard --> AdminPortal["ADMIN or SUPER_ADMIN portal"]
    FEGuard --> EmployeePortal["EMPLOYEE portal"]
    FEGuard --> SecurityPortal["SECURITY_GUARD portal"]
    FEGuard --> VisitorPortal["VISITOR portal"]

    ServiceScope --> OrgScope["organizationId scoping"]
    ServiceScope --> HostScope["hostEmployeeId scoping"]
    ServiceScope --> LifecycleRules["visitor/workforce state checks"]
```

## Key Implementation Facts

- Visitor QR verification is not a frontend-only concern. The browser always asks the backend to verify live approval, timing, organization, and lifecycle state.
- Workforce static QR payloads are separate from visitor passes and are interpreted only by `EmployeeAttendanceService`.
- Organization isolation is enforced mostly in services, not just in route annotations.
- Notification email sending is asynchronous and retry-based.
- Cache-based analytics exist on the backend through the `adminAnalytics` and `statusSummary` caches.
