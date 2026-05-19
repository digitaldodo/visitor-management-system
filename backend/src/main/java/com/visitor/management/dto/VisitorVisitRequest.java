package com.visitor.management.dto;

import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;

import java.time.Instant;

public record VisitorVisitRequest(
        @Size(max = 6) String phoneCountryCode,
        @Size(min = 7, max = 32) String phone,
        @Size(max = 120) String companyName,
        @Size(max = 24) String companyCode,
        @NotBlank @Size(min = 2, max = 160) String purposeOfVisit,
        @Size(max = 120) String hostEmployee,
        @Size(max = 80) String hostEmployeeId,
        Instant scheduledStartTime,
        Instant scheduledEndTime,
        Long expectedDurationMinutes,
        @Size(max = 80) String timezone,
        @NotBlank @Size(max = 500) String photoUrl,
        @NotBlank @Size(max = 255) String photoPublicId
) {
}
