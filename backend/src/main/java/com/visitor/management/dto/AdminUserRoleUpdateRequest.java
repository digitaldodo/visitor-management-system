package com.visitor.management.dto;

import com.visitor.management.entity.Role;
import jakarta.validation.constraints.NotNull;

public record AdminUserRoleUpdateRequest(
        @NotNull Role role
) {
}
