package com.visitor.management.dto;

import java.time.Instant;

public record EmailVerificationStatusResponse(
        String email,
        boolean emailVerified,
        Instant verifiedAt
) {
}
