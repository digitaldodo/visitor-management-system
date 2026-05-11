package com.visitor.management.dto;

import jakarta.validation.constraints.Size;

import java.util.List;

public record HomepageSettingsRequest(
        Boolean statsVisible,
        Boolean publicCountersVisible,
        Boolean featuredMetricsVisible,
        Boolean announcementVisible,
        @Size(max = 80, message = "Announcement title must be 80 characters or fewer.") String announcementTitle,
        @Size(max = 240, message = "Announcement body must be 240 characters or fewer.") String announcementBody,
        @Size(max = 8, message = "Featured metrics selection is too large.") List<String> featuredMetricKeys,
        @Size(max = 8, message = "Public counters selection is too large.") List<String> publicMetricKeys
) {
}
