# API Reference

## Response Envelope Rules

Current response patterns:

- `POST /api/v1/auth/login` returns raw `AuthResponse`
- most other endpoints return `ApiResponse<T>`
- paginated list endpoints use `PageResponse<T>` inside `ApiResponse`

Typical `ApiResponse<T>` fields are:

- `success`
- `message`
- `data`
- `timestamp`

## Public And Auth Endpoints

| Method | Path | Auth | Roles | Notes |
| --- | --- | --- | --- | --- |
| `POST` | `/api/v1/auth/login` | No | Public | audience-aware login |
| `POST` | `/api/v1/auth/register` | No | Public | visitor account registration |
| `POST` | `/api/v1/auth/refresh` | No | Public with refresh token | rotates refresh token |
| `POST` | `/api/v1/auth/logout` | No | Public with refresh token | revokes refresh token if found |
| `POST` | `/api/v1/auth/forgot-password` | No | Public | starts OTP flow |
| `POST` | `/api/v1/auth/verify-otp` | No | Public | exchanges OTP for reset token |
| `POST` | `/api/v1/auth/reset-password` | No | Public | sets new password |
| `GET` | `/api/v1/auth/me` | Yes | any authenticated role | current user profile |
| `GET` | `/api/v1/health` | No | Public | base health |
| `GET` | `/api/v1/health/live` | No | Public | liveness |
| `GET` | `/api/v1/health/ready` | No | Public | readiness with Mongo ping |
| `GET` | `/api/versions` | No | Public | current API version |
| `GET` | `/api/v1/public/passes/{token}` | No | Public | public pass verification |
| `GET` | `/api/v1/homepage` | No | Public | public homepage metrics/content |

## Organization And Homepage Endpoints

| Method | Path | Auth | Roles | Notes |
| --- | --- | --- | --- | --- |
| `GET` | `/api/v1/organizations/public` | No | Public | active org list for registration |
| `GET` | `/api/v1/organizations` | Yes | `SUPER_ADMIN`, `ADMIN` | accessible orgs |
| `GET` | `/api/v1/organizations/workspace` | Yes | `SUPER_ADMIN` | org workspace list |
| `GET` | `/api/v1/organizations/{id}/workspace` | Yes | `SUPER_ADMIN` | org workspace detail |
| `POST` | `/api/v1/organizations` | Yes | `SUPER_ADMIN` | create org |
| `PUT` | `/api/v1/organizations/{id}` | Yes | `SUPER_ADMIN` | update org |
| `GET` | `/api/v1/homepage/settings` | Yes | `SUPER_ADMIN` | homepage settings |
| `PUT` | `/api/v1/homepage/settings` | Yes | `SUPER_ADMIN` | update homepage settings |

## Notification Endpoints

| Method | Path | Auth | Roles | Notes |
| --- | --- | --- | --- | --- |
| `GET` | `/api/v1/notifications?limit=10` | Yes | all roles | latest notifications |
| `PATCH` | `/api/v1/notifications/{id}/read` | Yes | recipient only | marks one read |
| `PATCH` | `/api/v1/notifications/read-all` | Yes | recipient only | marks up to latest batch read |

## Visitor Portal Endpoints

| Method | Path | Auth | Roles | Notes |
| --- | --- | --- | --- | --- |
| `GET` | `/api/v1/visitor/overview` | Yes | `VISITOR` | visitor summary |
| `GET` | `/api/v1/visitor/visits` | Yes | `VISITOR` | current visitor requests |
| `GET` | `/api/v1/visitor/history` | Yes | `VISITOR` | visitor history summary |
| `GET` | `/api/v1/visitor/hosts` | Yes | `VISITOR` | host lookup |
| `POST` | `/api/v1/visitor/visits` | Yes | `VISITOR` | self-service visit request |
| `POST` | `/api/v1/visitor/visits/photo` | Yes | `VISITOR` | photo upload |
| `GET` | `/api/v1/visitor/visits/{id}/pass` | Yes | `VISITOR` | approved pass |
| `POST` | `/api/v1/visitor/visits/{id}/reschedule-request` | Yes | `VISITOR` | propose new time |

## Employee Portal Endpoints

