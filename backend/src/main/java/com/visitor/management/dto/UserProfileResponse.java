package com.visitor.management.dto;

import com.visitor.management.entity.Role;

import java.util.Set;

public record UserProfileResponse(
        String id,
        String username,
        String email,
        String fullName,
        String department,
        String phone,
        String phoneCountryCode,
        String organizationId,
        String organizationName,
        String organizationCode,
        String organizationTimezone,
        String organizationRegionCountry,
        Set<Role> roles
) {
}
