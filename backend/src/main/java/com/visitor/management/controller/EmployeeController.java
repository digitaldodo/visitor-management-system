package com.visitor.management.controller;

import com.visitor.management.dto.ApiResponse;
import com.visitor.management.dto.PageResponse;
import com.visitor.management.dto.SearchRequest;
import com.visitor.management.dto.VisitorCreateRequest;
import com.visitor.management.dto.VisitorPhotoUploadResponse;
import com.visitor.management.dto.VisitorResponse;
import com.visitor.management.dto.VisitorUpdateRequest;
import com.visitor.management.service.CloudinaryUploadService;
import com.visitor.management.service.VisitorService;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/employee")
@PreAuthorize("hasRole('EMPLOYEE')")
public class EmployeeController {

    private final VisitorService visitorService;
    private final CloudinaryUploadService cloudinaryUploadService;

    public EmployeeController(VisitorService visitorService, CloudinaryUploadService cloudinaryUploadService) {
        this.visitorService = visitorService;
        this.cloudinaryUploadService = cloudinaryUploadService;
    }

    @GetMapping("/overview")
    public ApiResponse<Map<String, Object>> overview() {
        return ApiResponse.ok("Employee overview loaded.", Map.of(
                "area", "EMPLOYEE",
                "metrics", visitorService.metrics()
        ));
    }

    @GetMapping("/approvals")
    public ApiResponse<List<Map<String, String>>> approvals() {
        return ApiResponse.ok("Employee approvals loaded.", List.of(
                Map.of("visitor", "Isha Nair", "purpose", "Interview", "status", "Pending"),
                Map.of("visitor", "Dev Patel", "purpose", "Vendor review", "status", "Pending")
        ));
    }

    @GetMapping("/pre-approvals")
    public ApiResponse<List<Map<String, String>>> preApprovals() {
        return ApiResponse.ok("Employee pre-approvals loaded.", List.of(
                Map.of("visitor", "Sana Khan", "date", "2026-05-12", "status", "Approved"),
                Map.of("visitor", "Arjun Bose", "date", "2026-05-13", "status", "Draft")
        ));
    }

    @GetMapping("/notifications")
    public ApiResponse<List<Map<String, String>>> notifications() {
        return ApiResponse.ok("Employee notifications loaded.", List.of(
                Map.of("title", "Visitor arrived", "message", "Isha Nair is waiting at reception."),
                Map.of("title", "Approval reminder", "message", "Dev Patel needs approval.")
        ));
    }

    @GetMapping("/scheduled-visitors")
    public ApiResponse<List<Map<String, String>>> scheduledVisitors() {
        return ApiResponse.ok("Employee scheduled visitors loaded.", List.of(
                Map.of("visitor", "Sana Khan", "time", "10:30", "status", "Scheduled"),
                Map.of("visitor", "Arjun Bose", "time", "14:00", "status", "Scheduled")
        ));
    }

    @GetMapping("/history")
    public ApiResponse<PageResponse<VisitorResponse>> history(@Valid @ModelAttribute SearchRequest request, Authentication authentication) {
        return ApiResponse.ok("Employee visitor history loaded.", visitorService.search(request, authentication.getName()));
    }

    @GetMapping("/visitors")
    public ApiResponse<PageResponse<VisitorResponse>> visitors(@Valid @ModelAttribute SearchRequest request, Authentication authentication) {
        return ApiResponse.ok("Employee visitor records loaded.", visitorService.search(request, authentication.getName()));
    }

    @GetMapping("/visitors/{id}")
    public ApiResponse<VisitorResponse> visitor(@PathVariable String id, Authentication authentication) {
        return ApiResponse.ok("Employee visitor loaded.", visitorService.getForHost(id, authentication.getName()));
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
    public ApiResponse<VisitorResponse> updateVisitor(
            @PathVariable String id,
            @Valid @RequestBody VisitorUpdateRequest request,
            Authentication authentication
    ) {
        return ApiResponse.ok("Visitor updated.", visitorService.updateForHost(id, request, authentication.getName()));
    }
}
