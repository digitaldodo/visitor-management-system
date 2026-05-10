package com.visitor.management.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;

public record PreApprovalRequest(
        @NotBlank @Size(min = 2, max = 120) String fullName,
        @NotBlank @Size(min = 7, max = 32) String phone,
        @Email @Size(max = 160) String email,
        @Size(max = 120) String companyName,
        @NotBlank @Size(min = 2, max = 160) String purposeOfVisit,
        @NotNull Instant scheduledStartTime,
        @NotNull Instant scheduledEndTime,
        @Size(max = 80) String timezone,
        @Size(max = 240) String note
) {
}
