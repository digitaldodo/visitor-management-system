package com.visitor.management.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class VisitorExpiryScheduler {

    private final VisitorService visitorService;

    public VisitorExpiryScheduler(VisitorService visitorService) {
        this.visitorService = visitorService;
    }

    @Scheduled(fixedDelayString = "${app.visitors.expiry-sweep-delay-ms:60000}")
    public void expireDueVisitors() {
        visitorService.expireDueVisitors();
        visitorService.notifyExpiringVisitorWindows();
    }
}
