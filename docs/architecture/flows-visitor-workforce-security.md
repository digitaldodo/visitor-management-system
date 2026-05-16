# Visitor, Workforce, And Security Flows

## Visitor Lifecycle States

```mermaid
flowchart LR
    PENDING["PENDING"] --> APPROVED["APPROVED"]
    PENDING --> REJECTED["REJECTED"]
    PENDING --> EXPIRED["EXPIRED"]
    APPROVED --> CHECKEDIN["CHECKED_IN"]
    APPROVED --> EXPIRED
    CHECKEDIN --> CHECKEDOUT["CHECKED_OUT"]
    CHECKEDIN --> EXPIRED
    CHECKEDOUT --> CHECKEDIN
    APPROVED --> SUSPENDED["SUSPENDED"]
    CHECKEDOUT --> SUSPENDED
    SUSPENDED --> APPROVED
    APPROVED --> EXPIRED
    CHECKEDOUT --> EXPIRED
```

Notes:

- `CHECKED_OUT -> CHECKED_IN` is allowed only for recurring visitor profiles.
- `SUSPENDED` and recurring reactivation are recurring-profile only.
- `EXPIRED` can mean pending approval timeout, scheduled pass expiry, or recurring validity expiry.

## Self-Service Visitor Flow

```mermaid
sequenceDiagram
    participant Visitor
    participant FE as Visitor portal
    participant API as VisitorService
    participant Host as Host employee

    Visitor->>FE: Upload photo and submit visit request
    FE->>API: POST /api/v1/visitor/visits
    API->>API: Copy account identity, resolve host, apply schedule
    API->>API: Set status=PENDING, approvalExpiresAt
    API-->>FE: VisitorResponse
    API->>Host: Notification: approval requested
    Host->>API: PATCH /api/v1/employee/visitors/{id}/approve or reject
    API->>API: Issue or clear pass credentials
    API-->>Visitor: Approved state becomes visible in portal
```

## Pre-Approved Visitor Flow

```mermaid
flowchart TD
    Employee["Employee submits pre-approval"] --> API["VisitorService.preApprove()"]
    API --> Schedule["Validate start/end and timezone"]
    Schedule --> Window["Set controlled access window"]
    Window --> Approve["status=APPROVED, preApproved=true"]
    Approve --> Pass["Issue pass code, badge ID, pass token, QR image"]
    Pass --> Notify["Notify host via notification service"]
    Pass --> Security["Security can verify and QR check-in later"]
```

Current behavior:

- pre-approved visitors must be checked in by QR scan or manual override
- ordinary direct `check-in` without QR is blocked for `preApproved=true`

## Walk-In And Emergency Flow

```mermaid
flowchart TD
    Desk["Security/Admin registers walk-in or emergency visitor"] --> Create["VisitorService.create()"]
    Create --> Type["visitorType = WALK_IN or EMERGENCY"]
    Type --> AutoApprove["status=APPROVED immediately"]
    AutoApprove --> Pass["Issue QR + badge immediately"]
    Pass --> Verify["Optional verification at checkpoint"]
    Verify --> CheckIn["check-in within allowed window"]
```

## Recurring Visitor Flow

```mermaid
flowchart TD
    Create["Security/Admin creates recurring or contractor profile"] --> Validate["Validate validity start/end and entry window"]
    Validate --> Approve["status=APPROVED, preApproved=true"]
    Approve --> Pass["Issue reusable pass credentials"]
    Pass --> Use["Visitor can be checked in during allowed validity/day/time"]
    Use --> Suspend["Suspend if needed"]
    Use --> Revoke["Revoke or let validity expire"]
    Suspend --> Reactivate["Reactivate if still within validity"]
```

Current recurring rules:

- only security, admin, or super admin can create recurring profiles
- allowed weekdays are normalized to `MON` through `SUN`
- entry-window start/end must either both exist or both be absent
- reactivation fails if `validityEndDate` has already passed

## Visitor Approval And Rejection Flow

```mermaid
flowchart LR
    Pending["PENDING visitor"] --> HostDecision["Host employee decision"]
    HostDecision -->|approve| Approved["APPROVED + pass issued"]
    HostDecision -->|reject| Rejected["REJECTED + pass cleared"]
```

## Visitor Reschedule Flow

```mermaid
sequenceDiagram
    participant Visitor
    participant API as VisitorService
    participant Host as Employee portal

    Visitor->>API: POST /visitor/visits/{id}/reschedule-request
    API->>API: Save pending start/end/timezone and RESCHEDULE_PENDING
    Host->>API: PATCH approve or reject
    alt approve
        API->>API: Apply approved schedule
        API->>API: Regenerate pass timing fields
    else reject
        API->>API: Clear pending fields and save rejection reason
    end
```

Host-side direct reschedule also exists through:

- `PATCH /api/v1/employee/visitors/{id}/reschedule`

## Visitor QR Generation

```mermaid
flowchart TD
    Approved["Visitor approved or immediate/recurring auto-approved"] --> Issue["issuePassCredentials()"]
    Issue --> PassCode["Generate qrCode like AFP-..."]
    Issue --> Badge["Generate badgeId if missing"]
    Issue --> Token["Generate passTokenId UUID"]
    Issue --> Expiry["Set qrExpiresAt from access window or validity end"]
    Expiry --> BadgeView["VisitorPassResponse includes qrPayload, verificationUrl, qrImageDataUri"]
```

