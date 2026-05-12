package com.visitor.management.dto;

import java.time.Instant;

public record OrganizationAuditLogResponse(
        String id,
        String action,
        String actorName,
        String outcome,
        String details,
        Instant createdAt
) {
}
