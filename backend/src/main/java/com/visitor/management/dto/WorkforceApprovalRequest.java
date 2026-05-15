package com.visitor.management.dto;

import jakarta.validation.constraints.Size;

public record WorkforceApprovalRequest(
        @Size(max = 80) String department,
        @Size(max = 80) String designation,
        @Size(max = 40) String employeeType,
        @Size(max = 160) String employeePhotoUrl,
        @Size(max = 80) String shiftName,
        @Size(max = 5) String shiftStartTime,
        @Size(max = 5) String shiftEndTime,
        @Size(max = 240) String note
) {
}
