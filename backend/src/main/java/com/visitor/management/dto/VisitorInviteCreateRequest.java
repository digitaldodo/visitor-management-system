package com.visitor.management.dto;

import com.visitor.management.entity.VisitorType;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;

public record VisitorInviteCreateRequest(
        @NotBlank @Size(min = 2, max = 120) String visitorName,
        @Email @Size(max = 160) String visitorEmail,
        @Size(max = 6) String phoneCountryCode,
        @Size(max = 32) String visitorPhone,
        @Size(max = 120) String companyName,
        @NotBlank @Size(min = 2, max = 160) String purposeOfVisit,
        VisitorType visitorType,
        @NotNull Instant scheduledStartTime,
        Instant scheduledEndTime,
        Long expectedDurationMinutes,
        @Size(max = 80) String timezone,
        Boolean approvalRequired,
        Long expiresInHours,
        @Size(max = 500) String note
) {
}
