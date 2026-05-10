package com.visitor.management.controller;

import com.visitor.management.dto.ApiResponse;
import com.visitor.management.dto.PageResponse;
import com.visitor.management.dto.SearchRequest;
import com.visitor.management.dto.VisitorCreateRequest;
import com.visitor.management.dto.VisitorResponse;
import com.visitor.management.dto.VisitorPhotoUploadResponse;
import com.visitor.management.dto.VisitorUpdateRequest;
import com.visitor.management.service.AnalyticsService;
import com.visitor.management.service.CloudinaryUploadService;
import com.visitor.management.service.VisitorService;
import jakarta.validation.Valid;
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
@PreAuthorize("hasRole('ADMIN')")
public class AdminController {

    private final VisitorService visitorService;
    private final CloudinaryUploadService cloudinaryUploadService;
    private final AnalyticsService analyticsService;

    public AdminController(VisitorService visitorService, CloudinaryUploadService cloudinaryUploadService, AnalyticsService analyticsService) {
        this.visitorService = visitorService;
        this.cloudinaryUploadService = cloudinaryUploadService;
        this.analyticsService = analyticsService;
    }

    @GetMapping("/overview")
    public ApiResponse<Map<String, Object>> overview() {
        return ApiResponse.ok("Admin overview loaded.", Map.of(
                "area", "ADMIN",
                "metrics", visitorService.metrics()
        ));
    }

    @GetMapping("/analytics")
    public ApiResponse<Map<String, Object>> analytics() {
        return ApiResponse.ok("Admin analytics loaded.", analyticsService.adminDashboard());
    }

    @GetMapping("/users")
    public ApiResponse<List<Map<String, Object>>> users() {
        return ApiResponse.ok("Admin user management loaded.", List.of(
                Map.of("name", "Aarav Mehta", "role", "EMPLOYEE", "status", "Active"),
                Map.of("name", "Nisha Rao", "role", "SECURITY_GUARD", "status", "Active"),
                Map.of("name", "Rohan Sen", "role", "ADMIN", "status", "Active")
        ));
    }

    @GetMapping("/reports")
    public ApiResponse<List<Map<String, String>>> reports() {
        return ApiResponse.ok("Admin reports loaded.", List.of(
                Map.of("title", "Daily visitor summary", "status", "Ready"),
                Map.of("title", "Department traffic", "status", "Ready"),
                Map.of("title", "Badge exception audit", "status", "Review")
        ));
    }

    @GetMapping("/monitoring")
    public ApiResponse<Map<String, Object>> monitoring() {
        return ApiResponse.ok("Admin system monitoring loaded.", Map.of(
                "api", "UP",
                "database", "UP",
                "cameraBridge", "READY",
                "badgePrinter", "READY",
                "visitors", visitorService.statusSummary()
        ));
    }

    @GetMapping("/visitors")
    public ApiResponse<PageResponse<VisitorResponse>> visitors(@Valid @ModelAttribute SearchRequest request) {
        return ApiResponse.ok("Admin visitor records loaded.", visitorService.search(request));
    }

    @GetMapping("/visitors/{id}")
    public ApiResponse<VisitorResponse> visitor(@PathVariable String id) {
        return ApiResponse.ok("Admin visitor loaded.", visitorService.get(id));
    }

    @PostMapping("/visitors")
    public ApiResponse<VisitorResponse> createVisitor(@Valid @RequestBody VisitorCreateRequest request) {
        return ApiResponse.ok("Visitor registered.", visitorService.create(request));
    }

    @PostMapping(value = "/visitors/photo", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<VisitorPhotoUploadResponse> uploadVisitorPhoto(@RequestPart("file") MultipartFile file) {
        return ApiResponse.ok("Visitor photo uploaded.", cloudinaryUploadService.uploadVisitorPhoto(file));
    }

    @PutMapping("/visitors/{id}")
    public ApiResponse<VisitorResponse> updateVisitor(@PathVariable String id, @Valid @RequestBody VisitorUpdateRequest request) {
        return ApiResponse.ok("Visitor updated.", visitorService.update(id, request));
    }

    @PatchMapping("/visitors/{id}/check-in")
    public ApiResponse<VisitorResponse> checkInVisitor(@PathVariable String id) {
        return ApiResponse.ok("Visitor checked in.", visitorService.checkIn(id));
    }

    @PatchMapping("/visitors/{id}/check-out")
    public ApiResponse<VisitorResponse> checkOutVisitor(@PathVariable String id) {
        return ApiResponse.ok("Visitor checked out.", visitorService.checkOut(id));
    }

    @DeleteMapping("/visitors/{id}")
    public ApiResponse<Void> deleteVisitor(@PathVariable String id) {
        visitorService.delete(id);
        return ApiResponse.ok("Visitor deleted.", null);
    }
}
