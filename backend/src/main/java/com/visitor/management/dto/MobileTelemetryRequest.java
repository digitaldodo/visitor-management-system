package com.visitor.management.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.Map;

public record MobileTelemetryRequest(
        @Valid @Size(max = 40) List<DiagnosticTelemetryEvent> diagnostics,
        @Valid @Size(max = 80) List<OperationalMetricTelemetry> metrics
) {
    public record DiagnosticTelemetryEvent(
            @Size(max = 80) String id,
            @Size(max = 40) String createdAt,
            @Size(max = 12) String level,
            @Size(max = 24) String scope,
            @Size(max = 80) String code,
            @Size(max = 240) String message,
            @Size(max = 20) Map<String, Object> context
    ) {
    }

    public record OperationalMetricTelemetry(
            @Size(max = 80) String id,
            @Size(max = 40) String name,
            double value,
            @Size(max = 40) String createdAt,
            @Size(max = 20) Map<String, Object> tags
    ) {
    }
}
