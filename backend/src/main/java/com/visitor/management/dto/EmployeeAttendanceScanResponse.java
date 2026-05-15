package com.visitor.management.dto;

public record EmployeeAttendanceScanResponse(
        boolean valid,
        String action,
        String headline,
        String message,
        String recommendedAction,
        boolean shiftEligible,
        boolean currentlyIn,
        EmployeeDirectoryResponse employee,
        EmployeeAttendanceResponse attendance
) {
}
