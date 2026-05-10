package com.visitor.management.dto;

import com.visitor.management.entity.Role;

import java.time.Instant;
import java.util.Set;

public record AuthResponse(
        String accessToken,
        String refreshToken,
        String tokenType,
        Instant expiresAt,
        String userId,
        String email,
        String fullName,
        Set<Role> roles
) {
}
