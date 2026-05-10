package com.visitor.management.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record QrVerificationRequest(
        @NotBlank @Size(max = 4096) String qrPayload
) {
}
