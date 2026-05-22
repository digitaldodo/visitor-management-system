package com.visitor.management.dto;

import com.visitor.management.entity.NotificationStatus;
import com.visitor.management.entity.VisitorInviteStatus;
import com.visitor.management.entity.VisitorType;

import java.time.Instant;

public record VisitorInviteResponse(
        String id,
        String organizationId,
        String organizationName,
        String organizationCode,
        String organizationTimezone,
        String hostEmployeeId,
        String hostEmployeeName,
        String visitorName,
        String visitorEmail,
        String visitorPhone,
        String phoneCountryCode,
        String companyName,
        String purposeOfVisit,
        VisitorType visitorType,
        Instant scheduledStartTime,
        Instant scheduledEndTime,
        Long expectedDurationMinutes,
        String timezone,
        boolean approvalRequired,
        VisitorInviteStatus status,
        String inviteUrl,
        String mobileInviteUrl,
        String lifecycleStage,
        String lifecycleLabel,
        String nextAction,
        String note,
        NotificationStatus emailStatus,
        Instant emailSentAt,
        String lastEmailError,
        Instant expiresAt,
        Instant viewedAt,
        Instant registrationCompletedAt,
        Instant qrIssuedAt,
        Instant arrivedAt,
        Instant revokedAt,
        String revocationReason,
        String visitorId,
        VisitorPassResponse pass,
        Instant createdAt,
        Instant updatedAt
) {
}
