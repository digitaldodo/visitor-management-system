package com.visitor.management.dto;

import com.visitor.management.entity.AccountStatus;
import com.visitor.management.entity.Role;

import java.time.Instant;
import java.util.Set;

public record AdminUserResponse(
        String id,
        String username,
        String email,
        String fullName,
        String department,
        String employeeId,
        String designation,
        String employeeType,
        String employeePhotoUrl,
        String shiftName,
        String shiftStartTime,
        String shiftEndTime,
        String phone,
        String phoneCountryCode,
        String organizationId,
        String organizationName,
        String organizationCode,
        String organizationTimezone,
        String organizationRegionCountry,
        Set<Role> roles,
        boolean active,
        AccountStatus accountStatus,
        Instant createdAt,
        Instant updatedAt
) {
}
