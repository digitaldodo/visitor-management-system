package com.visitor.management.dto;

import com.visitor.management.entity.Role;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record AdminUserCreateRequest(
        @NotBlank @Size(min = 2, max = 120) String fullName,
        @NotBlank @Pattern(regexp = "^[A-Za-z0-9._-]{3,32}$", message = "Username must be 3-32 characters and use only letters, numbers, dots, underscores, or hyphens.") String username,
        @Email @NotBlank @Size(max = 160) String email,
        @NotBlank @Size(min = 12, max = 128) String password,
        @NotNull Role role,
        @Size(max = 80) String department,
        @Size(max = 32) String phone
) {
}
