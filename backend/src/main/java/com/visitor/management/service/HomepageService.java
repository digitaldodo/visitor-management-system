package com.visitor.management.service;

import com.visitor.management.dto.HomepageSettingsRequest;
import com.visitor.management.entity.AccountStatus;
import com.visitor.management.entity.HomepageSettings;
import com.visitor.management.entity.Role;
import com.visitor.management.entity.VisitorStatus;
import com.visitor.management.exception.BadRequestException;
import com.visitor.management.exception.ResourceNotFoundException;
import com.visitor.management.repository.HomepageSettingsRepository;
import com.visitor.management.repository.OrganizationRepository;
import com.visitor.management.repository.UserRepository;
import com.visitor.management.repository.VisitorRepository;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class HomepageService {

    private static final String SETTINGS_ID = "homepage";
    private static final String METRIC_ORGANIZATIONS = "organizations";
    private static final String METRIC_VISITOR_REQUESTS = "visitorRequests";
    private static final String METRIC_APPROVED_VISITS = "approvedVisits";
    private static final String METRIC_ACTIVE_EMPLOYEES = "activeEmployees";

    private static final List<String> DEFAULT_FEATURED_METRICS = List.of(
            METRIC_ORGANIZATIONS,
            METRIC_VISITOR_REQUESTS,
            METRIC_APPROVED_VISITS
    );
    private static final List<String> DEFAULT_PUBLIC_COUNTERS = List.of(
            METRIC_ORGANIZATIONS,
            METRIC_ACTIVE_EMPLOYEES
    );
    private static final Set<String> ALLOWED_METRIC_KEYS = Set.of(
            METRIC_ORGANIZATIONS,
            METRIC_VISITOR_REQUESTS,
            METRIC_APPROVED_VISITS,
            METRIC_ACTIVE_EMPLOYEES
    );

    private final HomepageSettingsRepository homepageSettingsRepository;
    private final OrganizationRepository organizationRepository;
    private final VisitorRepository visitorRepository;
    private final UserRepository userRepository;

    public HomepageService(
            HomepageSettingsRepository homepageSettingsRepository,
            OrganizationRepository organizationRepository,
            VisitorRepository visitorRepository,
            UserRepository userRepository
    ) {
        this.homepageSettingsRepository = homepageSettingsRepository;
        this.organizationRepository = organizationRepository;
        this.visitorRepository = visitorRepository;
        this.userRepository = userRepository;
    }

    public Map<String, Object> publicHomepage() {
        HomepageSettings settings = currentSettings();
        List<Map<String, Object>> featuredMetrics = settings.isStatsVisible() && settings.isFeaturedMetricsVisible()
                ? buildVisibleMetrics(settings.getFeaturedMetricKeys())
                : List.of();
        List<Map<String, Object>> publicCounters = settings.isStatsVisible() && settings.isPublicCountersVisible()
                ? buildVisibleMetrics(settings.getPublicMetricKeys())
                : List.of();
        LinkedHashMap<String, Object> response = new LinkedHashMap<>();
        response.put("announcement", publicAnnouncement(settings));
        response.put("featuredMetrics", featuredMetrics);
        response.put("publicCounters", publicCounters);
        response.put("featuredMetricsEmptyState", featuredMetrics.isEmpty() && settings.isStatsVisible() && settings.isFeaturedMetricsVisible()
                ? Map.of(
                "title", "No homepage metrics yet",
                "message", "Visitor analytics become available after activity is recorded."
        )
                : null);
        response.put("publicCountersEmptyState", publicCounters.isEmpty() && settings.isStatsVisible() && settings.isPublicCountersVisible()
                ? Map.of(
                "title", "No public counters yet",
                "message", "Public counters appear after organizations, employee accounts, or visitor records are created."
        )
                : null);
        return response;
    }

    public Map<String, Object> adminSettings() {
        HomepageSettings settings = currentSettings();
        return response(settings);
    }

    public Map<String, Object> updateSettings(HomepageSettingsRequest request, Authentication authentication) {
        HomepageSettings settings = ensureStoredSettings();
        settings.setStatsVisible(Boolean.TRUE.equals(request.statsVisible()));
        settings.setPublicCountersVisible(Boolean.TRUE.equals(request.publicCountersVisible()));
        settings.setFeaturedMetricsVisible(Boolean.TRUE.equals(request.featuredMetricsVisible()));
        settings.setAnnouncementVisible(Boolean.TRUE.equals(request.announcementVisible()));
        settings.setAnnouncementTitle(trimToNull(request.announcementTitle()));
        settings.setAnnouncementBody(trimToNull(request.announcementBody()));
        settings.setFeaturedMetricKeys(sanitizeMetricKeys(request.featuredMetricKeys(), DEFAULT_FEATURED_METRICS));
        settings.setPublicMetricKeys(sanitizeMetricKeys(request.publicMetricKeys(), DEFAULT_PUBLIC_COUNTERS));
        settings.setUpdatedBy(resolveActor(authentication));
        HomepageSettings saved = homepageSettingsRepository.save(settings);
        return response(saved);
    }

    private Map<String, Object> response(HomepageSettings settings) {
        LinkedHashMap<String, Object> settingsResponse = new LinkedHashMap<>();
        settingsResponse.put("statsVisible", settings.isStatsVisible());
        settingsResponse.put("publicCountersVisible", settings.isPublicCountersVisible());
        settingsResponse.put("featuredMetricsVisible", settings.isFeaturedMetricsVisible());
        settingsResponse.put("announcementVisible", settings.isAnnouncementVisible());
        settingsResponse.put("announcementTitle", safe(settings.getAnnouncementTitle()));
        settingsResponse.put("announcementBody", safe(settings.getAnnouncementBody()));
        settingsResponse.put("featuredMetricKeys", settings.getFeaturedMetricKeys());
        settingsResponse.put("publicMetricKeys", settings.getPublicMetricKeys());
        settingsResponse.put("updatedBy", safe(settings.getUpdatedBy()));
        settingsResponse.put("updatedAt", settings.getUpdatedAt());

        LinkedHashMap<String, Object> response = new LinkedHashMap<>();
        response.put("settings", settingsResponse);
        response.put("availableMetrics", availableMetrics());
        response.put("publicPreview", publicHomepage());
        return response;
    }

    private HomepageSettings currentSettings() {
        return homepageSettingsRepository.findById(SETTINGS_ID).orElse(defaultSettings());
    }

    private HomepageSettings ensureStoredSettings() {
        return homepageSettingsRepository.findById(SETTINGS_ID).orElseGet(() -> {
            HomepageSettings settings = defaultSettings();
            settings.setCreatedAt(Instant.now());
            return settings;
        });
    }

    private HomepageSettings defaultSettings() {
        HomepageSettings settings = new HomepageSettings();
        settings.setId(SETTINGS_ID);
        settings.setStatsVisible(false);
        settings.setPublicCountersVisible(false);
        settings.setFeaturedMetricsVisible(true);
        settings.setAnnouncementVisible(false);
        settings.setFeaturedMetricKeys(new ArrayList<>(DEFAULT_FEATURED_METRICS));
        settings.setPublicMetricKeys(new ArrayList<>(DEFAULT_PUBLIC_COUNTERS));
        return settings;
    }

    private List<Map<String, Object>> buildVisibleMetrics(List<String> keys) {
        List<Map<String, Object>> metrics = new ArrayList<>();
        for (String key : sanitizeMetricKeys(keys, List.of())) {
            Map<String, Object> metric = metricDefinition(key);
            Number value = (Number) metric.get("value");
            if (value != null && value.longValue() > 0) {
                metrics.add(metric);
            }
        }
        return metrics;
    }

    private Map<String, Object> publicAnnouncement(HomepageSettings settings) {
        String title = trimToNull(settings.getAnnouncementTitle());
        String body = trimToNull(settings.getAnnouncementBody());
        if (!settings.isAnnouncementVisible() || title == null || body == null) {
            return null;
        }
        return Map.of("title", title, "body", body);
    }

    private List<Map<String, Object>> availableMetrics() {
        return List.of(
                metricOption(METRIC_ORGANIZATIONS, "Organizations", "Active organizations configured in AccessFlow"),
                metricOption(METRIC_VISITOR_REQUESTS, "Visitor requests", "Visitor requests recorded in the platform"),
                metricOption(METRIC_APPROVED_VISITS, "Approved visits", "Approved, checked-in, or completed visits"),
                metricOption(METRIC_ACTIVE_EMPLOYEES, "Active employees", "Employee accounts available for host approvals")
        );
    }

    private Map<String, Object> metricDefinition(String key) {
        LinkedHashMap<String, Object> metric = switch (key) {
            case METRIC_ORGANIZATIONS -> metricOption(key, "Organizations", "Active organizations configured in AccessFlow");
            case METRIC_VISITOR_REQUESTS -> metricOption(key, "Visitor requests", "Visitor requests recorded in the platform");
            case METRIC_APPROVED_VISITS -> metricOption(key, "Approved visits", "Approved, checked-in, or completed visits");
            case METRIC_ACTIVE_EMPLOYEES -> metricOption(key, "Active employees", "Employee accounts available for host approvals");
            default -> throw new ResourceNotFoundException("Homepage metric was not found.");
        };
        metric.put("value", switch (key) {
            case METRIC_ORGANIZATIONS -> organizationRepository.countByActiveStatusTrue();
            case METRIC_VISITOR_REQUESTS -> visitorRepository.count();
            case METRIC_APPROVED_VISITS -> approvedVisits();
            case METRIC_ACTIVE_EMPLOYEES -> activeEmployees();
            default -> 0L;
        });
        return metric;
    }

    private long approvedVisits() {
        return visitorRepository.countByStatus(VisitorStatus.APPROVED)
                + visitorRepository.countByStatus(VisitorStatus.CHECKED_IN)
                + visitorRepository.countByStatus(VisitorStatus.CHECKED_OUT);
    }

    private long activeEmployees() {
        return userRepository.countByRolesContainingAndActiveTrueAndAccountStatus(Role.EMPLOYEE, AccountStatus.ACTIVE);
    }

    private LinkedHashMap<String, Object> metricOption(String key, String label, String note) {
        LinkedHashMap<String, Object> metric = new LinkedHashMap<>();
        metric.put("key", key);
        metric.put("label", label);
        metric.put("note", note);
        return metric;
    }

    private List<String> sanitizeMetricKeys(List<String> keys, List<String> fallback) {
        List<String> source = (keys == null || keys.isEmpty()) ? fallback : keys;
        LinkedHashSet<String> sanitized = new LinkedHashSet<>();
        for (String key : source) {
            if (key == null || key.isBlank()) {
                continue;
            }
            if (!ALLOWED_METRIC_KEYS.contains(key)) {
                throw new BadRequestException("Homepage metric selection is invalid.");
            }
            sanitized.add(key);
        }
        return List.copyOf(sanitized);
    }

    private String resolveActor(Authentication authentication) {
        return authentication == null ? null : trimToNull(authentication.getName());
    }

    private String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }
}
