# AccessFlow Offline and Notification Parity

Phase 4 defines the operational parity contract for offline work, notifications, sync restoration, and recovery.

## Offline Strategy

AccessFlow intentionally treats the mobile app as the primary offline operational surface. Security guards and checkpoint operators can keep using cached visitor, badge, workforce, and attendance records when the backend is temporarily unreachable. Offline actions are queued on device, retried silently, and reconciled when connectivity returns.

The web portal has partial offline tolerance only. It keeps runtime recovery, stale asset cleanup, health checks, and in-app notification polling resilient, but it does not queue privileged operational mutations. Browser users should reconnect before approving access, scanning badges, or changing workforce state.

This difference is intentional:

- Mobile devices are closest to doors, checkpoints, cameras, and badges.
- Mobile storage is scoped to operational records with strict cache age limits.
- Web portals remain administrative and supervisory surfaces where live backend authority is required.

## Notification Parity

Backend notification records are the source of truth for push, in-app, realtime, email, and web notification centers. Each notification carries:

- `type`, `category`, and `priority` for filtering and alert treatment.
- `targetType`, `targetId`, and `deepLink` for mobile routing.
- `actionUrl` for web and legacy route compatibility.
- `organizationId` and recipient scope for tenant safety.
- A dedupe key, explicit or backend-derived, to prevent spam.

Mobile push uses Firebase first when an FCM token exists, with Expo push as a fallback only after Firebase delivery fails. In-app notification lists and realtime operational events invalidate the same role-scoped query families. Web uses the same backend notification inbox and suppresses browser toasts for stale alerts.

## Delivery Rules

Operational notifications should be concise, target-scoped, and time-aware:

- Approval, visitor, badge, incident, invite, and workforce notifications must include a target when one exists.
- Repeated reminders use dedupe windows so a sweep or retry cannot flood a recipient.
- Stale visitor reminders are skipped after the visitor has checked in, checked out, expired, been rejected, or been suspended.
- Devices without granted notification permission or usable push tokens are skipped for push delivery while the in-app inbox remains authoritative.

## Sync and Recovery

Mobile offline recovery follows a quiet retry model:

- Stuck `syncing` queue items are returned to `pending` after a short recovery window.
- Failed sync attempts receive an exponential retry delay and remain silent unless the item exhausts retries.
- Queue restoration, stale-cache cleanup, telemetry flushes, and runtime health probes run together on resume and connectivity restoration.
- Cache-backed badge and workforce actions remain provisional until backend sync confirms them.

## Deep-Link Targets

Notifications must open equivalent operational destinations on web and mobile:

| Target | Mobile | Web |
| --- | --- | --- |
| Visitor | Security detail, employee requests, visitor pass, or admin visitors | security badges, employee requests, visitor visits, or admin visitor access |
| Approval | Employee requests or admin approvals | employee requests or admin visitor access |
| Badge | Visitor pass, security visitor detail, workforce badge, or admin records | visitor visits, security badges, employee credential, or admin visitor access |
| Incident | Security emergency or admin emergency | security monitoring or admin emergency ops |
| Invite | Visitor home/registration, employee requests, or admin visitors | visitor visits, employee requests, or admin visitor access |

No Expo build is required for this phase; validation is source, type, and backend test focused.
