package com.visitor.management.dto;

import com.visitor.management.entity.VisitorStatus;

import java.time.Instant;

public record QrVerificationResponse(
        boolean valid,
        String message,
        String visitorId,
        String fullName,
        String companyName,
        String organizationName,
        String organizationCode,
        String hostEmployee,
        String hostEmployeeDepartment,
        String photoUrl,
        VisitorStatus status,
        String passCode,
        Instant expiresAt,
        Instant scheduledEndTime,
        Instant checkInTime,
        Instant checkOutTime,
        boolean overdue,
        String validityStatus
) {
}