## Visitor QR Validation Flow

```mermaid
flowchart TD
    Scan["Security scans badge payload or URL"] --> Extract["resolvePublicPassToken() or parse JWT payload"]
    Extract --> Load["Load visitor by passTokenId or fallback id"]
    Load --> Claims["Match pass claims against current visitor state"]
    Claims --> Org["Validate organization scope of guard"]
    Org --> State["Evaluate status and access window"]
    State --> Result["QrVerificationResponse"]
    Result --> Action["canCheckIn / canCheckOut / deny / review"]
```

Current invalid or blocked conditions:

- organization mismatch
- pending approval
- rejected visitor
- suspended recurring visitor
- expired pass
- already used pass
- already checked-in visitor
- recurring visitor outside weekday or entry window

## QR Expiry Flow

```mermaid
flowchart TD
    Scheduler["VisitorExpiryScheduler every fixed delay"] --> Query["VisitorService.expireDueVisitors()"]
    Query --> Pending["Expire PENDING when approvalExpiresAt <= now"]
    Query --> Approved["Expire APPROVED when accessWindowEndTime or qrExpiresAt <= now"]
    Query --> Recurring["Expire recurring profiles when validityEndDate <= now"]
    Pending --> History["Add AUTO_EXPIRED history and audit"]
    Approved --> History
    Recurring --> History
```

## Workforce / Employee Onboarding Flow

```mermaid
sequenceDiagram
    participant Guard as Security guard
    participant API as WorkforceOnboardingService
    participant Admin as Organization admin
    participant Attendance as EmployeeAttendanceService

    Guard->>API: POST /security/workforce-onboarding
    API->>API: Create EMPLOYEE account inactive + PENDING_APPROVAL
    API-->>Guard: AdminUserResponse receipt
    Admin->>API: GET /admin/workforce-onboarding
    Admin->>API: PATCH approve or reject
    alt approve
        API->>Attendance: activateEmployeeCredential()
        API->>API: active=true, accountStatus=ACTIVE
    else reject
        API->>Attendance: deactivateEmployeeCredential()
        API->>API: active=false, accountStatus=REJECTED
    end
```

## Static Employee QR Activation Flow

```mermaid
flowchart TD
    Employee["Employee account created or approved"] --> Provision["provisionEmployeeCredential()"]
    Provision --> EmpId["Generate employeeId if missing"]
    Provision --> Token["Generate employeeQrToken if missing"]
    Token --> Shift["Backfill default shift if missing"]
    Shift --> Active["activateEmployeeCredential() sets issuedAt and clears revokedAt"]
```

Current activation triggers:

- internal employee account creation by admin
- workforce onboarding approval
- employee account re-enable

Current deactivation triggers:

- workforce rejection
- employee account disable

## Employee Check-In / Check-Out Flow

```mermaid
flowchart TD
    Scan["Security scans ACCESSFLOW_EMPLOYEE payload"] --> Resolve["resolveEmployeeQr()"]
    Resolve --> Validate["same org, active employee, QR not revoked"]
    Validate --> State{"currently checked in?"}
    State -->|no| CheckIn["checkIn(): state=IN"]
    State -->|yes| CheckOut["checkOut(): state=OUT"]
    CheckIn --> Audit["recordEmployeeAttendance"]
    CheckOut --> Audit
```

## Manual Workforce Override Flow

```mermaid
flowchart LR
    Guard["Security guard"] --> Prompt["enter override reason"]
    Prompt --> Validate["reason required"]
    Validate --> ManualIn["PATCH /security/employees/{id}/check-in"]
    Validate --> ManualOut["PATCH /security/employees/{id}/check-out"]
    ManualIn --> Audit["lastAction=MANUAL_CHECK_IN"]
    ManualOut --> Audit["lastAction=MANUAL_CHECK_OUT"]
```

## Security Checkpoint Flow

```mermaid
flowchart TD
    Badge["Visitor badge scan"] --> Verify["POST /security/qr-verification"]
    Verify --> Decision{"Result"}
    Decision -->|valid and canCheckIn| CheckIn["POST /security/qr-check-in"]
    Decision -->|already checked in| Monitor["keep visitor on active monitoring"]
    Decision -->|canCheckOut path| CheckOut["PATCH /security/visitors/{id}/check-out"]
    Decision -->|invalid| Deny["deny or escalate"]
    CheckIn --> Notify["host notified of check-in"]
```

## Admin Flow

```mermaid
flowchart TD
    Admin["ADMIN portal"] --> Users["Create employee/security users"]
    Admin --> Departments["Create or rename departments in own organization"]
    Admin --> Workforce["Approve security-assisted workforce onboarding"]
    Admin --> Visitors["Operate visitor access workspace"]
    Admin --> Reports["View organization-scoped audit oversight"]
```

## Super Admin Flow

```mermaid
flowchart TD
    Super["SUPER_ADMIN portal"] --> Org["Create/update organizations"]
    Super --> Workspace["Open organization workspace summary"]
    Super --> Homepage["Manage homepage settings"]
    Super --> Monitoring["View platform monitoring"]
    Super --> SuperOtp["Request OTP for SUPER_ADMIN creation"]
    SuperOtp --> Create["Create new SUPER_ADMIN with password confirmation + OTP"]
    Super --> Reports["View platform-wide audit visibility"]
```
