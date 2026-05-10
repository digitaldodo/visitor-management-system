package com.visitor.management.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class NotificationRetryScheduler {

    private final NotificationEmailDispatcher notificationEmailDispatcher;

    public NotificationRetryScheduler(NotificationEmailDispatcher notificationEmailDispatcher) {
        this.notificationEmailDispatcher = notificationEmailDispatcher;
    }

    @Scheduled(fixedDelayString = "${app.notifications.email-retry-delay-ms:120000}")
    public void retryPendingEmails() {
        notificationEmailDispatcher.retryPendingEmails();
    }
}
