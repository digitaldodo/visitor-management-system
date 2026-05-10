package com.visitor.management.dto;

import jakarta.validation.constraints.Size;

public record ApprovalDecisionRequest(
        @Size(max = 240) String note
) {
}
