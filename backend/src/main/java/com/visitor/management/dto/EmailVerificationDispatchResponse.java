package com.visitor.management.dto;

import com.visitor.management.entity.Role;

import java.time.Instant;
import java.util.Set;

public record EmailVerificationDispatchResponse(
        String email,
        boolean verificationRequired,
        Instant expiresAt,
        Instant sentAt,
        Instant resendAvailableAt,
        Set<Role> roles
) {
}
