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
import java.util.function.Supplier;

@Service
public class AnalyticsService {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsService.class);
    private static final String VISITORS_COLLECTION = "visitors";

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
        long activeOrganizations = organizationId == null
                ? safeLong("organization.metrics.activeOrganizations", organizationRepository::countByActiveStatusTrue)
                : 1L;

        List<Map<String, Object>> widgets = List.of(
                widget("Total visitors", totalVisitors, "All registered visitor records"),
                widget("Active visitors", activeVisitors, "Currently checked in"),
                widget("Pending approvals", pendingApprovals, "Awaiting host action"),
                widget("Today's check-ins", todayCheckIns, "Checked in since midnight " + timezone.getId()),
                widget("Rejected visitors", rejectedVisitors, "Denied visit requests")
        );

        return Map.ofEntries(
                Map.entry("timezone", timezone.getId()),
                Map.entry("metrics", Map.of(
                        "activeOrganizations", activeOrganizations,
                        "activeVisitors", activeVisitors,
                        "totalVisitors", totalVisitors,
                        "pendingApprovals", pendingApprovals,
                        "todayCheckIns", todayCheckIns,
                        "rejectedVisitors", rejectedVisitors
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
                Map.entry("approvalRates", safeList("approvalRates", () -> approvalRates(organizationId)))
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
            series.add(point(key.substring(5), counts.getOrDefault(key, 0L)));
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
            series.add(point(month.getMonth().name().substring(0, 3), counts.getOrDefault(key, 0L)));
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
            series.add(point(key + ":00", counts.getOrDefault(key, 0L)));
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
            series.add(point(key + ":00", scheduled.getOrDefault(key, 0L)));
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
            series.add(point(day.getDayOfWeek().name().substring(0, 3), counts.getOrDefault(day.toString(), 0L)));
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

    private MongoCollection<Document> collection() {
        return mongoTemplate.getCollection(VISITORS_COLLECTION);
    }

    private long count(Document filter) {
        return collection().countDocuments(filter);
    }

    private Document withScope(Document filter, String organizationId) {
        if (organizationId == null) {
            return filter;
        }
        Document scoped = new Document(filter);
        scoped.append("organizationId", organizationId);
        return scoped;
    }

    private Document scopeFilter(String organizationId) {
        return organizationId == null ? new Document() : new Document("organizationId", organizationId);
    }

    private Document statusFilter(VisitorStatus status) {
        return new Document("status", status.name());
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
        Map<String, Long> counts = new LinkedHashMap<>();
        for (Document document : collection().aggregate(pipeline)) {
            counts.put(String.valueOf(document.get("_id")), number(document, "count"));
        }
        return counts;
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

    private Map<String, Object> rate(String label, long value, long total) {
        long percentage = Math.round((value * 100.0) / total);
        return Map.of("label", label, "value", value, "percentage", percentage);
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
