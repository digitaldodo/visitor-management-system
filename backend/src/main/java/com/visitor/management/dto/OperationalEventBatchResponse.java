package com.visitor.management.dto;

import java.time.Instant;
import java.util.List;

public record OperationalEventBatchResponse(
        String cursor,
        Instant serverTime,
        boolean heartbeat,
        List<OperationalEventResponse> events
) {
}
