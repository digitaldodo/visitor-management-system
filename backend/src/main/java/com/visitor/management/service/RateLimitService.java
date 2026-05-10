package com.visitor.management.service;

import com.visitor.management.exception.TooManyRequestsException;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Service
public class RateLimitService {

    private final ConcurrentMap<String, Window> windows = new ConcurrentHashMap<>();

    public void check(String scope, String key, int maxAttempts, Duration duration) {
        Instant now = Instant.now();
        String bucketKey = scope + ":" + normalize(key);
        Window window = windows.compute(bucketKey, (ignored, existing) -> {
            if (existing == null || !existing.resetAt.isAfter(now)) {
                return new Window(1, now.plus(duration));
            }
            existing.count++;
            return existing;
        });

        if (window.count > maxAttempts) {
            throw new TooManyRequestsException("Too many requests. Please wait before trying again.");
        }

        if (windows.size() > 10_000) {
            windows.entrySet().removeIf(entry -> !entry.getValue().resetAt.isAfter(now));
        }
    }

    private String normalize(String key) {
        if (key == null || key.isBlank()) {
            return "unknown";
        }
        return key.trim().toLowerCase(Locale.ROOT);
    }

    private static class Window {
        private int count;
        private final Instant resetAt;

        private Window(int count, Instant resetAt) {
            this.count = count;
            this.resetAt = resetAt;
        }
    }
}
