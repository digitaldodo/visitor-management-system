package com.visitor.management.dto;

import com.visitor.management.entity.Role;

import java.util.Set;

public record UserProfileResponse(
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
        String emergencyContact,
        String preferredLanguage,
        Boolean notificationEmailEnabled,
        Boolean notificationInAppEnabled,
        Boolean active,
        String accountStatus,
        String organizationId,
        String organizationName,
        String organizationCode,
        String organizationTimezone,
        String organizationRegionCountry,
        Set<Role> roles
) {
}
