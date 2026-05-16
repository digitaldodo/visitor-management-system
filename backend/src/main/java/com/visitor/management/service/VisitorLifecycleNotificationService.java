package com.visitor.management.service;

import com.visitor.management.entity.NotificationType;
import com.visitor.management.entity.Visitor;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;

@Service
public class VisitorLifecycleNotificationService implements VisitorNotificationService {

    private final NotificationService notificationService;

    public VisitorLifecycleNotificationService(NotificationService notificationService) {
        this.notificationService = notificationService;
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
    }

    @Override
    public void visitorApproved(Visitor visitor) {
        notifyHost(visitor, NotificationType.VISITOR_APPROVED, "Visitor approved", "%s has been approved.".formatted(visitor.getFullName()));
    }

    @Override
    public void visitorRejected(Visitor visitor) {
        notifyHost(visitor, NotificationType.VISITOR_REJECTED, "Visitor rejected", "%s has been rejected.".formatted(visitor.getFullName()));
    }

    @Override
    public void visitorCheckedIn(Visitor visitor) {
        notifyHost(visitor, NotificationType.VISITOR_ARRIVED, "Visitor arrived onsite", "%s has arrived at reception and is ready for their visit.".formatted(visitor.getFullName()));
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
        notificationService.notifyUser(
                visitor.getHostEmployeeId(),
                type,
                title,
                message,
                visitor,
                "/pages/employee/#history"
        );
    }
}
