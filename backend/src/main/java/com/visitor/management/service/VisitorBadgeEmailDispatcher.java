package com.visitor.management.service;

import com.visitor.management.entity.Visitor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Service
public class VisitorBadgeEmailDispatcher {

    private static final Logger log = LoggerFactory.getLogger(VisitorBadgeEmailDispatcher.class);

    private final EmailService emailService;

    public VisitorBadgeEmailDispatcher(EmailService emailService) {
        this.emailService = emailService;
    }

    @Async
    public void deliverApprovedBadgeEmailAsync(Visitor visitor) {
        try {
            emailService.sendVisitorApprovedBadge(visitor);
        } catch (RuntimeException ex) {
            log.warn("Visitor badge email delivery failed for visitor {}: {}", visitor.getId(), ex.getMessage());
        }
    }
}
