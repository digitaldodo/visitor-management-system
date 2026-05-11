package com.visitor.management.dto;

import java.time.Instant;

public record OrganizationResponse(
        String id,
        String companyName,
        String companyCode,
        String address,
        String contactEmail,
        boolean activeStatus,
        Instant createdAt,
        Instant updatedAt
) {
}
