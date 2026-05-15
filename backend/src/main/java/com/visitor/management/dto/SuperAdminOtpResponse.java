package com.visitor.management.dto;

import java.time.Instant;

public record SuperAdminOtpResponse(
        Instant expiresAt,
        int maxAttempts
) {
}
