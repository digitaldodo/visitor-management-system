package com.visitor.management.dto;

import com.visitor.management.entity.VisitorStatus;

import java.time.Instant;
import java.util.List;

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
        Instant scheduledStartTime,
        Instant scheduledEndTime,
        String scheduledTimezone,
        Instant approvalExpiresAt,
        boolean preApproved,
        VisitorStatus status,
        String qrCode,
        Instant qrIssuedAt,
        Instant qrExpiresAt,
        Instant badgePrintedAt,
        Instant approvedAt,
        Instant rejectedAt,
        String approvedBy,
        String rejectedBy,
        String rejectionReason,
        List<VisitorStatusHistoryResponse> statusHistory,
        Instant createdAt,
        Instant updatedAt
) {
}
