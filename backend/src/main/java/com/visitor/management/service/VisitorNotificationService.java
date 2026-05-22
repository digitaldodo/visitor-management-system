package com.visitor.management.service;

import com.visitor.management.entity.Visitor;

public interface VisitorNotificationService {
    void visitorApprovalRequested(Visitor visitor);

    void visitorPreApproved(Visitor visitor);

    void visitorApproved(Visitor visitor);

    void visitorRejected(Visitor visitor);

    void visitorCheckedIn(Visitor visitor);

    void visitorWaitingAtReception(Visitor visitor);

    void visitorRescheduled(Visitor visitor);

    void visitorAccessWindowExpiring(Visitor visitor);

    void visitorExpired(Visitor visitor, String reason);
}
