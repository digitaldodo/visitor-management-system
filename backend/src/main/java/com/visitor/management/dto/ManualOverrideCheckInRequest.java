package com.visitor.management.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ManualOverrideCheckInRequest(
        @NotBlank @Size(min = 8, max = 1000) String reason
) {
}
