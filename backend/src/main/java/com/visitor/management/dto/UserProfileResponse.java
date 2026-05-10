package com.visitor.management.dto;

import com.visitor.management.entity.Role;

import java.util.Set;

public record UserProfileResponse(
        String id,
        String email,
        String fullName,
        String department,
        String phone,
        Set<Role> roles
) {
}
