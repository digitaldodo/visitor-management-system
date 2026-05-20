package com.visitor.management.dto;

import java.time.Instant;

public record EmergencyEvacuationPersonResponse(
        String id,
        String personType,
        String name,
        String organizationName,
        String department,
        String lastKnownCheckpoint,
        String evacuationStatus,
        Instant lastActivityAt
) {
}
