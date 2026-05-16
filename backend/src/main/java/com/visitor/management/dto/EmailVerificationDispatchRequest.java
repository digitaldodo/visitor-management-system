package com.visitor.management.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Size;

public record EmailVerificationDispatchRequest(
        @Size(max = 160) String identifier,
        @Size(max = 160) String email
) {
    public String lookupIdentifier() {
        if (identifier != null && !identifier.isBlank()) {
            return identifier;
        }
        return email;
    }

    @AssertTrue(message = "Email or username is required.")
    public boolean hasLookupIdentifier() {
        return lookupIdentifier() != null && !lookupIdentifier().isBlank();
    }
}
