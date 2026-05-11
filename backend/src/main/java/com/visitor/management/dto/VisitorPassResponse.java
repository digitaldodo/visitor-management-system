package com.visitor.management.dto;

import com.visitor.management.entity.VisitorStatus;

import java.time.Instant;

public record VisitorPassResponse(
        String visitorId,
        String badgeId,
        String fullName,
        String companyName,
        String organizationName,
        String organizationCode,
        String purposeOfVisit,
        String hostEmployee,
        String hostEmployeeDepartment,
        String photoUrl,
        VisitorStatus status,
        String statusLabel,
        String checkInState,
        boolean valid,
        String validityStatus,
        String passCode,
        String qrPayload,
        String qrImageDataUri,
        Instant issuedAt,
        Instant expiresAt,
        Instant approvedAt,
        Instant scheduledStartTime,
        Instant scheduledEndTime,
        Instant checkInTime,
        Instant checkOutTime,
        Instant badgePrintedAt
) {
}
