package com.visitor.management.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record WorkforceRejectionRequest(
        @NotBlank @Size(min = 4, max = 240) String reason
) {
}
