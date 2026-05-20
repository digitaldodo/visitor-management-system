package com.visitor.management.dto;

import com.visitor.management.entity.EmergencyIncidentSeverity;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record EmergencyBroadcastRequest(
        @NotBlank @Size(min = 4, max = 120) String title,
        @NotBlank @Size(min = 8, max = 1000) String message,
        EmergencyIncidentSeverity severity,
        @Size(max = 160) String scope,
        boolean evacuation
) {
}
