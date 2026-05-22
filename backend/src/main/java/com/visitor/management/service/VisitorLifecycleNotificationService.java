package com.visitor.management.service;

import com.visitor.management.entity.NotificationType;
import com.visitor.management.entity.Visitor;
import com.visitor.management.entity.VisitorInviteStatus;
import com.visitor.management.repository.VisitorInviteRepository;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;

@Service
public class VisitorLifecycleNotificationService implements VisitorNotificationService {

    private final NotificationService notificationService;
    private final VisitorInviteRepository visitorInviteRepository;
    private final VisitorBadgeEmailDispatcher visitorBadgeEmailDispatcher;

    public VisitorLifecycleNotificationService(
            NotificationService notificationService,
            VisitorInviteRepository visitorInviteRepository,
            VisitorBadgeEmailDispatcher visitorBadgeEmailDispatcher
    ) {
        this.notificationService = notificationService;
        this.visitorInviteRepository = visitorInviteRepository;
        this.visitorBadgeEmailDispatcher = visitorBadgeEmailDispatcher;
    }

    @Override
    public void visitorApprovalRequested(Visitor visitor) {
        notificationService.notifyUser(
                visitor.getHostEmployeeId(),
                NotificationType.VISITOR_APPROVAL_REQUEST,
                "Visitor approval requested",
                "%s is waiting for your approval.".formatted(visitor.getFullName()),
                visitor,
                "/pages/employee/#approvals"
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
                "/pages/employee/#scheduled"
        );
        sendApprovedBadgeEmail(visitor);
    }

    @Override
    public void visitorApproved(Visitor visitor) {
        String message = visitor.getQrIssuedAt() == null
                ? "%s has been approved.".formatted(visitor.getFullName())
                : "%s has been approved. The visitor badge is ready.".formatted(visitor.getFullName());
        notifyHost(visitor, NotificationType.VISITOR_APPROVED, "Visitor approved", message, "/pages/employee/#scheduled", null);
        markInviteQrIssued(visitor);
        sendApprovedBadgeEmail(visitor);
    }

    @Override
    public void visitorRejected(Visitor visitor) {
        notifyHost(visitor, NotificationType.VISITOR_REJECTED, "Visitor denied", "%s has been denied.".formatted(visitor.getFullName()));
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
                "/pages/employee/#requests",
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
        notifyHost(visitor, type, title, message, "/pages/employee/#history", null);
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
            invite.setStatus(VisitorInviteStatus.QR_ISSUED);
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
}