| Method | Path | Auth | Roles | Notes |
| --- | --- | --- | --- | --- |
| `GET` | `/api/v1/employee/overview` | Yes | `EMPLOYEE` | overview metrics |
| `GET` | `/api/v1/employee/approvals` | Yes | `EMPLOYEE` | pending approvals |
| `GET` | `/api/v1/employee/pre-approvals` | Yes | `EMPLOYEE` | upcoming pre-approvals |
| `POST` | `/api/v1/employee/pre-approvals` | Yes | `EMPLOYEE` | create pre-approval |
| `GET` | `/api/v1/employee/notifications` | Yes | `EMPLOYEE` | employee notices |
| `GET` | `/api/v1/employee/attendance` | Yes | `EMPLOYEE` | own presence history |
| `GET` | `/api/v1/employee/badge` | Yes | `EMPLOYEE` | own reusable badge |
| `GET` | `/api/v1/employee/scheduled-visitors` | Yes | `EMPLOYEE` | scheduled visitors |
| `GET` | `/api/v1/employee/history` | Yes | `EMPLOYEE` | visitor history search |
| `GET` | `/api/v1/employee/visitors` | Yes | `EMPLOYEE` | visitor search |
| `GET` | `/api/v1/employee/visitors/{id}` | Yes | `EMPLOYEE` | host-owned visitor only |
| `POST` | `/api/v1/employee/visitors` | Yes | `EMPLOYEE` | create visitor under host |
| `PATCH` | `/api/v1/employee/visitors/{id}/approve` | Yes | `EMPLOYEE` | approve visitor |
| `PATCH` | `/api/v1/employee/visitors/{id}/reject` | Yes | `EMPLOYEE` | reject visitor |
| `POST` | `/api/v1/employee/visitors/photo` | Yes | `EMPLOYEE` | photo upload |
| `PUT` | `/api/v1/employee/visitors/{id}` | Yes | `EMPLOYEE` | update host-owned visitor |
| `PATCH` | `/api/v1/employee/visitors/{id}/reschedule` | Yes | `EMPLOYEE` | direct host reschedule |
| `PATCH` | `/api/v1/employee/visitors/{id}/reschedule-request/approve` | Yes | `EMPLOYEE` | approve visitor request |
| `PATCH` | `/api/v1/employee/visitors/{id}/reschedule-request/reject` | Yes | `EMPLOYEE` | reject visitor request |

## Security Portal Endpoints

| Method | Path | Auth | Roles | Notes |
| --- | --- | --- | --- | --- |
| `GET` | `/api/v1/security/overview` | Yes | `SECURITY_GUARD` | overview metrics |
| `GET` | `/api/v1/security/checkins` | Yes | `SECURITY_GUARD` | checked-in visitor search |
| `GET` | `/api/v1/security/photo-capture` | Yes | `SECURITY_GUARD` | camera/photo metadata |
| `POST` | `/api/v1/security/qr-verification` | Yes | `SECURITY_GUARD` | verify visitor pass |
| `POST` | `/api/v1/security/qr-check-in` | Yes | `SECURITY_GUARD` | check in from valid QR |
| `GET` | `/api/v1/security/badges` | Yes | `SECURITY_GUARD` | approved badge queue |
| `GET` | `/api/v1/security/queue` | Yes | `SECURITY_GUARD` | approved live queue |
| `GET` | `/api/v1/security/visitors` | Yes | `SECURITY_GUARD` | visitor search |
| `GET` | `/api/v1/security/monitoring` | Yes | `SECURITY_GUARD` | live visitor lifecycle board |
| `GET` | `/api/v1/security/hosts` | Yes | `SECURITY_GUARD` | host search |
| `GET` | `/api/v1/security/employees` | Yes | `SECURITY_GUARD` | employee directory |
| `POST` | `/api/v1/security/workforce-onboarding` | Yes | `SECURITY_GUARD` | security-assisted onboarding |
| `POST` | `/api/v1/security/workforce-onboarding/photo` | Yes | `SECURITY_GUARD` | workforce photo upload |
| `GET` | `/api/v1/security/employees/attendance` | Yes | `SECURITY_GUARD` | workforce presence logs |
| `POST` | `/api/v1/security/employees/qr-scan` | Yes | `SECURITY_GUARD` | employee QR scan |
| `GET` | `/api/v1/security/employees/{id}/badge` | Yes | `SECURITY_GUARD` | employee badge |
| `PATCH` | `/api/v1/security/employees/{id}/check-in` | Yes | `SECURITY_GUARD` | manual employee check-in |
| `PATCH` | `/api/v1/security/employees/{id}/check-out` | Yes | `SECURITY_GUARD` | manual employee check-out |
| `GET` | `/api/v1/security/visitors/{id}` | Yes | `SECURITY_GUARD` | visitor detail |
| `GET` | `/api/v1/security/visitors/{id}/history` | Yes | `SECURITY_GUARD` | related history |
| `GET` | `/api/v1/security/visitors/{id}/pass` | Yes | `SECURITY_GUARD` | visitor pass |
| `PATCH` | `/api/v1/security/visitors/{id}/badge-printed` | Yes | `SECURITY_GUARD` | print recorded |
| `POST` | `/api/v1/security/visitors` | Yes | `SECURITY_GUARD` | create visitor |
| `POST` | `/api/v1/security/visitors/photo` | Yes | `SECURITY_GUARD` | visitor photo upload |
| `PUT` | `/api/v1/security/visitors/{id}` | Yes | `SECURITY_GUARD` | update visitor |
| `PATCH` | `/api/v1/security/visitors/{id}/check-in` | Yes | `SECURITY_GUARD` | direct check-in |
| `PATCH` | `/api/v1/security/visitors/{id}/override-check-in` | Yes | `SECURITY_GUARD` | manual override check-in |
| `PATCH` | `/api/v1/security/visitors/{id}/check-out` | Yes | `SECURITY_GUARD` | check-out |
| `PATCH` | `/api/v1/security/visitors/{id}/suspend` | Yes | `SECURITY_GUARD` | suspend recurring |
| `PATCH` | `/api/v1/security/visitors/{id}/revoke` | Yes | `SECURITY_GUARD` | revoke recurring |
| `PATCH` | `/api/v1/security/visitors/{id}/reactivate` | Yes | `SECURITY_GUARD` | reactivate recurring |

