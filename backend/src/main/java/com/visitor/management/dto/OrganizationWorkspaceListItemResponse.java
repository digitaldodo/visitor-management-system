package com.visitor.management.dto;

import java.time.Instant;

public record OrganizationWorkspaceListItemResponse(
        String id,
        String companyName,
        String companyCode,
        String address,
        String contactEmail,
        boolean activeStatus,
        Instant createdAt,
        Instant updatedAt,
        long adminCount,
        long employeeCount,
        long departmentCount,
        long activeVisitors,
        long pendingVisitors,
        long recentVisitorCount,
        Instant lastVisitorActivityAt
) {
}
