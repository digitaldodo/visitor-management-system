package com.visitor.management.dto;

import com.visitor.management.entity.EmergencyIncidentSeverity;

import java.time.Instant;

public record EmergencyStateResponse(
        boolean lockdownActive,
        String lockdownReason,
        String lockdownScope,
        String lockdownInitiatedByName,
        Instant lockdownStartedAt,
        boolean approvalsSuspended,
        boolean checkInsBlocked,
        boolean evacuationActive,
        String evacuationScope,
        Instant evacuationStartedAt,
        String latestBroadcastTitle,
        String latestBroadcastMessage,
        EmergencyIncidentSeverity latestBroadcastSeverity,
        Instant latestBroadcastAt,
        String organizationId,
        String organizationName,
        Instant updatedAt
) {
}
