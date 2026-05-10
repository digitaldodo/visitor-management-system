package com.visitor.management.security;

import com.visitor.management.exception.BadRequestException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import java.util.regex.Pattern;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class InputSanitizationFilter extends OncePerRequestFilter {

    private static final List<Pattern> DANGEROUS_PATTERNS = List.of(
            Pattern.compile("<\\s*script", Pattern.CASE_INSENSITIVE),
            Pattern.compile("javascript\\s*:", Pattern.CASE_INSENSITIVE),
            Pattern.compile("on\\w+\\s*=", Pattern.CASE_INSENSITIVE)
    );

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return "GET".equalsIgnoreCase(request.getMethod()) || "OPTIONS".equalsIgnoreCase(request.getMethod());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        try {
            request.getParameterMap().values().stream()
                    .flatMap(Arrays::stream)
                    .forEach(this::rejectDangerousInput);
        } catch (BadRequestException ex) {
            response.setStatus(400);
            response.setContentType("application/json");
            response.getWriter().write("{\"success\":false,\"message\":\"Request contains unsafe input.\"}");
            return;
        }
        filterChain.doFilter(request, response);
    }

    private void rejectDangerousInput(String value) {
        if (value == null) {
            return;
        }
        DANGEROUS_PATTERNS.stream()
                .filter(pattern -> pattern.matcher(value).find())
                .findFirst()
                .ifPresent(pattern -> {
                    throw new BadRequestException("Request contains unsafe input.");
                });
    }
}
