package com.visitor.management.dto;

import com.visitor.management.entity.VisitorStatus;
import com.visitor.management.entity.VisitorType;

import java.time.Instant;
import java.util.List;

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
        String badgeId,
        String passCode,
        Instant issuedAt,
        Instant expiresAt,
        Instant scheduledStartTime,
        Instant scheduledEndTime,
        Instant accessWindowStartTime,
        Instant accessWindowEndTime,
        Long expectedDurationMinutes,
        Instant checkInTime,
        Instant checkOutTime,
        boolean overdue,
        String validityStatus,
        boolean canCheckIn,
        boolean canCheckOut
) {
}
