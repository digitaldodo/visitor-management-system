package com.visitor.management.config;

import org.springframework.stereotype.Component;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Component
public class CorsOriginResolver {

    private final AppProperties properties;

    public CorsOriginResolver(AppProperties properties) {
        this.properties = properties;
    }

    public List<String> resolveAllowedOrigins() {
        Set<String> origins = new LinkedHashSet<>();
        properties.getCors().getAllowedOrigins().forEach(origin -> addOrigin(origins, origin));
        return List.copyOf(origins);
    }

    public String resolvePublicOrigin() {
        List<String> origins = resolveAllowedOrigins();
        return origins.stream()
                .filter(origin -> origin.startsWith("https://") && !isLocalOrigin(origin))
                .findFirst()
                .orElseGet(() -> origins.stream().findFirst().orElse(null));
    }

    public String normalizeOrigin(String origin) {
        if (origin == null) {
            return null;
        }

        String normalized = origin.trim();
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1).trim();
        }

        return normalized.isBlank() ? null : normalized;
    }

    private void addOrigin(Set<String> origins, String origin) {
        String normalized = normalizeOrigin(origin);
        if (normalized != null) {
            origins.add(normalized);
        }
    }

    private boolean isLocalOrigin(String origin) {
        return origin.contains("localhost") || origin.contains("127.0.0.1");
    }
}
