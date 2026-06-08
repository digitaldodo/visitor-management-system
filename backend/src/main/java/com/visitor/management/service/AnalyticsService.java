package com.visitor.management.service;

import com.mongodb.client.MongoCollection;
import com.visitor.management.entity.Role;
import com.visitor.management.entity.User;
import com.visitor.management.entity.VisitorStatus;
import com.visitor.management.repository.OrganizationRepository;
import com.visitor.management.repository.UserRepository;
import org.bson.Document;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;

@Service
public class AnalyticsService {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsService.class);
    private static final String VISITORS_COLLECTION = "visitors";
    private static final String ATTENDANCE_COLLECTION = "employee_attendance_logs";
    private static final String ACCESS_AUDIT_COLLECTION = "access_audit_logs";
    private static final Set<String> INCIDENT_ACTIONS = Set.of(
            "DENIED_AT_GATE",
            "SECURITY_ESCALATED",
            "IDENTITY_MISMATCH_REPORTED",
            "SECURITY_MANUAL_OVERRIDE",
            "SUSPENDED",
            "MANUAL_CHECK_IN",
            "MANUAL_CHECK_OUT"
    );

    private final MongoTemplate mongoTemplate;
    private final UserRepository userRepository;
    private final OrganizationRepository organizationRepository;

    public AnalyticsService(MongoTemplate mongoTemplate, UserRepository userRepository, OrganizationRepository organizationRepository) {
        this.mongoTemplate = mongoTemplate;
        this.userRepository = userRepository;
        this.organizationRepository = organizationRepository;
    }

    @Cacheable("adminAnalytics")
    public Map<String, Object> adminDashboard() {
        return adminDashboard(null);
    }

    public Map<String, Object> adminDashboard(String actorId) {
        AnalyticsScope scopeContext = analyticsScope(actorId);
        String organizationId = scopeContext.organizationId();
        ZoneId timezone = scopeContext.zoneId();
        Instant todayStart = LocalDate.now(timezone).atStartOfDay(timezone).toInstant();
        Instant todayEnd = LocalDate.now(timezone).plusDays(1).atStartOfDay(timezone).toInstant();
        Document scope = scopeFilter(organizationId);

        long totalVisitors = safeLong("visitor.widgets.totalVisitors", () -> count(scope));
        long activeVisitors = safeLong("visitor.widgets.activeVisitors", () -> count(withScope(statusFilter(VisitorStatus.CHECKED_IN), organizationId)));
        long pendingApprovals = safeLong("visitor.widgets.pendingApprovals", () -> count(withScope(statusFilter(VisitorStatus.PENDING), organizationId)));
        long todayCheckIns = safeLong("visitor.widgets.todayCheckIns", () -> count(withScope(dateRangeFilter("checkInTime", todayStart, todayEnd), organizationId)));
        long rejectedVisitors = safeLong("visitor.widgets.rejectedVisitors", () -> count(withScope(statusFilter(VisitorStatus.REJECTED), organizationId)));
        long todayCheckOuts = safeLong("visitor.widgets.todayCheckOuts", () -> count(withScope(dateRangeFilter("checkOutTime", todayStart, todayEnd), organizationId)));
        long overdueVisitors = safeLong("visitor.widgets.overdueVisitors", () -> count(withScope(overdueVisitorFilter(Instant.now()), organizationId)));
        long expiringSoon = safeLong("visitor.widgets.expiringSoon", () -> count(withScope(expiringSoonVisitorFilter(Instant.now(), Instant.now().plusSeconds(30 * 60)), organizationId)));
        long workforceInside = safeLong("workforce.widgets.inside", () -> attendanceCount(withAttendanceScope(new Document("state", new Document("$in", List.of("IN", "INSIDE", "CHECKED_IN"))), organizationId)));
        long incidentSignals = safeLong("security.widgets.incidents", () -> auditCount(withAuditScope(new Document("action", new Document("$in", INCIDENT_ACTIONS.stream().toList())), organizationId)));
        long activeOrganizations = organizationId == null
                ? safeLong("organization.metrics.activeOrganizations", organizationRepository::countByActiveStatusTrue)
                : 1L;

        List<Map<String, Object>> widgets = List.of(
                widget("Total visitor records", totalVisitors, "Organization access history"),
                widget("Visitors inside", activeVisitors, "Currently checked in"),
                widget("Workforce inside", workforceInside, "Active employee presence"),
                widget("Denied entries", rejectedVisitors, "Rejected or gate-denied visitors"),
                widget("Security incidents", incidentSignals, "Escalations, invalid use, and overrides"),
                widget("Overdue visitors", overdueVisitors, "Inside beyond expected window")
        );

        return Map.ofEntries(
                Map.entry("timezone", timezone.getId()),
                Map.entry("metrics", Map.ofEntries(
                        Map.entry("activeOrganizations", activeOrganizations),
                        Map.entry("activeVisitors", activeVisitors),
                        Map.entry("totalVisitors", totalVisitors),
                        Map.entry("pendingApprovals", pendingApprovals),
                        Map.entry("todayCheckIns", todayCheckIns),
                        Map.entry("todayCheckOuts", todayCheckOuts),
                        Map.entry("rejectedVisitors", rejectedVisitors),
                        Map.entry("overdueVisitors", overdueVisitors),
                        Map.entry("expiringSoon", expiringSoon),
                        Map.entry("workforceInside", workforceInside),
                        Map.entry("securityIncidents", incidentSignals)
                )),
                Map.entry("organizations", List.of()),
                Map.entry("visitors", List.of()),
                Map.entry("workforce", List.of()),
                Map.entry("alerts", List.of()),
                Map.entry("widgets", widgets),
                Map.entry("employeeAnalytics", safeList("employeeAnalytics", () -> employeeAnalytics(organizationId))),
                Map.entry("dailyVisitors", safeList("dailyVisitors", () -> dailyVisitors(organizationId, timezone))),
                Map.entry("monthlyTrends", safeList("monthlyTrends", () -> monthlyTrends(organizationId, timezone))),
                Map.entry("peakHours", safeList("peakHours", () -> peakHours(organizationId, timezone))),
                Map.entry("visitorFlow", safeList("visitorFlow", () -> visitorFlow(organizationId, timezone))),
                Map.entry("staffingInsights", safeList("staffingInsights", () -> staffingInsights(organizationId, timezone))),
                Map.entry("approvalWorkload", safeList("approvalWorkload", () -> approvalWorkload(organizationId, timezone))),
                Map.entry("checkInTrends", safeList("checkInTrends", () -> checkInTrends(organizationId, timezone))),
                Map.entry("approvalRates", safeList("approvalRates", () -> approvalRates(organizationId))),
                Map.entry("trafficHeatmap", safeList("trafficHeatmap", () -> hourlyHeatmap("checkInTime", organizationId, timezone))),
                Map.entry("checkInHours", safeList("checkInHours", () -> hourlySeries("checkInTime", organizationId, timezone))),
                Map.entry("checkOutHours", safeList("checkOutHours", () -> hourlySeries("checkOutTime", organizationId, timezone))),
                Map.entry("workforceRushHours", safeList("workforceRushHours", () -> attendanceHourlySeries("checkInTime", organizationId, timezone))),
                Map.entry("weeklyPatterns", safeList("weeklyPatterns", () -> weeklyPatterns(organizationId, timezone))),
                Map.entry("dailyPatterns", safeList("dailyPatterns", () -> dailyVisitors(organizationId, timezone))),
                Map.entry("repeatVisitors", safeList("repeatVisitors", () -> repeatVisitors(organizationId))),
                Map.entry("repeatOrganizations", safeList("repeatOrganizations", () -> repeatOrganizations(organizationId))),
                Map.entry("repeatDeniedVisitors", safeList("repeatDeniedVisitors", () -> repeatDeniedVisitors(organizationId))),
                Map.entry("denialTrends", safeList("denialTrends", () -> denialTrends(organizationId, timezone))),
                Map.entry("denialReasons", safeList("denialReasons", () -> denialReasons(organizationId))),
                Map.entry("denialAttempts", safeList("denialAttempts", () -> denialAttempts(organizationId))),
                Map.entry("securityIncidents", safeList("securityIncidents", () -> securityIncidents(organizationId, timezone))),
                Map.entry("incidentTrends", safeList("incidentTrends", () -> incidentTrends(organizationId, timezone))),
                Map.entry("workforceAnomalies", safeList("workforceAnomalies", () -> workforceAnomalies(organizationId, timezone))),
                Map.entry("liveOperations", safeList("liveOperations", () -> liveOperations(organizationId, timezone))),
                Map.entry("organizationBreakdown", safeList("organizationBreakdown", () -> organizationBreakdown(organizationId))),
                Map.entry("departmentBreakdown", safeList("departmentBreakdown", () -> departmentBreakdown(organizationId))),
                Map.entry("visitorCategoryBreakdown", safeList("visitorCategoryBreakdown", () -> visitorCategoryBreakdown(organizationId))),
                Map.entry("checkpointActivity", safeList("checkpointActivity", () -> checkpointActivity(organizationId, timezone))),
                Map.entry("operationalInsights", safeList("operationalInsights", () -> operationalInsights(organizationId, timezone))),
                Map.entry("exportSnapshots", safeList("exportSnapshots", () -> exportSnapshots(organizationId, timezone)))
        );
    }

    private List<Map<String, Object>> dailyVisitors(String organizationId, ZoneId timezone) {
        LocalDate startDate = LocalDate.now(timezone).minusDays(13);
        Instant start = startDate.atStartOfDay(timezone).toInstant();
        Map<String, Long> counts = aggregateCounts(List.of(
                new Document("$match", withScope(dateRangeFilter("checkInTime", start, null), organizationId)),
                new Document("$group", new Document("_id", dateString("$checkInTime", "%Y-%m-%d", timezone)).append("count", new Document("$sum", 1))),
                new Document("$sort", new Document("_id", 1))
        ));

        List<Map<String, Object>> series = new ArrayList<>();
        for (int index = 0; index < 14; index++) {
            LocalDate day = startDate.plusDays(index);
            String key = day.toString();
            series.add(point(key.substring(5), counts.getOrDefault(key, 0L), key, null));
        }
        return series;
    }

    private List<Map<String, Object>> monthlyTrends(String organizationId, ZoneId timezone) {
        YearMonth startMonth = YearMonth.now(timezone).minusMonths(11);
        Instant start = startMonth.atDay(1).atStartOfDay(timezone).toInstant();
        Map<String, Long> counts = aggregateCounts(List.of(
                new Document("$match", withScope(dateRangeFilter("createdAt", start, null), organizationId)),
                new Document("$group", new Document("_id", dateString("$createdAt", "%Y-%m", timezone)).append("count", new Document("$sum", 1))),
                new Document("$sort", new Document("_id", 1))
        ));

        List<Map<String, Object>> series = new ArrayList<>();
        for (int index = 0; index < 12; index++) {
            YearMonth month = startMonth.plusMonths(index);
            String key = month.toString();
            series.add(point(month.getMonth().name().substring(0, 3), counts.getOrDefault(key, 0L), month.atDay(1).toString(), null));
        }
        return series;
    }

    private List<Map<String, Object>> peakHours(String organizationId, ZoneId timezone) {
        Instant start = LocalDate.now(timezone).minusDays(29).atStartOfDay(timezone).toInstant();
        Map<String, Long> counts = aggregateCounts(List.of(
                new Document("$match", withScope(dateRangeFilter("checkInTime", start, null), organizationId)),
                new Document("$group", new Document("_id", dateString("$checkInTime", "%H", timezone)).append("count", new Document("$sum", 1))),
                new Document("$sort", new Document("_id", 1))
        ));

        List<Map<String, Object>> series = new ArrayList<>();
        for (int hour = 0; hour < 24; hour++) {
            String key = String.format("%02d", hour);
            series.add(point(key + ":00", counts.getOrDefault(key, 0L), null, key + ":00"));
        }
        return series;
    }

    private List<Map<String, Object>> visitorFlow(String organizationId, ZoneId timezone) {
        Instant start = LocalDate.now(timezone).minusDays(29).atStartOfDay(timezone).toInstant();
        Map<String, Long> scheduled = aggregateCounts(List.of(
                new Document("$match", withScope(dateRangeFilter("scheduledStartTime", start, null), organizationId)),
                new Document("$group", new Document("_id", dateString("$scheduledStartTime", "%H", timezone)).append("count", new Document("$sum", 1))),
                new Document("$sort", new Document("_id", 1))
        ));
        List<Map<String, Object>> series = new ArrayList<>();
        for (int hour = 0; hour < 24; hour++) {
            String key = String.format("%02d", hour);
            series.add(point(key + ":00", scheduled.getOrDefault(key, 0L), null, key + ":00"));
        }
        return series;
    }

    private List<Map<String, Object>> staffingInsights(String organizationId, ZoneId timezone) {
        List<Map<String, Object>> peak = peakHours(organizationId, timezone);
        return peak.stream()
                .sorted((left, right) -> Long.compare(asLong(right.get("value")), asLong(left.get("value"))))
                .limit(4)
                .map(point -> Map.of(
                        "label", point.get("label"),
                        "value", point.get("value"),
                        "note", asLong(point.get("value")) > 0 ? "Consider front-desk coverage" : "No check-in demand recorded"
                ))
                .toList();
    }

    private List<Map<String, Object>> approvalWorkload(String organizationId, ZoneId timezone) {
        Instant start = LocalDate.now(timezone).minusDays(6).atStartOfDay(timezone).toInstant();
        Map<String, Long> counts = aggregateCounts(List.of(
                new Document("$match", withScope(dateRangeFilter("createdAt", start, null), organizationId)),
                new Document("$group", new Document("_id", dateString("$createdAt", "%Y-%m-%d", timezone)).append("count", new Document("$sum", 1))),
                new Document("$sort", new Document("_id", 1))
        ));
        List<Map<String, Object>> series = new ArrayList<>();
        for (int index = 0; index < 7; index++) {
            LocalDate day = LocalDate.now(timezone).minusDays(6 - index);
            series.add(point(day.getDayOfWeek().name().substring(0, 3), counts.getOrDefault(day.toString(), 0L), day.toString(), null));
        }
        return series;
    }

    private List<Map<String, Object>> checkInTrends(String organizationId, ZoneId timezone) {
        return dailyVisitors(organizationId, timezone);
    }

    private List<Map<String, Object>> approvalRates(String organizationId) {
        Map<String, Long> counts = aggregateCounts(List.of(
                new Document("$match", withScope(new Document("status", new Document("$in", List.of(
                        VisitorStatus.APPROVED.name(),
                        VisitorStatus.CHECKED_IN.name(),
                        VisitorStatus.CHECKED_OUT.name(),
                        VisitorStatus.REJECTED.name(),
                        VisitorStatus.PENDING.name(),
                        VisitorStatus.EXPIRED.name()
                ))), organizationId)),
                new Document("$group", new Document("_id", "$status").append("count", new Document("$sum", 1))),
                new Document("$sort", new Document("_id", 1))
        ));

        long approved = counts.getOrDefault(VisitorStatus.APPROVED.name(), 0L)
                + counts.getOrDefault(VisitorStatus.CHECKED_IN.name(), 0L)
                + counts.getOrDefault(VisitorStatus.CHECKED_OUT.name(), 0L);
        long rejected = counts.getOrDefault(VisitorStatus.REJECTED.name(), 0L);
        long pending = counts.getOrDefault(VisitorStatus.PENDING.name(), 0L);
        long expired = counts.getOrDefault(VisitorStatus.EXPIRED.name(), 0L);
        long total = Math.max(approved + rejected + pending + expired, 1L);

        return List.of(
                rate("Approved", approved, total),
                rate("Rejected", rejected, total),
                rate("Pending", pending, total),
                rate("Expired", expired, total)
        );
    }

    private List<Map<String, Object>> employeeAnalytics(String organizationId) {
        List<Map<String, Object>> rows = new ArrayList<>();
        List<Document> pipeline = new ArrayList<>();
        if (organizationId != null) {
            pipeline.add(new Document("$match", new Document("organizationId", organizationId)));
        }
        pipeline.addAll(List.of(
                new Document("$group", new Document("_id", new Document("id", "$hostEmployeeId").append("name", "$hostEmployee"))
                        .append("total", new Document("$sum", 1))
                        .append("active", new Document("$sum", conditionalStatus(VisitorStatus.CHECKED_IN)))
                        .append("pending", new Document("$sum", conditionalStatus(VisitorStatus.PENDING)))
                        .append("rejected", new Document("$sum", conditionalStatus(VisitorStatus.REJECTED)))),
                new Document("$sort", new Document("total", -1)),
                new Document("$limit", 8)
        ));
        for (Document document : collection().aggregate(pipeline)) {
            Document id = document.get("_id", Document.class);
            String name = id == null ? "Unassigned" : firstPresent(id.get("name"), id.get("id"));
            rows.add(Map.of(
                    "employee", name == null || name.isBlank() ? "Unassigned" : name,
                    "total", number(document, "total"),
                    "active", number(document, "active"),
                    "pending", number(document, "pending"),
                    "rejected", number(document, "rejected")
            ));
        }
        return rows;
    }

    private List<Map<String, Object>> hourlySeries(String field, String organizationId, ZoneId timezone) {
        Instant start = LocalDate.now(timezone).minusDays(29).atStartOfDay(timezone).toInstant();
        Map<String, Long> counts = aggregateCounts(List.of(
                new Document("$match", withScope(dateRangeFilter(field, start, null), organizationId)),
                new Document("$group", new Document("_id", dateString("$" + field, "%H", timezone)).append("count", new Document("$sum", 1))),
                new Document("$sort", new Document("_id", 1))
        ));

        List<Map<String, Object>> series = new ArrayList<>();
        for (int hour = 0; hour < 24; hour++) {
            String key = String.format("%02d", hour);
            series.add(point(key + ":00", counts.getOrDefault(key, 0L), null, key + ":00"));
        }
        return series;
    }

    private List<Map<String, Object>> attendanceHourlySeries(String field, String organizationId, ZoneId timezone) {
        Instant start = LocalDate.now(timezone).minusDays(29).atStartOfDay(timezone).toInstant();
        Map<String, Long> counts = aggregateCounts(ATTENDANCE_COLLECTION, List.of(
                new Document("$match", withAttendanceScope(dateRangeFilter(field, start, null), organizationId)),
                new Document("$group", new Document("_id", dateString("$" + field, "%H", timezone)).append("count", new Document("$sum", 1))),
                new Document("$sort", new Document("_id", 1))
        ));

        List<Map<String, Object>> series = new ArrayList<>();
        for (int hour = 0; hour < 24; hour++) {
            String key = String.format("%02d", hour);
            series.add(point(key + ":00", counts.getOrDefault(key, 0L), null, key + ":00"));
        }
        return series;
    }

    private List<Map<String, Object>> hourlyHeatmap(String field, String organizationId, ZoneId timezone) {
        LocalDate startDate = LocalDate.now(timezone).minusDays(6);
        Instant start = startDate.atStartOfDay(timezone).toInstant();
        Map<String, Long> counts = aggregateCounts(List.of(
                new Document("$match", withScope(dateRangeFilter(field, start, null), organizationId)),
                new Document("$group", new Document("_id", dateString("$" + field, "%Y-%m-%d %H", timezone)).append("count", new Document("$sum", 1))),
                new Document("$sort", new Document("_id", 1))
        ));

        List<Map<String, Object>> rows = new ArrayList<>();
        for (int dayIndex = 0; dayIndex < 7; dayIndex++) {
            LocalDate day = startDate.plusDays(dayIndex);
            List<Map<String, Object>> hours = new ArrayList<>();
            for (int hour = 0; hour < 24; hour++) {
                String key = "%s %02d".formatted(day, hour);
                hours.add(Map.of(
                        "hour", "%02d:00".formatted(hour),
                        "value", counts.getOrDefault(key, 0L)
                ));
            }
            rows.add(Map.of(
                    "label", day.getDayOfWeek().name().substring(0, 3),
                    "date", day.toString(),
                    "hours", hours
            ));
        }
        return rows;
    }

    private List<Map<String, Object>> weeklyPatterns(String organizationId, ZoneId timezone) {
        LocalDate startDate = LocalDate.now(timezone).minusWeeks(7).with(java.time.DayOfWeek.MONDAY);
        Instant start = startDate.atStartOfDay(timezone).toInstant();
        Map<String, Long> counts = aggregateCounts(List.of(
                new Document("$match", withScope(dateRangeFilter("checkInTime", start, null), organizationId)),
                new Document("$group", new Document("_id", dateString("$checkInTime", "%Y-%U", timezone)).append("count", new Document("$sum", 1))),
                new Document("$sort", new Document("_id", 1))
        ));

        List<Map<String, Object>> series = new ArrayList<>();
        for (int index = 0; index < 8; index++) {
            LocalDate weekStart = startDate.plusWeeks(index);
            String key = weekStart.getYear() + "-" + String.format("%02d", weekStart.get(java.time.temporal.WeekFields.SUNDAY_START.weekOfYear()) - 1);
            series.add(point("W" + weekStart.get(java.time.temporal.WeekFields.ISO.weekOfWeekBasedYear()), counts.getOrDefault(key, 0L), weekStart.toString(), null));
        }
        return series;
    }

    private List<Map<String, Object>> repeatVisitors(String organizationId) {
        return aggregateRows(List.of(
                new Document("$match", withScope(new Document("createdAt", new Document("$type", "date")
                        .append("$gte", Date.from(Instant.now().minusSeconds(180L * 24 * 60 * 60)))), organizationId)),
                new Document("$group", new Document("_id", new Document("email", "$email").append("phone", "$phone").append("name", "$fullName"))
                        .append("visitor", new Document("$first", "$fullName"))
                        .append("organization", new Document("$first", new Document("$ifNull", List.of("$companyName", "$organizationName"))))
                        .append("visits", new Document("$sum", 1))
                        .append("firstSeen", new Document("$min", "$createdAt"))
                        .append("lastSeen", new Document("$max", "$createdAt"))
                        .append("denied", new Document("$sum", conditionalStatus(VisitorStatus.REJECTED)))
                        .append("hosts", new Document("$addToSet", "$hostEmployee"))),
                new Document("$match", new Document("visits", new Document("$gte", 2))),
                new Document("$sort", new Document("visits", -1).append("lastSeen", -1)),
                new Document("$limit", 10),
                new Document("$project", new Document("_id", 0)
                        .append("label", new Document("$ifNull", List.of("$visitor", "Unnamed visitor")))
                        .append("organization", new Document("$ifNull", List.of("$organization", "Unknown organization")))
                        .append("value", "$visits")
                        .append("denied", "$denied")
                        .append("firstSeen", "$firstSeen")
                        .append("lastSeen", "$lastSeen")
                        .append("hosts", "$hosts"))
        ));
    }

    private List<Map<String, Object>> repeatOrganizations(String organizationId) {
        return aggregateRows(List.of(
                new Document("$match", withScope(new Document(), organizationId)),
                new Document("$group", new Document("_id", new Document("$ifNull", List.of("$vendorCompanyName", new Document("$ifNull", List.of("$companyName", "$organizationName")))))
                        .append("value", new Document("$sum", 1))
                        .append("active", new Document("$sum", conditionalStatus(VisitorStatus.CHECKED_IN)))
                        .append("denied", new Document("$sum", conditionalStatus(VisitorStatus.REJECTED)))
                        .append("latest", new Document("$max", "$createdAt"))),
                new Document("$match", new Document("_id", new Document("$ne", null)).append("value", new Document("$gte", 2))),
                new Document("$sort", new Document("value", -1).append("latest", -1)),
                new Document("$limit", 10),
                new Document("$project", new Document("_id", 0)
                        .append("label", "$_id")
                        .append("value", "$value")
                        .append("active", "$active")
                        .append("denied", "$denied")
                        .append("latest", "$latest"))
        ));
    }

    private List<Map<String, Object>> repeatDeniedVisitors(String organizationId) {
        return aggregateRows(List.of(
                new Document("$match", withScope(new Document("status", VisitorStatus.REJECTED.name()), organizationId)),
                new Document("$group", new Document("_id", new Document("email", "$email").append("phone", "$phone").append("name", "$fullName"))
                        .append("label", new Document("$first", "$fullName"))
                        .append("value", new Document("$sum", 1))
                        .append("reason", new Document("$last", "$rejectionReason"))
                        .append("lastDenied", new Document("$max", "$rejectedAt"))),
                new Document("$match", new Document("value", new Document("$gte", 2))),
                new Document("$sort", new Document("value", -1).append("lastDenied", -1)),
                new Document("$limit", 8),
                new Document("$project", new Document("_id", 0)
                        .append("label", new Document("$ifNull", List.of("$label", "Unnamed visitor")))
                        .append("value", "$value")
                        .append("reason", new Document("$ifNull", List.of("$reason", "Reason unavailable")))
                        .append("lastDenied", "$lastDenied"))
        ));
    }

    private List<Map<String, Object>> denialTrends(String organizationId, ZoneId timezone) {
        LocalDate startDate = LocalDate.now(timezone).minusDays(13);
        Instant start = startDate.atStartOfDay(timezone).toInstant();
        Map<String, Long> counts = aggregateCounts(List.of(
                new Document("$match", withScope(new Document("status", VisitorStatus.REJECTED.name())
                        .append("rejectedAt", new Document("$type", "date").append("$gte", Date.from(start))), organizationId)),
                new Document("$group", new Document("_id", dateString("$rejectedAt", "%Y-%m-%d", timezone)).append("count", new Document("$sum", 1))),
                new Document("$sort", new Document("_id", 1))
        ));
        List<Map<String, Object>> series = new ArrayList<>();
        for (int index = 0; index < 14; index++) {
            LocalDate day = startDate.plusDays(index);
            series.add(point(day.toString().substring(5), counts.getOrDefault(day.toString(), 0L), day.toString(), null));
        }
        return series;
    }

    private List<Map<String, Object>> denialReasons(String organizationId) {
        return aggregateRows(List.of(
                new Document("$match", withScope(new Document("status", VisitorStatus.REJECTED.name()), organizationId)),
                new Document("$group", new Document("_id", new Document("$ifNull", List.of("$rejectionReason", "Reason unavailable")))
                        .append("value", new Document("$sum", 1))),
                new Document("$sort", new Document("value", -1)),
                new Document("$limit", 8),
                new Document("$project", new Document("_id", 0).append("label", "$_id").append("value", "$value"))
        ));
    }

    private List<Map<String, Object>> denialAttempts(String organizationId) {
        return aggregateRows(List.of(
                new Document("$match", withAuditScope(new Document("action", "DENIED_AT_GATE"), organizationId)),
                new Document("$group", new Document("_id", new Document("$ifNull", List.of("$targetName", "Unknown visitor")))
                        .append("value", new Document("$sum", 1))
                        .append("lastAttempt", new Document("$max", "$createdAt"))
                        .append("detail", new Document("$last", "$details"))),
                new Document("$sort", new Document("value", -1).append("lastAttempt", -1)),
                new Document("$limit", 8),
                new Document("$project", new Document("_id", 0)
                        .append("label", "$_id")
                        .append("value", "$value")
                        .append("lastAttempt", "$lastAttempt")
                        .append("detail", "$detail"))
        ), ACCESS_AUDIT_COLLECTION);
    }

    private List<Map<String, Object>> securityIncidents(String organizationId, ZoneId timezone) {
        Instant start = LocalDate.now(timezone).minusDays(29).atStartOfDay(timezone).toInstant();
        return aggregateRows(List.of(
                new Document("$match", withAuditScope(new Document("action", new Document("$in", INCIDENT_ACTIONS.stream().toList()))
                        .append("createdAt", new Document("$type", "date").append("$gte", Date.from(start))), organizationId)),
                new Document("$sort", new Document("createdAt", -1)),
                new Document("$limit", 12),
                new Document("$project", new Document("_id", 0)
                        .append("label", "$action")
                        .append("value", "$outcome")
                        .append("target", "$targetName")
                        .append("detail", "$details")
                        .append("createdAt", "$createdAt"))
        ), ACCESS_AUDIT_COLLECTION);
    }

    private List<Map<String, Object>> incidentTrends(String organizationId, ZoneId timezone) {
        LocalDate startDate = LocalDate.now(timezone).minusDays(13);
        Instant start = startDate.atStartOfDay(timezone).toInstant();
        Map<String, Long> counts = aggregateCounts(ACCESS_AUDIT_COLLECTION, List.of(
                new Document("$match", withAuditScope(new Document("action", new Document("$in", INCIDENT_ACTIONS.stream().toList()))
                        .append("createdAt", new Document("$type", "date").append("$gte", Date.from(start))), organizationId)),
                new Document("$group", new Document("_id", dateString("$createdAt", "%Y-%m-%d", timezone)).append("count", new Document("$sum", 1))),
                new Document("$sort", new Document("_id", 1))
        ));
        List<Map<String, Object>> series = new ArrayList<>();
        for (int index = 0; index < 14; index++) {
            LocalDate day = startDate.plusDays(index);
            series.add(point(day.toString().substring(5), counts.getOrDefault(day.toString(), 0L), day.toString(), null));
        }
        return series;
    }

    private List<Map<String, Object>> workforceAnomalies(String organizationId, ZoneId timezone) {
        Instant start = LocalDate.now(timezone).minusDays(29).atStartOfDay(timezone).toInstant();
        List<Map<String, Object>> anomalies = new ArrayList<>();
        long late = attendanceCount(withAttendanceScope(new Document("checkInTime", new Document("$type", "date").append("$gte", Date.from(start)))
                .append("status", new Document("$in", List.of("LATE", "LATE_ENTRY"))), organizationId));
        long missingCheckouts = attendanceCount(withAttendanceScope(new Document("state", new Document("$in", List.of("IN", "INSIDE", "CHECKED_IN")))
                .append("checkInTime", new Document("$type", "date").append("$lt", Date.from(Instant.now().minusSeconds(12 * 60 * 60)))), organizationId));
        long manualOverrides = attendanceCount(withAttendanceScope(new Document("$or", List.of(
                new Document("manualCheckIn", true),
                new Document("manualCheckOut", true),
                new Document("lastAction", new Document("$in", List.of("MANUAL_CHECK_IN", "MANUAL_CHECK_OUT")))
        )).append("createdAt", new Document("$type", "date").append("$gte", Date.from(start))), organizationId));

        anomalies.add(anomaly("Repeated late arrivals", late, "Workforce access timing outside shift expectations"));
        anomalies.add(anomaly("Missing check-outs", missingCheckouts, "Open presence records older than 12 hours"));
        anomalies.add(anomaly("Manual overrides", manualOverrides, "Guard-assisted workforce access changes"));
        anomalies.addAll(topManualOverrideEmployees(organizationId, start));
        return anomalies;
    }

    private List<Map<String, Object>> liveOperations(String organizationId, ZoneId timezone) {
        Instant now = Instant.now();
        Instant soon = now.plusSeconds(30 * 60);
        return List.of(
                operationState("Active visitors", count(withScope(statusFilter(VisitorStatus.CHECKED_IN), organizationId)), "Visitors currently inside"),
                operationState("Active workforce", attendanceCount(withAttendanceScope(new Document("state", new Document("$in", List.of("IN", "INSIDE", "CHECKED_IN"))), organizationId)), "Employees currently inside"),
                operationState("Overdue visitors", count(withScope(overdueVisitorFilter(now), organizationId)), "Visitor windows already elapsed"),
                operationState("Nearing expiration", count(withScope(expiringSoonVisitorFilter(now, soon), organizationId)), "Visitor passes expiring in 30 minutes"),
                operationState("Active checkpoints", Math.max(1, checkpointActivity(organizationId, timezone).stream().filter(item -> asLong(item.get("value")) > 0).count()), "Guard stations with recent activity")
        );
    }

    private List<Map<String, Object>> organizationBreakdown(String organizationId) {
        return aggregateRows(List.of(
                new Document("$match", scopeFilter(organizationId)),
                new Document("$group", new Document("_id", new Document("$ifNull", List.of("$organizationName", "$companyName")))
                        .append("value", new Document("$sum", 1))
                        .append("inside", new Document("$sum", conditionalStatus(VisitorStatus.CHECKED_IN)))
                        .append("denied", new Document("$sum", conditionalStatus(VisitorStatus.REJECTED)))),
                new Document("$sort", new Document("value", -1)),
                new Document("$limit", 10),
                new Document("$project", new Document("_id", 0)
                        .append("label", new Document("$ifNull", List.of("$_id", "Unassigned organization")))
                        .append("value", "$value")
                        .append("inside", "$inside")
                        .append("denied", "$denied"))
        ));
    }

    private List<Map<String, Object>> departmentBreakdown(String organizationId) {
        return aggregateRows(List.of(
                new Document("$match", scopeFilter(organizationId)),
                new Document("$group", new Document("_id", new Document("$ifNull", List.of("$department", "$hostEmployeeDepartment")))
                        .append("value", new Document("$sum", 1))
                        .append("inside", new Document("$sum", conditionalStatus(VisitorStatus.CHECKED_IN)))
                        .append("denied", new Document("$sum", conditionalStatus(VisitorStatus.REJECTED)))),
                new Document("$sort", new Document("value", -1)),
                new Document("$limit", 10),
                new Document("$project", new Document("_id", 0)
                        .append("label", new Document("$ifNull", List.of("$_id", "Unassigned department")))
                        .append("value", "$value")
                        .append("inside", "$inside")
                        .append("denied", "$denied"))
        ));
    }

    private List<Map<String, Object>> visitorCategoryBreakdown(String organizationId) {
        Map<String, Long> counts = aggregateCounts(List.of(
                new Document("$match", scopeFilter(organizationId)),
                new Document("$group", new Document("_id", "$visitorType").append("count", new Document("$sum", 1))),
                new Document("$sort", new Document("count", -1))
        ));
        return counts.entrySet().stream()
                .map(entry -> point(entry.getKey() == null || "null".equals(entry.getKey()) ? "ONE_TIME" : entry.getKey(), entry.getValue()))
                .toList();
    }

    private List<Map<String, Object>> checkpointActivity(String organizationId, ZoneId timezone) {
        Instant start = LocalDate.now(timezone).minusDays(6).atStartOfDay(timezone).toInstant();
        return aggregateRows(List.of(
                new Document("$match", withAttendanceScope(new Document("createdAt", new Document("$type", "date").append("$gte", Date.from(start))), organizationId)),
                new Document("$group", new Document("_id", new Document("$ifNull", List.of("$securityGuardName", "Primary checkpoint")))
                        .append("value", new Document("$sum", 1))
                        .append("manual", new Document("$sum", new Document("$cond", List.of(new Document("$or", List.of("$manualCheckIn", "$manualCheckOut")), 1, 0))))
                        .append("latest", new Document("$max", "$createdAt"))),
                new Document("$sort", new Document("value", -1)),
                new Document("$limit", 8),
                new Document("$project", new Document("_id", 0)
                        .append("label", "$_id")
                        .append("value", "$value")
                        .append("manual", "$manual")
                        .append("latest", "$latest"))
        ), ATTENDANCE_COLLECTION);
    }

    private List<Map<String, Object>> operationalInsights(String organizationId, ZoneId timezone) {
        List<Map<String, Object>> insights = new ArrayList<>();
        List<Map<String, Object>> checkIns = hourlySeries("checkInTime", organizationId, timezone);
        List<Map<String, Object>> checkOuts = hourlySeries("checkOutTime", organizationId, timezone);
        List<Map<String, Object>> denials = denialTrends(organizationId, timezone);
        List<Map<String, Object>> checkpoints = checkpointActivity(organizationId, timezone);
        Map<String, Object> busiestIn = busiest(checkIns);
        Map<String, Object> busiestOut = busiest(checkOuts);
        long deniedThisWeek = recentSeriesTotal(denials, 7);
        long deniedPreviousWeek = previousSeriesTotal(denials, 7);
        long deniedDelta = percentageDelta(deniedPreviousWeek, deniedThisWeek);
        long overloadThreshold = Math.max(8, Math.round(asLong(busiestIn.get("value")) * 0.75));
        List<Map<String, Object>> workforceAnomalies = workforceAnomalies(organizationId, timezone);

        insights.add(insight("Peak traffic window", "Peak visitor check-ins occur around " + busiestIn.get("label") + ".", asLong(busiestIn.get("value")) > 0 ? "high" : "low"));
        insights.add(insight("Check-out pressure", "Highest visitor exits occur around " + busiestOut.get("label") + ".", asLong(busiestOut.get("value")) > 0 ? "medium" : "low"));
        insights.add(insight("Denied access trend", "Denied entries changed " + deniedDelta + "% this week.", deniedThisWeek > deniedPreviousWeek ? "high" : "medium"));
        checkpoints.stream().findFirst().ifPresent(checkpoint -> insights.add(insight("Checkpoint activity", checkpoint.get("label") + " has the most recorded workforce checkpoint activity.", asLong(checkpoint.get("manual")) > 0 ? "medium" : "low")));
        workforceAnomalies.stream().filter(item -> asLong(item.get("value")) > 0).findFirst()
                .ifPresent(item -> insights.add(insight("Workforce anomaly", item.get("label") + " requires operational review.", "high")));
        if (asLong(busiestIn.get("value")) >= overloadThreshold && overloadThreshold > 0) {
            insights.add(insight("Visitor overload risk", "Visitor overload could occur near " + busiestIn.get("label") + " during peak windows.", "high"));
        }
        return insights.stream().limit(6).toList();
    }

    private List<Map<String, Object>> exportSnapshots(String organizationId, ZoneId timezone) {
        return List.of(
                snapshot("Visitor summary", "CSV", count(scopeFilter(organizationId)), "Visitor volume, active state, categories, and host movement"),
                snapshot("Denied entry report", "CSV", count(withScope(statusFilter(VisitorStatus.REJECTED), organizationId)), "Denied visitor entries, reasons, and retry patterns"),
                snapshot("Incident log", "CSV", auditCount(withAuditScope(new Document("action", new Document("$in", INCIDENT_ACTIONS.stream().toList())), organizationId)), "Security escalations, suspicious scans, and manual override events"),
                snapshot("Workforce anomalies", "CSV", workforceAnomalies(organizationId, timezone).stream().mapToLong(item -> asLong(item.get("value"))).sum(), "Late arrivals, missing check-outs, and manual access overrides"),
                snapshot("Operational snapshot", "PDF", liveOperations(organizationId, timezone).stream().mapToLong(item -> asLong(item.get("value"))).sum(), "Current active visitor, workforce, checkpoint, and expiration state")
        );
    }

    private List<Map<String, Object>> topManualOverrideEmployees(String organizationId, Instant start) {
        return aggregateRows(List.of(
                new Document("$match", withAttendanceScope(new Document("$or", List.of(
                        new Document("manualCheckIn", true),
                        new Document("manualCheckOut", true),
                        new Document("lastAction", new Document("$in", List.of("MANUAL_CHECK_IN", "MANUAL_CHECK_OUT")))
                )).append("createdAt", new Document("$type", "date").append("$gte", Date.from(start))), organizationId)),
                new Document("$group", new Document("_id", new Document("$ifNull", List.of("$employeeName", "Unknown employee")))
                        .append("value", new Document("$sum", 1))
                        .append("latest", new Document("$max", "$createdAt"))),
                new Document("$sort", new Document("value", -1)),
                new Document("$limit", 3),
                new Document("$project", new Document("_id", 0)
                        .append("label", new Document("$concat", List.of("Manual overrides: ", "$_id")))
                        .append("value", "$value")
                        .append("note", "Repeated manual workforce access override")
                        .append("latest", "$latest"))
        ), ATTENDANCE_COLLECTION);
    }

    private MongoCollection<Document> collection() {
        return mongoTemplate.getCollection(VISITORS_COLLECTION);
    }

    private MongoCollection<Document> collection(String collectionName) {
        return mongoTemplate.getCollection(collectionName);
    }

    private long count(Document filter) {
        return collection().countDocuments(filter);
    }

    private long attendanceCount(Document filter) {
        return collection(ATTENDANCE_COLLECTION).countDocuments(filter);
    }

    private long auditCount(Document filter) {
        return collection(ACCESS_AUDIT_COLLECTION).countDocuments(filter);
    }

    private Document withScope(Document filter, String organizationId) {
        if (organizationId == null) {
            return filter;
        }
        Document scoped = new Document(filter);
        scoped.append("organizationId", organizationId);
        return scoped;
    }

    private Document withAttendanceScope(Document filter, String organizationId) {
        return withScope(filter, organizationId);
    }

    private Document withAuditScope(Document filter, String organizationId) {
        return withScope(filter, organizationId);
    }

    private Document scopeFilter(String organizationId) {
        return organizationId == null ? new Document() : new Document("organizationId", organizationId);
    }

    private Document statusFilter(VisitorStatus status) {
        return new Document("status", status.name());
    }

    private Document overdueVisitorFilter(Instant now) {
        return new Document("status", VisitorStatus.CHECKED_IN.name())
                .append("$or", List.of(
                        new Document("accessWindowEndTime", new Document("$type", "date").append("$lt", Date.from(now))),
                        new Document("scheduledEndTime", new Document("$type", "date").append("$lt", Date.from(now))),
                        new Document("qrExpiresAt", new Document("$type", "date").append("$lt", Date.from(now)))
                ));
    }

    private Document expiringSoonVisitorFilter(Instant now, Instant soon) {
        List<Document> windows = List.of(
                new Document("accessWindowEndTime", new Document("$type", "date").append("$gte", Date.from(now)).append("$lt", Date.from(soon))),
                new Document("scheduledEndTime", new Document("$type", "date").append("$gte", Date.from(now)).append("$lt", Date.from(soon))),
                new Document("qrExpiresAt", new Document("$type", "date").append("$gte", Date.from(now)).append("$lt", Date.from(soon)))
        );
        return new Document("status", new Document("$in", List.of(VisitorStatus.APPROVED.name(), VisitorStatus.CHECKED_IN.name())))
                .append("$or", windows);
    }

    private Document range(Instant start, Instant end) {
        return new Document("$gte", Date.from(start)).append("$lt", Date.from(end));
    }

    private Document dateRangeFilter(String field, Instant start, Instant end) {
        Document range = new Document("$type", "date");
        if (start != null) {
            range.append("$gte", Date.from(start));
        }
        if (end != null) {
            range.append("$lt", Date.from(end));
        }
        return new Document(field, range);
    }

    private Document dateString(String field, String format, ZoneId timezone) {
        return new Document("$dateToString", new Document("format", format).append("date", field).append("timezone", timezone.getId()));
    }

    private Document conditionalStatus(VisitorStatus status) {
        return new Document("$cond", List.of(new Document("$eq", List.of("$status", status.name())), 1, 0));
    }

    private Map<String, Long> aggregateCounts(List<Document> pipeline) {
        return aggregateCounts(VISITORS_COLLECTION, pipeline);
    }

    private Map<String, Long> aggregateCounts(String collectionName, List<Document> pipeline) {
        Map<String, Long> counts = new LinkedHashMap<>();
        for (Document document : collection(collectionName).aggregate(pipeline)) {
            counts.put(String.valueOf(document.get("_id")), number(document, "count"));
        }
        return counts;
    }

    private List<Map<String, Object>> aggregateRows(List<Document> pipeline) {
        return aggregateRows(pipeline, VISITORS_COLLECTION);
    }

    private List<Map<String, Object>> aggregateRows(List<Document> pipeline, String collectionName) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Document document : collection(collectionName).aggregate(pipeline)) {
            rows.add(toPlainMap(document));
        }
        return rows;
    }

    private Map<String, Object> toPlainMap(Document document) {
        Map<String, Object> row = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : document.entrySet()) {
            if (!"_id".equals(entry.getKey())) {
                row.put(entry.getKey(), entry.getValue());
            }
        }
        return row;
    }

    private long safeLong(String section, Supplier<Long> supplier) {
        try {
            return supplier.get();
        } catch (RuntimeException ex) {
            log.warn("Admin analytics section '{}' failed; returning numeric fallback. cause={}: {}",
                    section, ex.getClass().getSimpleName(), safeMessage(ex));
            return 0L;
        }
    }

    private List<Map<String, Object>> safeList(String section, Supplier<List<Map<String, Object>>> supplier) {
        try {
            List<Map<String, Object>> value = supplier.get();
            return value == null ? List.of() : value;
        } catch (RuntimeException ex) {
            log.warn("Admin analytics section '{}' failed; returning empty fallback. cause={}: {}",
                    section, ex.getClass().getSimpleName(), safeMessage(ex));
            return List.of();
        }
    }

    private Map<String, Object> widget(String label, long value, String note) {
        return Map.of("label", label, "value", value, "note", note);
    }

    private Map<String, Object> point(String label, long value) {
        return Map.of("label", label, "value", value);
    }

    private Map<String, Object> point(String label, long value, String date, String hour) {
        Map<String, Object> point = new LinkedHashMap<>();
        point.put("label", label);
        point.put("value", value);
        if (date != null) {
            point.put("date", date);
        }
        if (hour != null) {
            point.put("hour", hour);
        }
        return point;
    }

    private Map<String, Object> rate(String label, long value, long total) {
        long percentage = Math.round((value * 100.0) / total);
        return Map.of("label", label, "value", value, "percentage", percentage);
    }

    private Map<String, Object> anomaly(String label, long value, String note) {
        String severity = value >= 5 ? "high" : value > 0 ? "medium" : "low";
        return Map.of("label", label, "value", value, "note", note, "severity", severity);
    }

    private Map<String, Object> operationState(String label, long value, String note) {
        return Map.of("label", label, "value", value, "note", note);
    }

    private Map<String, Object> insight(String label, String detail, String severity) {
        return Map.of("label", label, "detail", detail, "severity", severity);
    }

    private Map<String, Object> snapshot(String label, String format, long records, String note) {
        return Map.of("label", label, "format", format, "records", records, "note", note);
    }

    private Map<String, Object> busiest(List<Map<String, Object>> series) {
        return series.stream()
                .max((left, right) -> Long.compare(asLong(left.get("value")), asLong(right.get("value"))))
                .orElse(Map.of("label", "00:00", "value", 0L));
    }

    private long recentSeriesTotal(List<Map<String, Object>> series, int size) {
        int start = Math.max(0, series.size() - size);
        return series.subList(start, series.size()).stream().mapToLong(item -> asLong(item.get("value"))).sum();
    }

    private long previousSeriesTotal(List<Map<String, Object>> series, int size) {
        int end = Math.max(0, series.size() - size);
        int start = Math.max(0, end - size);
        return series.subList(start, end).stream().mapToLong(item -> asLong(item.get("value"))).sum();
    }

    private long percentageDelta(long previous, long current) {
        if (previous == 0) {
            return current == 0 ? 0 : 100;
        }
        return Math.round(((current - previous) * 100.0) / previous);
    }

    private long number(Document document, String key) {
        Object value = document.get(key);
        return value instanceof Number number ? number.longValue() : 0L;
    }

    private String firstPresent(Object primary, Object fallback) {
        String primaryValue = primary == null ? null : String.valueOf(primary);
        if (primaryValue != null && !primaryValue.isBlank()) {
            return primaryValue;
        }
        String fallbackValue = fallback == null ? null : String.valueOf(fallback);
        return fallbackValue == null || fallbackValue.isBlank() ? "Unassigned" : fallbackValue;
    }

    private AnalyticsScope analyticsScope(String actorId) {
        if (actorId == null) {
            return new AnalyticsScope(null, ZoneOffset.UTC);
        }
        try {
            User user = userRepository.findById(actorId).orElse(null);
            if (user == null || user.getRoles() == null || user.getRoles().contains(Role.SUPER_ADMIN)) {
                return new AnalyticsScope(null, ZoneOffset.UTC);
            }
            return new AnalyticsScope(trimToNull(user.getOrganizationId()), resolveZoneId(user));
        } catch (RuntimeException ex) {
            log.warn("Admin analytics scope resolution failed; using platform fallback. actorPresent={} cause={}: {}",
                    actorId != null, ex.getClass().getSimpleName(), safeMessage(ex));
            return new AnalyticsScope(null, ZoneOffset.UTC);
        }
    }

    private long asLong(Object value) {
        return value instanceof Number number ? number.longValue() : 0L;
    }

    private ZoneId resolveZoneId(User user) {
        String timezone = null;
        if (trimToNull(user.getOrganizationId()) != null) {
            timezone = organizationRepository.findById(user.getOrganizationId())
                    .map(organization -> trimToNull(organization.getTimezone()))
                    .orElse(null);
        }
        if (timezone == null) {
            timezone = trimToNull(user.getOrganizationTimezone());
        }
        try {
            return timezone == null ? ZoneOffset.UTC : ZoneId.of(timezone);
        } catch (RuntimeException ex) {
            return ZoneOffset.UTC;
        }
    }

    private String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String safeMessage(RuntimeException ex) {
        String message = ex.getMessage();
        return message == null || message.isBlank() ? "no detail" : message;
    }

    private record AnalyticsScope(String organizationId, ZoneId zoneId) {
    }
}
