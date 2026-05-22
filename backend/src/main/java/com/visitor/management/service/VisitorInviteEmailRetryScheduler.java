package com.visitor.management.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class VisitorInviteEmailRetryScheduler {

    private final VisitorInviteEmailDispatcher visitorInviteEmailDispatcher;

    public VisitorInviteEmailRetryScheduler(VisitorInviteEmailDispatcher visitorInviteEmailDispatcher) {
        this.visitorInviteEmailDispatcher = visitorInviteEmailDispatcher;
    }

    @Scheduled(fixedDelayString = "${app.notifications.email-retry-delay-ms:120000}")
    public void retryPendingInviteEmails() {
        visitorInviteEmailDispatcher.retryPendingInviteEmails();
    }
}
