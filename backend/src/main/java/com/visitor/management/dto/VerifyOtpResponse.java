package com.visitor.management.dto;

import java.time.Instant;

public record VerifyOtpResponse(
        String resetToken,
        Instant expiresAt
) {
}
