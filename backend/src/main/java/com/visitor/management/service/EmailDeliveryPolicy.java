package com.visitor.management.service;

import com.visitor.management.entity.NotificationStatus;

final class EmailDeliveryPolicy {

    static final int MAX_ATTEMPTS = 3;

    private EmailDeliveryPolicy() {
    }

    static NotificationStatus statusAfterFailure(int attempts) {
        return attempts >= MAX_ATTEMPTS ? NotificationStatus.FAILED : NotificationStatus.PENDING;
    }
}
