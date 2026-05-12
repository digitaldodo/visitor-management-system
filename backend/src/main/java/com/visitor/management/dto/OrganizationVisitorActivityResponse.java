package com.visitor.management.dto;

import java.time.Instant;

public record OrganizationVisitorActivityResponse(
        String id,
        String fullName,
        String companyName,
        String hostEmployee,
        String status,
        Instant createdAt,
        Instant checkInTime,
        Instant updatedAt
) {
}
