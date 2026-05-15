package com.visitor.management.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record WorkforceOnboardingRequest(
        @Size(min = 2, max = 120) String fullName,
        @Size(min = 3, max = 32) @Pattern(regexp = "^[a-z0-9_]+$", message = "Username must use lowercase letters, numbers, or underscores.") String username,
        @Email @Size(max = 160) String email,
        @Size(max = 80) String department,
        @Size(max = 6) String phoneCountryCode,
        @Size(max = 32) String phone,
        @Size(max = 80) String designation,
        @Size(max = 40) String employeeType,
        @Size(max = 160) String employeePhotoUrl,
        @Size(max = 80) String shiftName,
        @Size(max = 5) String shiftStartTime,
        @Size(max = 5) String shiftEndTime
) {
}
