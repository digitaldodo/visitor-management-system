package com.visitor.management.dto;

import com.visitor.management.entity.VisitorStatus;

import java.time.Instant;

public record QrVerificationResponse(
        boolean valid,
        String message,
        String visitorId,
        String fullName,
        String companyName,
        String hostEmployee,
        VisitorStatus status,
        String passCode,
        Instant expiresAt
) {
}
