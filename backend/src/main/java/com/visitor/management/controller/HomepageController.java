package com.visitor.management.controller;

import com.visitor.management.dto.ApiResponse;
import com.visitor.management.dto.HomepageSettingsRequest;
import com.visitor.management.service.HomepageService;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/homepage")
public class HomepageController {

    private final HomepageService homepageService;

    public HomepageController(HomepageService homepageService) {
        this.homepageService = homepageService;
    }

    @GetMapping
    public ApiResponse<Map<String, Object>> publicHomepage() {
        return ApiResponse.ok("Homepage content loaded.", homepageService.publicHomepage());
    }

    @GetMapping("/settings")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ApiResponse<Map<String, Object>> adminSettings() {
        return ApiResponse.ok("Homepage settings loaded.", homepageService.adminSettings());
    }

    @PutMapping("/settings")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ApiResponse<Map<String, Object>> updateSettings(@Valid @RequestBody HomepageSettingsRequest request, Authentication authentication) {
        return ApiResponse.ok("Homepage settings updated.", homepageService.updateSettings(request, authentication));
    }
}
