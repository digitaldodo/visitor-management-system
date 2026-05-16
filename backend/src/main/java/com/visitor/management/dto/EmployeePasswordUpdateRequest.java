package com.visitor.management.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record EmployeePasswordUpdateRequest(
        @NotBlank @Size(min = 1, max = 128) String currentPassword,
        @NotBlank @Size(min = 12, max = 128) String newPassword
) {
}
