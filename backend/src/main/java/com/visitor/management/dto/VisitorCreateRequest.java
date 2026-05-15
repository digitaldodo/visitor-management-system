package com.visitor.management.dto;

import com.visitor.management.entity.VisitorType;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;

public record VisitorCreateRequest(
        @NotBlank @Size(min = 2, max = 120) String fullName,
        @Size(max = 6) String phoneCountryCode,
        @NotBlank @Size(min = 7, max = 32) String phone,
        @Email @Size(max = 160) String email,
        @Size(max = 120) String companyName,
        @Size(max = 24) String companyCode,
        @NotBlank @Size(min = 2, max = 160) String purposeOfVisit,
        @Size(max = 120) String hostEmployee,
        @Size(max = 80) String hostEmployeeId,
        @NotBlank @Size(max = 500) String photoUrl,
        @NotBlank @Size(max = 255) String photoPublicId,
        Instant scheduledStartTime,
        Instant scheduledEndTime,
        Long expectedDurationMinutes,
        @Size(max = 80) String timezone,
        VisitorType visitorType,
        @Size(max = 120) String vendorCompanyName,
        @Size(max = 120) String sponsorEmployee,
        @Size(max = 120) String department,
        Instant validityStartDate,
        Instant validityEndDate,
        @Size(max = 120) String recurringSchedule,
        List<@Size(max = 16) String> allowedWeekdays,
        @Size(max = 8) String allowedEntryStartTime,
        @Size(max = 8) String allowedEntryEndTime,
        @Size(max = 160) String emergencyContact,
        @Size(max = 1000) String notes
) {
}
