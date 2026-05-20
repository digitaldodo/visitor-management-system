package com.visitor.management.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record VisitorInviteRevokeRequest(
        @NotBlank @Size(min = 4, max = 500) String reason
) {
}
