package com.visitor.management.dto;

import java.util.List;
import java.util.Map;

public record SecurityMonitoringResponse(
        Map<String, Long> counts,
        List<VisitorResponse> currentlyInside,
        List<VisitorResponse> overdueVisitors,
        List<VisitorResponse> checkedOutVisitors,
        List<VisitorResponse> rejectedVisitors,
        List<VisitorResponse> approvedVisitors,
        List<VisitorResponse> activeRecurringVisitors,
        List<VisitorResponse> expiredRecurringVisitors,
        List<VisitorResponse> suspendedVisitors,
        List<VisitorResponse> dailyAttendanceLogs
) {
}
