package com.visitor.management.dto;

import com.visitor.management.entity.VisitorStatus;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import java.time.Instant;

public record SearchRequest(
        String query,
        @Min(0) int page,
        @Min(1) @Max(100) int size,
        String sortBy,
        String direction,
        VisitorStatus status,
        String hostEmployeeId,
        Instant from,
        Instant to
) {
    public SearchRequest {
        if (size == 0) {
            size = 20;
        }
        if (sortBy == null || sortBy.isBlank()) {
            sortBy = "createdAt";
        }
        if (direction == null || direction.isBlank()) {
            direction = "desc";
        }
    }
}
