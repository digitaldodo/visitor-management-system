package com.visitor.management.dto;

import java.time.Instant;

public record EmployeeBadgeResponse(
        String employeeUserId,
        String employeeId,
        String fullName,
        String email,
        String department,
        String designation,
        String employeeType,
        String employeePhotoUrl,
        String organizationName,
        String organizationCode,
        String organizationTimezone,
        String shiftName,
        String shiftStartTime,
        String shiftEndTime,
        String qrPayload,
        String qrImageDataUri,
        Instant issuedAt,
        boolean active
) {
}
