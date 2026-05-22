package com.visitor.management.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class VisitorOperationalReminderScheduler {

    private final VisitorOperationalReminderService visitorOperationalReminderService;

    public VisitorOperationalReminderScheduler(VisitorOperationalReminderService visitorOperationalReminderService) {
        this.visitorOperationalReminderService = visitorOperationalReminderService;
    }

    @Scheduled(fixedDelayString = "${app.notifications.reminders.sweep-delay-ms:60000}")
    public void dispatchDueOperationalReminders() {
        visitorOperationalReminderService.dispatchDueReminders();
    }
}
