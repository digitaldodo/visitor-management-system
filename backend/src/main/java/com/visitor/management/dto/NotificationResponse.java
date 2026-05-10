package com.visitor.management.dto;

import com.visitor.management.entity.NotificationStatus;
import com.visitor.management.entity.NotificationType;

import java.time.Instant;

public record NotificationResponse(
        String id,
        NotificationType type,
        String title,
        String message,
        String visitorId,
        String visitorName,
        String actionUrl,
        boolean read,
        NotificationStatus emailStatus,
        Instant createdAt
) {
}
