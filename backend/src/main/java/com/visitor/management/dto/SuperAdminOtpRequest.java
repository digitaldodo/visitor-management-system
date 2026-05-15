package com.visitor.management.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SuperAdminOtpRequest(
        @NotBlank @Size(min = 1, max = 128) String password
) {
}
