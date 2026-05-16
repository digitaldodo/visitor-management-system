package com.visitor.management.dto;

import jakarta.validation.constraints.Size;

public record EmployeeProfileUpdateRequest(
        @Size(max = 6) String phoneCountryCode,
        @Size(max = 40) String phone,
        @Size(max = 160) String emergencyContact,
        @Size(max = 16) String preferredLanguage,
        @Size(max = 500) String employeePhotoUrl,
        Boolean notificationEmailEnabled,
        Boolean notificationInAppEnabled
) {
}
