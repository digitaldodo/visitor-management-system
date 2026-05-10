package com.visitor.management.dto;

import java.time.Instant;

public record ForgotPasswordResponse(
        boolean accepted,
        Instant expiresAt
) {
}
