package com.visitor.management.dto;

import jakarta.validation.constraints.Size;

public record DepartmentUpdateRequest(
        @Size(max = 80) String departmentName,
        Boolean activeStatus
) {
}
