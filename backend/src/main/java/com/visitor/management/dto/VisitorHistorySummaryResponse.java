package com.visitor.management.dto;

import java.time.Instant;
import java.util.List;

public record VisitorHistorySummaryResponse(
        String fullName,
        String companyName,
        String organizationName,
        long totalVisits,
        long repeatVisits,
        long approvedVisits,
        long checkedInVisits,
        long checkedOutVisits,
        long rejectedVisits,
        long expiredVisits,
        Instant firstVisitAt,
        Instant lastVisitAt,
        List<String> previousHosts,
        List<VisitorResponse> records
) {
}
