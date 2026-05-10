package com.visitor.management.dto;

import com.visitor.management.entity.VisitorStatus;

import java.time.Instant;

public record VisitorStatusHistoryResponse(
        VisitorStatus status,
        String action,
        String actorId,
        String note,
        Instant timestamp
) {
}
