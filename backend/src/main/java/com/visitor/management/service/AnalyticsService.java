package com.visitor.management.service;

import com.mongodb.client.MongoCollection;
import com.visitor.management.entity.VisitorStatus;
import org.bson.Document;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class AnalyticsService {

    private static final String VISITORS_COLLECTION = "visitors";

    private final MongoTemplate mongoTemplate;

    public AnalyticsService(MongoTemplate mongoTemplate) {
        this.mongoTemplate = mongoTemplate;
    }

    @Cacheable("adminAnalytics")
    public Map<String, Object> adminDashboard() {
        Instant todayStart = LocalDate.now(ZoneOffset.UTC).atStartOfDay().toInstant(ZoneOffset.UTC);
        Instant todayEnd = todayStart.plusSeconds(24 * 60 * 60);

        long totalVisitors = count(new Document());
        long activeVisitors = count(statusFilter(VisitorStatus.CHECKED_IN));
        long pendingApprovals = count(statusFilter(VisitorStatus.PENDING));
        long todayCheckIns = count(new Document("checkInTime", range(todayStart, todayEnd)));
        long rejectedVisitors = count(statusFilter(VisitorStatus.REJECTED));

        List<Map<String, Object>> widgets = List.of(
                widget("Total visitors", totalVisitors, "All registered visitor records"),
                widget("Active visitors", activeVisitors, "Currently checked in"),
                widget("Pending approvals", pendingApprovals, "Awaiting host action"),
                widget("Today's check-ins", todayCheckIns, "Checked in since midnight UTC"),
                widget("Rejected visitors", rejectedVisitors, "Denied visit requests")
        );

        return Map.of(
                "widgets", widgets,
                "employeeAnalytics", employeeAnalytics(),
                "dailyVisitors", dailyVisitors(),
                "monthlyTrends", monthlyTrends(),
                "peakHours", peakHours(),
                "approvalRates", approvalRates()
        );
    }

    private List<Map<String, Object>> dailyVisitors() {
        LocalDate startDate = LocalDate.now(ZoneOffset.UTC).minusDays(13);
        Instant start = startDate.atStartOfDay().toInstant(ZoneOffset.UTC);
        Map<String, Long> counts = aggregateCounts(List.of(
                new Document("$match", new Document("checkInTime", new Document("$gte", Date.from(start)))),
                new Document("$group", new Document("_id", dateString("$checkInTime", "%Y-%m-%d")).append("count", new Document("$sum", 1))),
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

    private List<Map<String, Object>> monthlyTrends() {
        YearMonth startMonth = YearMonth.now(ZoneOffset.UTC).minusMonths(11);
        Instant start = startMonth.atDay(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        Map<String, Long> counts = aggregateCounts(List.of(
                new Document("$match", new Document("createdAt", new Document("$gte", Date.from(start)))),
                new Document("$group", new Document("_id", dateString("$createdAt", "%Y-%m")).append("count", new Document("$sum", 1))),
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

    private List<Map<String, Object>> peakHours() {
        Instant start = LocalDate.now(ZoneOffset.UTC).minusDays(29).atStartOfDay().toInstant(ZoneOffset.UTC);
        Map<String, Long> counts = aggregateCounts(List.of(
                new Document("$match", new Document("checkInTime", new Document("$gte", Date.from(start)))),
                new Document("$group", new Document("_id", dateString("$checkInTime", "%H")).append("count", new Document("$sum", 1))),
                new Document("$sort", new Document("_id", 1))
        ));

        List<Map<String, Object>> series = new ArrayList<>();
        for (int hour = 0; hour < 24; hour++) {
            String key = String.format("%02d", hour);
            series.add(point(key + ":00", counts.getOrDefault(key, 0L)));
        }
        return series;
    }

    private List<Map<String, Object>> approvalRates() {
        Map<String, Long> counts = aggregateCounts(List.of(
                new Document("$match", new Document("status", new Document("$in", List.of(
                        VisitorStatus.APPROVED.name(),
                        VisitorStatus.CHECKED_IN.name(),
                        VisitorStatus.CHECKED_OUT.name(),
                        VisitorStatus.REJECTED.name(),
                        VisitorStatus.PENDING.name(),
                        VisitorStatus.EXPIRED.name()
                )))),
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

    private List<Map<String, Object>> employeeAnalytics() {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Document document : collection().aggregate(List.of(
                new Document("$group", new Document("_id", new Document("id", "$hostEmployeeId").append("name", "$hostEmployee"))
                        .append("total", new Document("$sum", 1))
                        .append("active", new Document("$sum", conditionalStatus(VisitorStatus.CHECKED_IN)))
                        .append("pending", new Document("$sum", conditionalStatus(VisitorStatus.PENDING)))
                        .append("rejected", new Document("$sum", conditionalStatus(VisitorStatus.REJECTED)))),
                new Document("$sort", new Document("total", -1)),
                new Document("$limit", 8)
        ))) {
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

    private Document statusFilter(VisitorStatus status) {
        return new Document("status", status.name());
    }

    private Document range(Instant start, Instant end) {
        return new Document("$gte", Date.from(start)).append("$lt", Date.from(end));
    }

    private Document dateString(String field, String format) {
        return new Document("$dateToString", new Document("format", format).append("date", field).append("timezone", "UTC"));
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
}
