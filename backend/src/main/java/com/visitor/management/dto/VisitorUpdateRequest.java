package com.visitor.management.dto;

import com.visitor.management.entity.VisitorStatus;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;

public record VisitorUpdateRequest(
        @Size(min = 2, max = 120) String fullName,
        @Size(min = 7, max = 32) String phone,
        @Email @Size(max = 160) String email,
        @Size(max = 120) String companyName,
        @Size(min = 2, max = 160) String purposeOfVisit,
        @Size(max = 120) String hostEmployee,
        @Size(max = 80) String hostEmployeeId,
        @Size(max = 500) String photoUrl,
        VisitorStatus status
) {
}
