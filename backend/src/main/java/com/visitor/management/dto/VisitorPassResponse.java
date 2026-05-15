package com.visitor.management.dto;

import com.visitor.management.entity.VisitorStatus;
import com.visitor.management.entity.VisitorType;

import java.time.Instant;
import java.util.List;

public record VisitorPassResponse(
        String visitorId,
        String badgeId,
        String fullName,
        String companyName,
        String organizationName,
        String organizationCode,
        String organizationTimezone,
        String purposeOfVisit,
        VisitorType visitorType,
        String vendorCompanyName,
        String hostEmployee,
        String hostEmployeeDepartment,
        String sponsorEmployee,
        String department,
        Instant validityStartDate,
        Instant validityEndDate,
        String recurringSchedule,
        List<String> allowedWeekdays,
        String allowedEntryStartTime,
        String allowedEntryEndTime,
        String photoUrl,
        VisitorStatus status,
        String statusLabel,
        String checkInState,
        boolean valid,
        String validityStatus,
        String passCode,
        String qrPayload,
        String verificationUrl,
        String qrImageDataUri,
        Instant issuedAt,
        Instant expiresAt,
        Instant approvedAt,
        Instant scheduledStartTime,
        Instant scheduledEndTime,
        Instant accessWindowStartTime,
        Instant accessWindowEndTime,
        Long expectedDurationMinutes,
        Instant checkInTime,
        Instant checkOutTime,
        Instant badgePrintedAt
) {
}
