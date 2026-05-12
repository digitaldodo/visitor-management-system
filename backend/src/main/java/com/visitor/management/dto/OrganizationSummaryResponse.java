package com.visitor.management.dto;

import java.time.Instant;

public record OrganizationSummaryResponse(
        long adminCount,
        long employeeCount,
        long departmentCount,
        long activeDepartmentCount,
        long totalVisitors,
        long activeVisitors,
        long pendingVisitors,
        long recentVisitorCount,
        Instant lastVisitorActivityAt,
        boolean publicDirectoryVisible
) {
}
