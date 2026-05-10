package com.visitor.management.service;

import com.visitor.management.entity.NotificationType;
import com.visitor.management.entity.Visitor;
import org.springframework.stereotype.Service;

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
        notifyHost(visitor, NotificationType.VISITOR_CHECKED_IN, "Visitor checked in", "%s has checked in at reception.".formatted(visitor.getFullName()));
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
