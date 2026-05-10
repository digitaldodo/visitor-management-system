package com.visitor.management.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AuthRequest(
        @Size(max = 160) String identifier,
        @Size(max = 160) String email,
        @Size(max = 24) String companyCode,
        @Size(max = 32) String portalAudience,
        @NotBlank @Size(min = 8, max = 128) String password
) {
    public String loginIdentifier() {
        if (identifier != null && !identifier.isBlank()) {
            return identifier;
        }
        return email;
    }

    @AssertTrue(message = "Username or email is required.")
    public boolean hasLoginIdentifier() {
        return loginIdentifier() != null && !loginIdentifier().isBlank();
    }
}
