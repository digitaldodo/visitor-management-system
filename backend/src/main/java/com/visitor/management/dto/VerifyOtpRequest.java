package com.visitor.management.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record VerifyOtpRequest(
        @NotBlank @Size(min = 3, max = 160) String identifier,
        @NotBlank @Pattern(regexp = "\\d{6}", message = "OTP must be a 6-digit code.") String otp
) {
}
