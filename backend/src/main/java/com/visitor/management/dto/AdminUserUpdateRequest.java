package com.visitor.management.dto;

import com.visitor.management.entity.AccountStatus;
import com.visitor.management.entity.Role;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;

public record AdminUserUpdateRequest(
        @Size(min = 2, max = 120) String fullName,
        @Email @Size(max = 160) String email,
        @Size(max = 6) String phoneCountryCode,
        @Size(max = 32) String phone,
        @Size(max = 80) String department,
        @Size(max = 80) String designation,
        Role role,
        AccountStatus accountStatus,
        Boolean active,
        @Size(max = 160) String employeePhotoUrl,
        @Size(max = 40) String employeeType,
        @Size(max = 80) String shiftName,
        @Size(max = 5) String shiftStartTime,
        @Size(max = 5) String shiftEndTime
) {
}
