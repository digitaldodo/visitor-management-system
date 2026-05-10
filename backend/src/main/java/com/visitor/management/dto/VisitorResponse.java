package com.visitor.management.dto;

import com.visitor.management.entity.VisitorStatus;

import java.time.Instant;

public record VisitorResponse(
        String id,
        String fullName,
        String phone,
        String email,
        String companyName,
        String purposeOfVisit,
        String hostEmployee,
        String photoUrl,
        String hostEmployeeId,
        Instant checkInTime,
        Instant checkOutTime,
        VisitorStatus status,
        String qrCode,
        Instant createdAt,
        Instant updatedAt
) {
}