## Admin Endpoints

| Method | Path | Auth | Roles | Notes |
| --- | --- | --- | --- | --- |
| `GET` | `/api/v1/admin/overview` | Yes | `ADMIN`, `SUPER_ADMIN` | overview metrics |
| `GET` | `/api/v1/admin/analytics` | Yes | `ADMIN`, `SUPER_ADMIN` | admin dashboard analytics |
| `GET` | `/api/v1/admin/users` | Yes | `ADMIN`, `SUPER_ADMIN` | list internal users |
| `POST` | `/api/v1/admin/users` | Yes | `ADMIN`, `SUPER_ADMIN` | create internal user |
| `POST` | `/api/v1/admin/super-admins/otp` | Yes | `SUPER_ADMIN` | start secure super-admin flow |
| `POST` | `/api/v1/admin/super-admins` | Yes | `SUPER_ADMIN` | create super-admin |
| `PATCH` | `/api/v1/admin/users/{id}/disable` | Yes | `ADMIN`, `SUPER_ADMIN` | disable user |
| `PATCH` | `/api/v1/admin/users/{id}/enable` | Yes | `ADMIN`, `SUPER_ADMIN` | enable user |
| `PATCH` | `/api/v1/admin/users/{id}/reset-password` | Yes | `ADMIN`, `SUPER_ADMIN` | reset internal password |
| `PATCH` | `/api/v1/admin/users/{id}/role` | Yes | `ADMIN`, `SUPER_ADMIN` | update role with restrictions |
| `GET` | `/api/v1/admin/departments` | Yes | `ADMIN`, `SUPER_ADMIN` | list departments |
| `POST` | `/api/v1/admin/departments` | Yes | `ADMIN`, `SUPER_ADMIN` | create/reactivate department |
| `PATCH` | `/api/v1/admin/departments/{id}` | Yes | `ADMIN`, `SUPER_ADMIN` | rename or toggle department |
| `GET` | `/api/v1/admin/reports` | Yes | `ADMIN`, `SUPER_ADMIN` | audit oversight |
| `GET` | `/api/v1/admin/workforce-attendance` | Yes | `ADMIN`, `SUPER_ADMIN` | workforce presence logs |
| `GET` | `/api/v1/admin/workforce-onboarding` | Yes | `ADMIN`, `SUPER_ADMIN` | pending workforce approvals |
| `PUT` | `/api/v1/admin/workforce-onboarding/{id}` | Yes | `ADMIN` | update worker details |
| `PATCH` | `/api/v1/admin/workforce-onboarding/{id}/approve` | Yes | `ADMIN` | approve workforce |
| `PATCH` | `/api/v1/admin/workforce-onboarding/{id}/reject` | Yes | `ADMIN` | reject workforce |
| `GET` | `/api/v1/admin/workforce-attendance/analytics` | Yes | `ADMIN`, `SUPER_ADMIN` | workforce analytics |
| `GET` | `/api/v1/admin/monitoring` | Yes | `SUPER_ADMIN` | platform monitoring |
| `GET` | `/api/v1/admin/homepage-settings` | Yes | `SUPER_ADMIN` | duplicate homepage settings access |
| `PUT` | `/api/v1/admin/homepage-settings` | Yes | `SUPER_ADMIN` | duplicate homepage settings update |
| `GET` | `/api/v1/admin/visitors` | Yes | `ADMIN`, `SUPER_ADMIN` | visitor search |
| `GET` | `/api/v1/admin/visitors/{id}` | Yes | `ADMIN`, `SUPER_ADMIN` | visitor detail |
| `POST` | `/api/v1/admin/visitors` | Yes | `ADMIN`, `SUPER_ADMIN` | create visitor |
| `POST` | `/api/v1/admin/visitors/photo` | Yes | `ADMIN`, `SUPER_ADMIN` | visitor photo upload |
| `PUT` | `/api/v1/admin/visitors/{id}` | Yes | `ADMIN`, `SUPER_ADMIN` | update visitor |
| `PATCH` | `/api/v1/admin/visitors/{id}/check-in` | Yes | `ADMIN`, `SUPER_ADMIN` | check-in |
| `PATCH` | `/api/v1/admin/visitors/{id}/check-out` | Yes | `ADMIN`, `SUPER_ADMIN` | check-out |
| `DELETE` | `/api/v1/admin/visitors/{id}` | Yes | `ADMIN`, `SUPER_ADMIN` | delete visitor |

