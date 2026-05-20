package com.visitor.management.dto;

import com.visitor.management.validation.UsernamePolicy;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record AccountProfileUpdateRequest(
        @Size(min = UsernamePolicy.MIN_LENGTH, max = UsernamePolicy.MAX_LENGTH, message = UsernamePolicy.LENGTH_MESSAGE)
        @Pattern(regexp = UsernamePolicy.USERNAME_REGEX, message = UsernamePolicy.INVALID_MESSAGE)
        String username,
        @Size(max = 6) String phoneCountryCode,
        @Size(max = 40) String phone,
        @Size(max = 160) String emergencyContact,
        @Size(max = 16) String preferredLanguage,
        @Size(max = 500) String employeePhotoUrl,
        Boolean notificationEmailEnabled,
        Boolean notificationInAppEnabled
) {
}
