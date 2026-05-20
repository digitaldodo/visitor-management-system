package com.visitor.management.dto;

import java.time.Instant;
import java.util.List;

public record EmployeeBadgeResponse(
        String employeeUserId,
        String employeeId,
        String fullName,
        String email,
        String department,
        String designation,
        String employeeType,
        String employeePhotoUrl,
        String organizationName,
        String organizationCode,
        String organizationTimezone,
        String shiftName,
        String shiftStartTime,
        String shiftEndTime,
        String qrPayload,
        String qrImageDataUri,
        Instant issuedAt,
        boolean active,
        String credentialStatus,
        String statusLabel,
        String qrMode,
        Instant qrExpiresAt,
        int qrRefreshIntervalSeconds,
        Instant serverTime,
        Instant lastValidatedAt,
        String staticFallbackPayload,
        String staticFallbackQrImageDataUri,
        String accessScope,
        String checkpointMarker,
        List<String> credentialHistory
) {
}
