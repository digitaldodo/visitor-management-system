package com.visitor.management.dto;

import com.visitor.management.entity.AccountStatus;

public record EmployeeDirectoryResponse(
        String id,
        String employeeId,
        String fullName,
        String email,
        String department,
        String designation,
        String employeeType,
        String organizationId,
        String organizationName,
        String organizationCode,
        String shiftName,
        String shiftStartTime,
        String shiftEndTime,
        boolean active,
        AccountStatus accountStatus,
        boolean currentlyIn
) {
}
