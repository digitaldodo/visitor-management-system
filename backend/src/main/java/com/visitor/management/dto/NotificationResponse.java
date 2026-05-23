package com.visitor.management.dto;

import com.visitor.management.entity.NotificationCategory;
import com.visitor.management.entity.NotificationPriority;
import com.visitor.management.entity.NotificationStatus;
import com.visitor.management.entity.NotificationType;

import java.time.Instant;

public record NotificationResponse(
        String id,
        NotificationType type,
        NotificationCategory category,
        NotificationPriority priority,
        String organizationId,
        String title,
        String message,
        String visitorId,
        String visitorName,
        String actionUrl,
        String targetType,
        String targetId,
        String deepLink,
        String actorName,
        String organizationTimezone,
        boolean read,
        NotificationStatus emailStatus,
        Instant createdAt
) {
}
