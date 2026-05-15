package com.visitor.management.dto;

import com.visitor.management.entity.EmployeeAttendanceState;
import com.visitor.management.entity.EmployeeAttendanceStatus;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Set;

public record EmployeeAttendanceResponse(
        String id,
        String employeeUserId,
        String employeeId,
        String employeeName,
        String department,
        String designation,
        String employeeType,
        String organizationId,
        String organizationName,
        String organizationCode,
        String timezone,
        LocalDate attendanceDate,
        String shiftName,
        String shiftStartTime,
        String shiftEndTime,
        Integer gracePeriodMinutes,
        EmployeeAttendanceState state,
        EmployeeAttendanceStatus status,
        Set<EmployeeAttendanceStatus> flags,
        Instant checkInTime,
        Instant checkOutTime,
        Long workedMinutes,
        Long overtimeMinutes,
        boolean manualCheckIn,
        boolean manualCheckOut,
        String overrideReason,
        String securityGuardId,
        String securityGuardName,
        String lastAction,
        Instant createdAt,
        Instant updatedAt
) {
}
