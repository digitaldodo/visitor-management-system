package com.visitor.management.dto;

import java.time.Instant;
import java.util.Map;

public record OperationalEventResponse(
        String id,
        String type,
        String category,
        String severity,
        String organizationId,
        String organizationName,
        String actorId,
        String actorName,
        String targetType,
        String targetId,
        String targetName,
        String title,
        String detail,
        Instant occurredAt,
        Map<String, Object> metadata
) {
}
