package com.visitor.management.controller;

import com.visitor.management.dto.AdminPasswordResetRequest;
import com.visitor.management.dto.AdminUserCreateRequest;
import com.visitor.management.dto.AdminUserResponse;
import com.visitor.management.dto.AdminUserRoleUpdateRequest;
import com.visitor.management.dto.ApiResponse;
import com.visitor.management.dto.HomepageSettingsRequest;
import com.visitor.management.dto.PageResponse;
import com.visitor.management.dto.SearchRequest;
import com.visitor.management.dto.VisitorCreateRequest;
import com.visitor.management.dto.VisitorResponse;
import com.visitor.management.dto.VisitorPhotoUploadResponse;
import com.visitor.management.dto.VisitorUpdateRequest;
import com.visitor.management.service.AnalyticsService;
import com.visitor.management.service.AdminUserService;
import com.visitor.management.service.CloudinaryUploadService;
import com.visitor.management.service.HomepageService;
import com.visitor.management.service.VisitorService;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.bind.annotation.RequestPart;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/admin")
@PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN')")
public class AdminController {

    private final VisitorService visitorService;
    private final CloudinaryUploadService cloudinaryUploadService;
    private final AnalyticsService analyticsService;
    private final AdminUserService adminUserService;
    private final HomepageService homepageService;

    public AdminController(
            VisitorService visitorService,
            CloudinaryUploadService cloudinaryUploadService,
            AnalyticsService analyticsService,
            AdminUserService adminUserService,
            HomepageService homepageService
    ) {
        this.visitorService = visitorService;
        this.cloudinaryUploadService = cloudinaryUploadService;
        this.analyticsService = analyticsService;
        this.adminUserService = adminUserService;
        this.homepageService = homepageService;
    }

    @GetMapping("/overview")
    public ApiResponse<Map<String, Object>> overview(Authentication authentication) {
        return ApiResponse.ok("Admin overview loaded.", Map.of(
                "area", "ADMIN",
                "metrics", visitorService.metrics(authentication.getName())
        ));
    }

    @GetMapping("/analytics")
    public ApiResponse<Map<String, Object>> analytics(Authentication authentication) {
        return ApiResponse.ok("Admin analytics loaded.", analyticsService.adminDashboard(authentication.getName()));
    }

    @GetMapping("/users")
    public ApiResponse<List<AdminUserResponse>> users(Authentication authentication) {
        return ApiResponse.ok("Admin user management loaded.", adminUserService.listUsers(authentication));
    }

    @PostMapping("/users")
    public ApiResponse<AdminUserResponse> createUser(@Valid @RequestBody AdminUserCreateRequest request, Authentication authentication) {
        return ApiResponse.ok("Internal account created.", adminUserService.createUser(request, authentication));
    }

    @PatchMapping("/users/{id}/disable")
    public ApiResponse<AdminUserResponse> disableUser(@PathVariable String id, Authentication authentication) {
        return ApiResponse.ok("Account disabled.", adminUserService.disableUser(id, authentication));
    }

    @PatchMapping("/users/{id}/enable")
    public ApiResponse<AdminUserResponse> enableUser(@PathVariable String id, Authentication authentication) {
        return ApiResponse.ok("Account enabled.", adminUserService.enableUser(id, authentication));
    }

    @PatchMapping("/users/{id}/reset-password")
    public ApiResponse<AdminUserResponse> resetPassword(
            @PathVariable String id,
            @Valid @RequestBody AdminPasswordResetRequest request,
            Authentication authentication
    ) {
        return ApiResponse.ok("Password reset.", adminUserService.resetPassword(id, request, authentication));
    }

    @PatchMapping("/users/{id}/role")
    public ApiResponse<AdminUserResponse> updateUserRole(
            @PathVariable String id,
            @Valid @RequestBody AdminUserRoleUpdateRequest request,
            Authentication authentication
    ) {
        return ApiResponse.ok("Account access updated.", adminUserService.updateRole(id, request, authentication));
    }

    @GetMapping("/reports")
    public ApiResponse<List<Map<String, String>>> reports() {
        return ApiResponse.ok("Admin reports loaded.", List.of());
    }

    @GetMapping("/monitoring")
    public ApiResponse<Map<String, Object>> monitoring(Authentication authentication) {
        return ApiResponse.ok("Admin system monitoring loaded.", Map.of(
                "api", "UP",
                "database", "UP",
                "cameraBridge", "READY",
                "badgePrinter", "READY",
                "visitors", visitorService.statusSummary(authentication.getName())
        ));
    }

    @GetMapping("/homepage-settings")
    public ApiResponse<Map<String, Object>> homepageSettings() {
        return ApiResponse.ok("Homepage settings loaded.", homepageService.adminSettings());
    }

    @PutMapping("/homepage-settings")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ApiResponse<Map<String, Object>> updateHomepageSettings(@Valid @RequestBody HomepageSettingsRequest request, Authentication authentication) {
        return ApiResponse.ok("Homepage settings updated.", homepageService.updateSettings(request, authentication));
    }

    @GetMapping("/visitors")
    public ApiResponse<PageResponse<VisitorResponse>> visitors(@Valid @ModelAttribute SearchRequest request, Authentication authentication) {
        return ApiResponse.ok("Admin visitor records loaded.", visitorService.search(request, authentication.getName()));
    }

    @GetMapping("/visitors/{id}")
    public ApiResponse<VisitorResponse> visitor(@PathVariable String id, Authentication authentication) {
        return ApiResponse.ok("Admin visitor loaded.", visitorService.get(id, authentication.getName()));
    }

    @PostMapping("/visitors")
    public ApiResponse<VisitorResponse> createVisitor(@Valid @RequestBody VisitorCreateRequest request, Authentication authentication) {
        return ApiResponse.ok("Visitor registered.", visitorService.create(request, authentication.getName()));
    }

    @PostMapping(value = "/visitors/photo", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<VisitorPhotoUploadResponse> uploadVisitorPhoto(@RequestPart("file") MultipartFile file) {
        return ApiResponse.ok("Visitor photo uploaded.", cloudinaryUploadService.uploadVisitorPhoto(file));
    }

    @PutMapping("/visitors/{id}")
    public ApiResponse<VisitorResponse> updateVisitor(@PathVariable String id, @Valid @RequestBody VisitorUpdateRequest request, Authentication authentication) {
        return ApiResponse.ok("Visitor updated.", visitorService.update(id, request, authentication.getName()));
    }

    @PatchMapping("/visitors/{id}/check-in")
    public ApiResponse<VisitorResponse> checkInVisitor(@PathVariable String id, Authentication authentication) {
        return ApiResponse.ok("Visitor checked in.", visitorService.checkIn(id, authentication.getName()));
    }

    @PatchMapping("/visitors/{id}/check-out")
    public ApiResponse<VisitorResponse> checkOutVisitor(@PathVariable String id, Authentication authentication) {
        return ApiResponse.ok("Visitor checked out.", visitorService.checkOut(id, authentication.getName()));
    }

    @DeleteMapping("/visitors/{id}")
    public ApiResponse<Void> deleteVisitor(@PathVariable String id, Authentication authentication) {
        visitorService.delete(id, authentication.getName());
        return ApiResponse.ok("Visitor deleted.", null);
    }

}
