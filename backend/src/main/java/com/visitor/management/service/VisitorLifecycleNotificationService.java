package com.visitor.management.service;

import com.visitor.management.entity.NotificationType;
import com.visitor.management.entity.AccountStatus;
import com.visitor.management.entity.Role;
import com.visitor.management.entity.User;
import com.visitor.management.entity.Visitor;
import com.visitor.management.entity.VisitorInviteStatus;
import com.visitor.management.repository.UserRepository;
import com.visitor.management.repository.VisitorInviteRepository;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;

@Service
public class VisitorLifecycleNotificationService implements VisitorNotificationService {

    private final NotificationService notificationService;
    private final VisitorInviteRepository visitorInviteRepository;
    private final VisitorBadgeEmailDispatcher visitorBadgeEmailDispatcher;
    private final UserRepository userRepository;

    public VisitorLifecycleNotificationService(
            NotificationService notificationService,
            VisitorInviteRepository visitorInviteRepository,
            VisitorBadgeEmailDispatcher visitorBadgeEmailDispatcher,
            UserRepository userRepository
    ) {
        this.notificationService = notificationService;
        this.visitorInviteRepository = visitorInviteRepository;
        this.visitorBadgeEmailDispatcher = visitorBadgeEmailDispatcher;
        this.userRepository = userRepository;
    }

    @Override
    public void visitorApprovalRequested(Visitor visitor) {
        notificationService.notifyUser(
                visitor.getHostEmployeeId(),
                NotificationType.VISITOR_APPROVAL_REQUEST,
                "Visitor approval requested",
                "%s is waiting for your approval.".formatted(visitor.getFullName()),
                visitor,
                "/employee/requests"
        );
    }

    @Override
    public void visitorPreApproved(Visitor visitor) {
        notificationService.notifyUser(
                visitor.getHostEmployeeId(),
                NotificationType.VISITOR_APPROVED,
                "Visitor pre-approved",
                "%s has been pre-approved for the scheduled visit window.".formatted(visitor.getFullName()),
                visitor,
                "/employee/requests"
        );
        sendApprovedBadgeEmail(visitor);
    }

    @Override
    public void visitorApproved(Visitor visitor) {
        String message = visitor.getQrIssuedAt() == null
                ? "%s has been approved.".formatted(visitor.getFullName())
                : "%s has been approved. The visitor badge is ready.".formatted(visitor.getFullName());
        notifyHost(visitor, NotificationType.VISITOR_APPROVED, "Visitor approved", message, "/employee/requests", null);
        markInviteQrIssued(visitor);
        notifyVisitorAccount(visitor, NotificationType.VISITOR_APPROVED, "Badge issued", "Your visit has been approved and your QR badge is ready in AccessFlow.", "/visitor/pass", "badge-issued");
        sendApprovedBadgeEmail(visitor);
    }

    @Override
    public void visitorRejected(Visitor visitor) {
        notifyHost(visitor, NotificationType.VISITOR_REJECTED, "Visitor denied", "%s has been denied.".formatted(visitor.getFullName()));
        notifyVisitorAccount(visitor, NotificationType.VISITOR_REJECTED, "Visit not approved", "Your visitor pre-registration was not approved. Contact your host if you still need access.", "/visitor/notifications", "rejected");
    }

    @Override
    public void visitorCheckedIn(Visitor visitor) {
        notifyHost(visitor, NotificationType.VISITOR_CHECKED_IN, "Visitor checked in", "%s has checked in at reception.".formatted(visitor.getFullName()));
        markInviteArrived(visitor);
    }

    @Override
    public void visitorWaitingAtReception(Visitor visitor) {
        Instant dedupeCutoff = Instant.now().minus(Duration.ofMinutes(20));
        if (notificationService.hasRecentVisitorNotification(
                visitor.getHostEmployeeId(),
                NotificationType.VISITOR_WAITING_AT_RECEPTION,
                visitor.getId(),
                dedupeCutoff
        )) {
            return;
        }

        notifyHost(
                visitor,
                NotificationType.VISITOR_WAITING_AT_RECEPTION,
                "Visitor waiting at reception",
                "%s's badge was verified at reception and is awaiting check-in.".formatted(visitor.getFullName()),
                "/employee/requests",
                "visitor:%s:waiting:%d".formatted(visitor.getId(), Instant.now().getEpochSecond() / 1200)
        );
    }

