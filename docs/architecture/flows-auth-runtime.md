# Auth And Runtime Flows

## App Bootstrap Flow

```mermaid
flowchart TD
    Load["Browser loads HTML"] --> Boot["boot.js installs AccessFlowRuntime"]
    Boot --> Register["bootstrapApplication(label, action)"]
    Register --> EnsureVersion["ensureVersion()"]
    EnsureVersion -->|version changed| Recover["runtime recover and reload"]
    EnsureVersion -->|same version| Init["portal/login module init"]
    Init --> ErrorBoundary["initAppErrorBoundary()"]
    ErrorBoundary --> RoleGuard["optional requireRole()"]
    RoleGuard --> LoadData["fetch initial data"]
    LoadData --> Ready["markReady()"]
```

## Login Flow

```mermaid
sequenceDiagram
    participant User
    participant FE as auth.js
    participant API as AuthController/AuthService
    participant DB as users + refresh_tokens

    User->>FE: Submit identifier, password, audience, company code
    FE->>API: POST /api/v1/auth/login
    API->>DB: Find by username/email
    API->>API: Validate password, account state, org code, portal audience
    API->>DB: Save new refresh token hash
    API-->>FE: AuthResponse
    FE->>FE: Normalize response and persist session
    FE->>FE: Decode token roles and cross-check body roles
    FE->>User: Redirect to portal
```

## Logout Flow

```mermaid
flowchart LR
    Click["User clicks logout"] --> FE["portalShell.js"]
    FE --> Clear["clearSession() immediately"]
    Clear --> Keepalive["POST /auth/logout with keepalive when possible"]
    Keepalive --> Revoke["AuthService revokes refresh token hash if found"]
    Revoke --> Home["redirect to /"]
```

## Access Token Handling And Refresh

```mermaid
sequenceDiagram
    participant FE as httpClient.js
    participant API as Protected endpoint
    participant Auth as /auth/refresh

    FE->>API: Request with Bearer access token
    alt access token accepted
        API-->>FE: 200 ApiResponse<T>
    else access token rejected with 401
        FE->>Auth: POST /auth/refresh with refresh token
        alt refresh accepted
            Auth-->>FE: New AuthResponse
            FE->>FE: Replace stored session
            FE->>API: Retry original request once
            API-->>FE: 200 ApiResponse<T>
        else refresh rejected
            Auth-->>FE: 401
            FE->>FE: clearSession()
            FE->>FE: runtime unauthorized-session recovery
            FE->>User: redirect to /
        end
    end
```

## Session Restore Flow

```mermaid
flowchart TD
    Start["Protected page opens"] --> Session["getSession() from localStorage"]
    Session -->|missing or invalid| Redirect["handleUnauthorizedSession() -> /"]
    Session --> Normalize["normalize stored auth payload"]
    Normalize --> RoleCheck["requireRole(requiredRole)"]
    RoleCheck -->|session role ok and token role ok| Allow["portal continues boot"]
    RoleCheck -->|stored roles stale vs token roles| Clear["clearSession()"]
    Clear --> Redirect
    RoleCheck -->|different valid role exists| PortalRedirect["redirect to matching portal"]
```

## Stale Session Recovery

The current frontend treats a session as stale when:

- the stored session has a role but the decoded JWT claims no longer overlap
- a protected request returns `401` and refresh cannot repair it
- runtime recovery is told to handle `"stale-session"` or `"invalid-session"`

Outcome:

- localStorage session is cleared
- most `accessflow.*` state is cleared
- user is redirected to `/`
- the login screen becomes the only re-entry point

## Frontend Version Mismatch Recovery

```mermaid
flowchart TD
    Open["Page open on version A"] --> Poll["boot.js polls app-manifest.json"]
    Poll --> Compare["compare manifest version with window.APP_VERSION"]
    Compare -->|same| Continue["keep running"]
    Compare -->|different| Recover["recover('deployment-update')"]
    Recover --> Persist["persist current version and clear transient storage"]
    Persist --> Reload["window.location.replace(currentUrl + ?afv=<version>)"]
```

## Asset And Module Failure Recovery

```mermaid
flowchart TD
    Error["window error or unhandled rejection"] --> Detect["isRecoverableError()?"]
    Detect -->|no| Toast["show non-fatal toast"]
    Detect -->|yes| Recover["recover bootstrap/runtime/resource failure"]
    Recover --> Clear["clear app storage, usually preserving session"]
    Clear --> Reload["reload current page"]
    Reload --> Ready["portal reboots on current asset version"]
```

## Safe Refresh Handling

The shared refresh button in `portalShell.js` does two things:

- checks `/api/v1/health`
- optionally calls a portal-specific data reload callback

It does not bypass the runtime system or skip auth rules. It is a safe data reload, not a hard runtime reset.

## Password Recovery Flow

```mermaid
sequenceDiagram
    participant User
    participant FE as passwordReset.js
    participant API as AuthService
    participant DB as password_reset_tokens
    participant Mail as SendGrid

    User->>FE: Submit identifier
    FE->>API: POST /auth/forgot-password
    API->>DB: Create or rotate OTP record
    API->>Mail: Send OTP email
    API-->>FE: expiresAt
    User->>FE: Submit OTP
    FE->>API: POST /auth/verify-otp
    API->>DB: Validate attempts, expiry, lock state
    API-->>FE: resetToken + expiry
    User->>FE: Submit new password
    FE->>API: POST /auth/reset-password
    API->>DB: Update password and revoke refresh tokens
```

## Current Auth Rules

- Visitors can log in without company code.
- Internal accounts require company code unless the account is `SUPER_ADMIN`.
- Portal audience is enforced at login time.
- Password changes invalidate previously issued access tokens indirectly because `JwtAuthenticationFilter` rejects tokens issued before `passwordChangedAt`.
