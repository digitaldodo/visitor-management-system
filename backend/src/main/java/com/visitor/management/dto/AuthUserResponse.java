package com.visitor.management.dto;

import com.visitor.management.entity.Role;

import java.util.Set;

public record AuthUserResponse(
        String id,
        String username,
        String email,
        String role,
        String organizationCode,
        String organizationName,
        String organizationTimezone,
        String organizationRegionCountry,
        String fullName,
        String organizationId,
        Set<Role> roles
) {
}