    @Override
    public void visitorRescheduled(Visitor visitor) {
        notifyHost(
                visitor,
                NotificationType.VISITOR_RESCHEDULED,
                "Visitor schedule updated",
                "%s has a refreshed visit window. Review the new timing before arrival.".formatted(visitor.getFullName())
        );
    }

    @Override
    public void visitorAccessWindowExpiring(Visitor visitor) {
        Instant dedupeCutoff = visitor.getAccessWindowStartTime() != null
                ? visitor.getAccessWindowStartTime()
                : Instant.now().minus(Duration.ofHours(12));
        if (notificationService.hasRecentVisitorNotification(
                visitor.getHostEmployeeId(),
                NotificationType.VISITOR_ACCESS_WINDOW_EXPIRING,
                visitor.getId(),
                dedupeCutoff
        )) {
            return;
        }

        notifyHost(
                visitor,
                NotificationType.VISITOR_ACCESS_WINDOW_EXPIRING,
                "Visitor access window expiring",
                "%s has an access window that will expire soon.".formatted(visitor.getFullName())
        );
    }

    @Override
    public void visitorExpired(Visitor visitor, String reason) {
        notifyHost(visitor, NotificationType.VISITOR_EXPIRED, "Visitor approval expired", reason);
    }

    private void notifyHost(Visitor visitor, NotificationType type, String title, String message) {
        notifyHost(visitor, type, title, message, "/employee/history", null);
    }

    private void notifyHost(Visitor visitor, NotificationType type, String title, String message, String actionUrl, String dedupeKey) {
        notificationService.notifyUser(
                visitor.getHostEmployeeId(),
                type,
                title,
                message,
                visitor,
                actionUrl,
                null,
                visitor.getOrganizationId(),
                dedupeKey == null ? null : dedupeKey + ":recipient:" + visitor.getHostEmployeeId(),
                "VISITOR",
                visitor.getId()
        );
    }

    private void sendApprovedBadgeEmail(Visitor visitor) {
        if (visitor.getQrIssuedAt() == null || visitor.getPassTokenId() == null || isBlank(visitor.getEmail())) {
            return;
        }
        visitorBadgeEmailDispatcher.deliverApprovedBadgeEmailAsync(visitor);
    }

    private void markInviteQrIssued(Visitor visitor) {
        if (visitor.getQrIssuedAt() == null || visitor.getId() == null) {
            return;
        }
        visitorInviteRepository.findByVisitorId(visitor.getId()).ifPresent(invite -> {
            if (invite.getStatus() == VisitorInviteStatus.REVOKED || invite.getStatus() == VisitorInviteStatus.ARRIVED) {
                return;
            }
            invite.setStatus(VisitorInviteStatus.BADGE_ISSUED);
            invite.setQrIssuedAt(visitor.getQrIssuedAt());
            invite.setUpdatedAt(Instant.now());
            visitorInviteRepository.save(invite);
        });
    }

    private void markInviteArrived(Visitor visitor) {
        if (visitor.getId() == null) {
            return;
        }
        visitorInviteRepository.findByVisitorId(visitor.getId()).ifPresent(invite -> {
            if (invite.getStatus() == VisitorInviteStatus.REVOKED) {
                return;
            }
            Instant now = Instant.now();
            invite.setStatus(VisitorInviteStatus.ARRIVED);
            invite.setArrivedAt(now);
            invite.setUpdatedAt(now);
            visitorInviteRepository.save(invite);
        });
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private void notifyVisitorAccount(Visitor visitor, NotificationType type, String title, String message, String actionUrl, String dedupeSuffix) {
        if (isBlank(visitor.getEmail())) {
            return;
        }
        userRepository.findByEmailIgnoreCase(visitor.getEmail())
                .filter(user -> user.isActive())
                .filter(user -> user.getRoles() != null && user.getRoles().contains(Role.VISITOR))
                .filter(user -> user.getAccountStatus() == null || user.getAccountStatus() == AccountStatus.ACTIVE)
                .filter(user -> isBlank(user.getOrganizationId()) || user.getOrganizationId().equals(visitor.getOrganizationId()))
                .ifPresent(user -> notificationService.notifyUser(
                        user.getId(),
                        type,
                        title,
                        message,
                        visitor,
                        actionUrl,
                        visitor.getHostEmployee(),
                        visitor.getOrganizationId(),
                        "visitor:%s:%s:recipient:%s".formatted(visitor.getId(), dedupeSuffix, user.getId()),
                        "VISITOR",
                        visitor.getId()
                ));
    }
}
