package com.visitor.management.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record EmergencyFlagRequest(
        @NotBlank @Size(min = 8, max = 1000) String note,
        @Size(max = 160) String checkpoint
) {
}
