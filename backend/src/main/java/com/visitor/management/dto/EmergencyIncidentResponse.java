package com.visitor.management.dto;

import com.visitor.management.entity.EmergencyIncidentSeverity;
import com.visitor.management.entity.EmergencyIncidentStatus;
import com.visitor.management.entity.EmergencyIncidentType;

import java.time.Instant;

public record EmergencyIncidentResponse(
        String id,
        EmergencyIncidentType type,
        EmergencyIncidentSeverity severity,
        EmergencyIncidentStatus status,
        String title,
        String message,
        String checkpoint,
        String subjectType,
        String subjectId,
        String subjectName,
        String actorName,
        String notes,
        int repeatCount,
        Instant createdAt,
        Instant resolvedAt
) {
}
