package com.visitor.management.dto;

import com.visitor.management.entity.VisitorStatus;

import java.time.Instant;

public record VisitorPassResponse(
        String visitorId,
        String fullName,
        String companyName,
        String purposeOfVisit,
        String hostEmployee,
        String photoUrl,
        VisitorStatus status,
        String passCode,
        String qrPayload,
        String qrImageDataUri,
        Instant issuedAt,
        Instant expiresAt,
        Instant approvedAt
) {
}