## Request Examples

## Login

```json
{
  "identifier": "security.guard01",
  "password": "StrongPassword!123",
  "companyCode": "ACME",
  "portalAudience": "security"
}
```

Representative response:

```json
{
  "success": true,
  "accessToken": "<jwt>",
  "refreshToken": "<opaque-token>",
  "tokenType": "Bearer",
  "expiresAt": "2026-05-16T08:00:00Z",
  "userId": "6825...",
  "username": "security.guard01",
  "email": "guard@acme.com",
  "fullName": "Security Guard",
  "organizationId": "681f...",
  "organizationName": "Acme Corp",
  "organizationCode": "ACME",
  "organizationTimezone": "Asia/Kolkata",
  "organizationRegionCountry": "India",
  "roles": ["SECURITY_GUARD"]
}
```

## Visitor self-service request

```json
{
  "phoneCountryCode": "+91",
  "phone": "9876543210",
  "companyCode": "ACME",
  "hostEmployeeId": "6825host",
  "hostEmployee": "Asha Sharma",
  "purposeOfVisit": "Vendor review meeting",
  "scheduledStartTime": "2026-05-20T04:30:00Z",
  "expectedDurationMinutes": 60,
  "timezone": "Asia/Kolkata",
  "photoUrl": "https://res.cloudinary.com/.../visitor-123.jpg",
  "photoPublicId": "visitor-management/visitor-photos/visitor-123"
}
```

## Employee pre-approval

```json
{
  "fullName": "Ravi Patel",
  "phoneCountryCode": "+91",
  "phone": "9876543210",
  "email": "ravi@example.com",
  "companyName": "Patel Services",
  "purposeOfVisit": "Scheduled equipment delivery",
  "scheduledStartTime": "2026-05-20T04:30:00Z",
  "scheduledEndTime": "2026-05-20T05:30:00Z",
  "timezone": "Asia/Kolkata",
  "note": "Deliver at gate 2"
}
```

## Visitor QR verification

```json
{
  "qrPayload": "https://accessflow-web.onrender.com/pass/550e8400-e29b-41d4-a716-446655440000"
}
```

Representative response fields:

```json
{
  "valid": true,
  "recognized": true,
  "resultCode": "VALID_PASS",
  "headline": "Pass verified",
  "message": "Approval is active and the visitor can be checked in.",
  "recommendedAction": "Confirm the visitor photo and identity, then complete check-in.",
  "visitorId": "6825visitor",
  "fullName": "Ravi Patel",
  "organizationCode": "ACME",
  "status": "APPROVED",
  "badgeId": "AFB-...",
  "passCode": "AFP-...",
  "expiresAt": "2026-05-20T06:30:00Z",
  "canCheckIn": true,
  "canCheckOut": false
}
```

## Workforce onboarding request

```json
{
  "fullName": "Sanjay Kumar",
  "department": "Facilities",
  "phone": "9999999999",
  "designation": "Support staff",
  "employeeType": "SUPPORT_STAFF",
  "shiftName": "Morning Shift",
  "shiftStartTime": "09:00",
  "shiftEndTime": "18:00",
  "employeePhotoUrl": "https://res.cloudinary.com/.../worker.jpg"
}
```

## Organization creation

```json
{
  "companyName": "Acme Corp",
  "companyCode": "ACME",
  "address": "Sector 21, Bengaluru",
  "contactEmail": "ops@acme.com",
  "regionCountry": "India",
  "timezone": "Asia/Kolkata",
  "activeStatus": true,
  "departmentNames": ["Administration", "Security", "Operations", "Facilities"]
}
```

## Validation Rules

Key current validation rules from DTOs and services:

- strong passwords must be 12-128 chars with upper, lower, number, symbol
- usernames follow the shared `UsernamePolicy`
- visitor schedules must be future-dated and between 15 minutes and 24 hours
- recurring visitors require validity start and end dates
- recurring entry-window start and end must both be present or both absent
- photo uploads must be JPEG, PNG, or WebP and 3 MB or smaller
- manual workforce overrides require a reason
- organization timezone must be a valid `ZoneId`
- internal organization code is required for non-visitor, non-super-admin login
