package com.visitor.management.controller;

import com.visitor.management.dto.ApiResponse;
import com.visitor.management.config.AppProperties;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class VersionController {

    private final String activeProfile;
    private final AppProperties appProperties;

    public VersionController(@Value("${spring.profiles.active:default}") String activeProfile, AppProperties appProperties) {
        this.activeProfile = activeProfile;
        this.appProperties = appProperties;
    }

    @GetMapping("/versions")
    public ApiResponse<Map<String, Object>> versions() {
        AppProperties.Mobile mobile = appProperties.getMobile();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("current", "v1");
        payload.put("supported", List.of("v1"));
        payload.put("profile", activeProfile);
        payload.put("minimumAppVersion", blankToNull(mobile.getMinimumAppVersion()));
        payload.put("minimumRuntimeVersion", blankToNull(mobile.getMinimumRuntimeVersion()));
        payload.put("recommendedAppVersion", blankToNull(mobile.getRecommendedAppVersion()));
        payload.put("releaseChannel", blankToNull(mobile.getReleaseChannel()));
        payload.put("rollout", Map.of(
                "channel", blankToDefault(mobile.getReleaseChannel(), "production"),
                "cohort", blankToDefault(mobile.getRolloutCohort(), "stable"),
                "percent", Math.max(0, Math.min(100, mobile.getRolloutPercent())),
                "forced", mobile.isForcedUpdate(),
                "rollback", mobile.isRollback()
        ));
        return ApiResponse.ok("API versions loaded.", payload);
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String blankToDefault(String value, String fallback) {
        String normalized = blankToNull(value);
        return normalized == null ? fallback : normalized;
    }
}
