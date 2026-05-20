package com.visitor.management.dto;

import jakarta.validation.constraints.Size;

public record EmergencyPanicRequest(
        @Size(max = 160) String checkpoint,
        @Size(max = 500) String note,
        boolean deliberate
) {
}
