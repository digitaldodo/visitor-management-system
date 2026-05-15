package com.visitor.management.dto;

import com.visitor.management.validation.UsernamePolicy;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record SuperAdminCreateRequest(
        @NotBlank @Size(min = 1, max = 128) String currentPassword,
        @NotBlank @Size(min = 6, max = 12) String otp,
        @NotBlank @Size(min = 2, max = 120) String fullName,
        @NotBlank @Size(min = UsernamePolicy.MIN_LENGTH, max = UsernamePolicy.MAX_LENGTH, message = UsernamePolicy.LENGTH_MESSAGE) @Pattern(regexp = UsernamePolicy.USERNAME_REGEX, message = UsernamePolicy.INVALID_MESSAGE) String username,
        @Email @NotBlank @Size(max = 160) String email,
        @NotBlank @Size(min = 12, max = 128) String password,
        @Size(max = 6) String phoneCountryCode,
        @Size(max = 32) String phone
) {
}
