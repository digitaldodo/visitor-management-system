package com.visitor.management.dto;

import com.visitor.management.entity.VisitorStatus;

import java.time.Instant;

public record QrVerificationResponse(
        boolean valid,
        boolean recognized,
        String resultCode,
        String headline,
        String message,
        String recommendedAction,
        String visitorId,
        String fullName,
        String companyName,
        String organizationName,
        String organizationCode,
        String organizationTimezone,
        String hostEmployee,
        String hostEmployeeDepartment,
        String photoUrl,
        VisitorStatus status,
        String statusLabel,
        String badgeId,
        String passCode,
        Instant issuedAt,
        Instant expiresAt,
        Instant scheduledStartTime,
        Instant scheduledEndTime,
        Instant checkInTime,
        Instant checkOutTime,
        boolean overdue,
        String validityStatus,
        boolean canCheckIn,
        boolean canCheckOut
) {
}
