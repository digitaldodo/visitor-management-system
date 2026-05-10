package com.visitor.management.controller;

import com.visitor.management.dto.ApiResponse;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.lang.management.ManagementFactory;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/health")
public class HealthController {

    private final MongoTemplate mongoTemplate;
    private final String activeProfile;

    public HealthController(MongoTemplate mongoTemplate, @Value("${spring.profiles.active:default}") String activeProfile) {
        this.mongoTemplate = mongoTemplate;
        this.activeProfile = activeProfile;
    }

    @GetMapping
    public ApiResponse<Map<String, Object>> health() {
        return ApiResponse.ok("Backend is running.", base("UP"));
    }

    @GetMapping("/live")
    public ApiResponse<Map<String, Object>> live() {
        return ApiResponse.ok("Application is live.", base("UP"));
    }

    @GetMapping("/ready")
    public ApiResponse<Map<String, Object>> ready() {
        String database = "UP";
        try {
            mongoTemplate.getDb().runCommand(new org.bson.Document("ping", 1));
        } catch (RuntimeException ex) {
            database = "DOWN";
        }
        return ApiResponse.ok("Readiness checked.", Map.of(
                "status", "UP".equals(database) ? "UP" : "DEGRADED",
                "database", database,
                "profile", activeProfile,
                "uptimeMs", ManagementFactory.getRuntimeMXBean().getUptime(),
                "checkedAt", Instant.now()
        ));
    }

    private Map<String, Object> base(String status) {
        return Map.of(
                "status", status,
                "profile", activeProfile,
                "uptimeMs", ManagementFactory.getRuntimeMXBean().getUptime(),
                "checkedAt", Instant.now()
        );
    }
}
