package com.visitor.management.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record EmergencyLockdownRequest(
        @NotBlank @Size(min = 8, max = 500) String reason,
        @Size(max = 160) String scope,
        boolean confirmOperationalOnly
) {
}
