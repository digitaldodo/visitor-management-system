package com.visitor.management.dto;

import jakarta.validation.constraints.Size;

public record RescheduleDecisionRequest(
        @Size(max = 500) String note
) {
}
