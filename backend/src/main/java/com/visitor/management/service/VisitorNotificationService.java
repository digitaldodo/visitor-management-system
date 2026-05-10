package com.visitor.management.service;

import com.visitor.management.entity.Visitor;

public interface VisitorNotificationService {
    void visitorPreApproved(Visitor visitor);

    void visitorExpired(Visitor visitor, String reason);
}
