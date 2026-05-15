package com.visitor.management.dto;

import com.visitor.management.entity.Role;
import com.visitor.management.validation.UsernamePolicy;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record AdminUserCreateRequest(
        @NotBlank @Size(min = 2, max = 120) String fullName,
        @NotBlank @Size(min = UsernamePolicy.MIN_LENGTH, max = UsernamePolicy.MAX_LENGTH, message = UsernamePolicy.LENGTH_MESSAGE) @Pattern(regexp = UsernamePolicy.USERNAME_REGEX, message = UsernamePolicy.INVALID_MESSAGE) String username,
        @Email @NotBlank @Size(max = 160) String email,
        @NotBlank @Size(min = 12, max = 128) String password,
        @NotNull Role role,
        @Size(max = 80) String organizationId,
        @Size(max = 24) String companyCode,
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
