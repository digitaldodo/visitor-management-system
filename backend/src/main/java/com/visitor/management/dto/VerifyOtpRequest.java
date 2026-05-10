package com.visitor.management.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record VerifyOtpRequest(
        @NotBlank @Size(min = 3, max = 160) String identifier,
        @NotBlank @Pattern(regexp = "\\d{6}", message = "Verification code must be 6 digits.") String otp
) {
}
