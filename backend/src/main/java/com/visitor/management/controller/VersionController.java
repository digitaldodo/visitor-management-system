package com.visitor.management.controller;

import com.visitor.management.dto.ApiResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class VersionController {

    private final String activeProfile;

    public VersionController(@Value("${spring.profiles.active:default}") String activeProfile) {
        this.activeProfile = activeProfile;
    }

    @GetMapping("/versions")
    public ApiResponse<Map<String, Object>> versions() {
        return ApiResponse.ok("API versions loaded.", Map.of(
                "current", "v1",
                "supported", List.of("v1"),
                "profile", activeProfile
        ));
    }
}
