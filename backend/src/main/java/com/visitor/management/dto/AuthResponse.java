package com.visitor.management.dto;

import com.visitor.management.entity.Role;

import java.time.Instant;
import java.util.Set;

public record AuthResponse(
        boolean success,
        String accessToken,
        String refreshToken,
        String tokenType,
        Instant expiresAt,
        AuthUserResponse user,
        String userId,
        String username,
        String email,
        String fullName,
        String organizationId,
        String organizationName,
        String organizationCode,
        String organizationTimezone,
        String organizationRegionCountry,
        Set<Role> roles
) {
    public AuthResponse(
            String accessToken,
            String refreshToken,
            String tokenType,
            Instant expiresAt,
            String userId,
            String username,
            String email,
            String fullName,
            String organizationId,
            String organizationName,
            String organizationCode,
            String organizationTimezone,
            String organizationRegionCountry,
            Set<Role> roles
    ) {
        this(
                true,
                accessToken,
                refreshToken,
                tokenType,
                expiresAt,
                new AuthUserResponse(
                        userId,
                        username,
                        email,
                        primaryRole(roles),
                        organizationCode,
                        organizationName,
                        organizationTimezone,
                        organizationRegionCountry,
                        fullName,
                        organizationId,
                        roles
                ),
                userId,
                username,
                email,
                fullName,
                organizationId,
                organizationName,
                organizationCode,
                organizationTimezone,
                organizationRegionCountry,
                roles
        );
    }

    private static String primaryRole(Set<Role> roles) {
        if (roles == null || roles.isEmpty()) {
            return null;
        }
        return roles.stream()
                .findFirst()
                .map(Role::name)
                .orElse(null);
    }
}
