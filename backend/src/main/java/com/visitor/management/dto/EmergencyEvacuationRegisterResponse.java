package com.visitor.management.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public record EmergencyEvacuationRegisterResponse(
        Instant generatedAt,
        Map<String, Integer> counts,
        List<EmergencyEvacuationPersonResponse> visitorsInside,
        List<EmergencyEvacuationPersonResponse> workforceInside,
        List<EmergencyEvacuationPersonResponse> unaccounted
) {
}
