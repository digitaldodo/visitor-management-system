package com.visitor.management.dto;

import java.time.Instant;

public record DepartmentResponse(
        String id,
        String organizationId,
        String organizationName,
        String organizationCode,
        String departmentName,
        boolean activeStatus,
        Instant createdAt
) {
}
