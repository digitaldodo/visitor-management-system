package com.visitor.management.security;

import com.visitor.management.config.AppProperties;
import com.visitor.management.exception.TooManyRequestsException;
import com.visitor.management.service.RateLimitService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 5)
public class ApiRateLimitFilter extends OncePerRequestFilter {

    private final RateLimitService rateLimitService;
    private final AppProperties appProperties;

    public ApiRateLimitFilter(RateLimitService rateLimitService, AppProperties appProperties) {
        this.rateLimitService = rateLimitService;
        this.appProperties = appProperties;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !appProperties.getRateLimit().isEnabled()
                || "OPTIONS".equalsIgnoreCase(request.getMethod())
                || (!request.getRequestURI().startsWith("/api/") && !request.getRequestURI().startsWith("/auth/"));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        try {
            rateLimitService.check(
                    "api",
                    clientKey(request),
                    appProperties.getRateLimit().getRequestsPerMinute(),
                    Duration.ofMinutes(1)
            );
        } catch (TooManyRequestsException ex) {
            response.setStatus(429);
            response.setContentType("application/json");
            response.getWriter().write("{\"success\":false,\"message\":\"Too many requests. Please wait before trying again.\"}");
            return;
        }
        filterChain.doFilter(request, response);
    }

    private String clientKey(HttpServletRequest request) {
        String forwardedFor = request.getHeader("X-Forwarded-For");
        String ip = forwardedFor == null || forwardedFor.isBlank() ? request.getRemoteAddr() : forwardedFor.split(",")[0].trim();
        String user = request.getUserPrincipal() == null ? "anonymous" : request.getUserPrincipal().getName();
        return ip + ":" + user;
    }
}
