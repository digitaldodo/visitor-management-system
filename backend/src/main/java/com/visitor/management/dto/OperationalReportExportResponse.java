package com.visitor.management.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public record OperationalReportExportResponse(
        String exportId,
        String reportType,
        String format,
        String title,
        String organizationId,
        String organizationName,
        String generatedBy,
        Instant generatedAt,
        List<Map<String, String>> columns,
        List<Map<String, Object>> rows,
        Map<String, Object> summary
) {
}
