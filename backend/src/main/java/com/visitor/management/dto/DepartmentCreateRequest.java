package com.visitor.management.dto;

import jakarta.validation.constraints.Size;

public record DepartmentCreateRequest(
        @Size(max = 80) String organizationId,
        @Size(max = 80) String departmentName
) {
}
