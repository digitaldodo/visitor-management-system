package com.visitor.management.config;

import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Component
public class CorsOriginResolver {

    private final AppProperties properties;
    private final Environment environment;

    public CorsOriginResolver(AppProperties properties, Environment environment) {
        this.properties = properties;
        this.environment = environment;
    }

    public List<String> resolveAllowedOrigins() {
        Set<String> origins = new LinkedHashSet<>();

        addOrigin(origins, properties.getCors().getFrontendUrl());
        if (!isProduction()) {
            properties.getCors().getLocalDevOrigins().forEach(origin -> addOrigin(origins, origin));
        }

        return List.copyOf(origins);
    }

    public String getFrontendUrl() {
        return normalizeOrigin(properties.getCors().getFrontendUrl());
    }

    public boolean isProduction() {
        return environment.acceptsProfiles(Profiles.of("prod"));
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
}
