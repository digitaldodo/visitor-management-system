package com.visitor.management.dto;

import com.visitor.management.entity.AccountStatus;

import java.util.Set;

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
        Set<String> workingDays,
        Integer gracePeriodMinutes,
        String overtimePolicy,
        boolean active,
        AccountStatus accountStatus,
        boolean currentlyIn
) {
}
