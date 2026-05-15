package com.visitor.management.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;

public record RescheduleRequest(
        @NotNull Instant scheduledStartTime,
        Instant scheduledEndTime,
        Long expectedDurationMinutes,
        @Size(max = 80) String timezone,
        @Size(max = 500) String note
) {
}
