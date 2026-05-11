package com.visitor.management.controller;

import com.visitor.management.dto.ApiResponse;
import com.visitor.management.dto.OrganizationRequest;
import com.visitor.management.dto.OrganizationResponse;
import com.visitor.management.service.OrganizationService;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping({"/api/v1/organizations", "/organizations"})
public class OrganizationController {

    private final OrganizationService organizationService;

    public OrganizationController(OrganizationService organizationService) {
        this.organizationService = organizationService;
    }

    @GetMapping("/public")
    public ApiResponse<List<OrganizationResponse>> publicOrganizations() {
        return ApiResponse.ok("Active organizations loaded.", organizationService.listPublicActive());
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN')")
    public ApiResponse<List<OrganizationResponse>> organizations(Authentication authentication) {
        return ApiResponse.ok("Organizations loaded.", organizationService.listAccessible(authentication.getName()));
    }

    @PostMapping
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ApiResponse<OrganizationResponse> create(@Valid @RequestBody OrganizationRequest request) {
        return ApiResponse.ok("Organization created.", organizationService.create(request));
    }
}
