package com.visitor.management.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpMethod;

import java.util.List;

final class PublicEndpointRequestMatchers {

    private static final List<String> PUBLIC_POST_AUTH_PATHS = List.of(
            "/auth/login",
            "/auth/register",
            "/auth/refresh",
            "/auth/logout",
            "/auth/forgot-password",
            "/auth/verify-otp",
            "/auth/reset-password",
            "/api/auth/login",
            "/api/auth/register",
            "/api/auth/refresh",
            "/api/auth/logout",
            "/api/auth/forgot-password",
            "/api/auth/verify-otp",
            "/api/auth/reset-password",
            "/api/v1/auth/login",
            "/api/v1/auth/register",
            "/api/v1/auth/refresh",
            "/api/v1/auth/logout",
            "/api/v1/auth/forgot-password",
            "/api/v1/auth/verify-otp",
            "/api/v1/auth/reset-password"
    );

    private static final List<String> PUBLIC_ANY_METHOD_PATHS = List.of(
            "/api/v1/health/**",
            "/health/**",
            "/api/v1/organizations/public",
            "/organizations/public",
            "/api/v1/public/passes/**",
            "/public/passes/**",
            "/api/v1/homepage",
            "/api/versions",
            "/actuator/health/**",
            "/actuator/info",
            "/v3/api-docs/**",
            "/swagger-ui/**",
            "/swagger-ui.html"
    );

    private PublicEndpointRequestMatchers() {
    }

    static String[] publicAnyMethodPaths() {
        return PUBLIC_ANY_METHOD_PATHS.toArray(String[]::new);
    }

    static String[] publicPostAuthPaths() {
        return PUBLIC_POST_AUTH_PATHS.toArray(String[]::new);
    }

    static boolean isPublic(HttpServletRequest request) {
        String method = request.getMethod();
        String path = request.getRequestURI();
        return HttpMethod.OPTIONS.matches(method)
                || (HttpMethod.POST.matches(method) && PUBLIC_POST_AUTH_PATHS.contains(path))
                || PUBLIC_ANY_METHOD_PATHS.stream().anyMatch(pattern -> matches(pattern, path));
    }

    private static boolean matches(String pattern, String path) {
        if (pattern.endsWith("/**")) {
            String prefix = pattern.substring(0, pattern.length() - 3);
            return path.equals(prefix) || path.startsWith(prefix + "/");
        }
        return path.equals(pattern);
    }
}
