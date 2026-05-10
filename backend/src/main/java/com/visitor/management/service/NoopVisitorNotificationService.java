package com.visitor.management.service;

import com.visitor.management.entity.Visitor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class NoopVisitorNotificationService implements VisitorNotificationService {

    private static final Logger log = LoggerFactory.getLogger(NoopVisitorNotificationService.class);

    @Override
    public void visitorPreApproved(Visitor visitor) {
        log.debug("Visitor pre-approval notification queued for {}", visitor.getId());
    }

    @Override
    public void visitorExpired(Visitor visitor, String reason) {
        log.debug("Visitor expiry notification queued for {}: {}", visitor.getId(), reason);
    }
}
