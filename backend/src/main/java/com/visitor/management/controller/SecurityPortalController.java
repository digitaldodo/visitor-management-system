package com.visitor.management.controller;

import com.visitor.management.dto.ApiResponse;
import com.visitor.management.dto.PageResponse;
import com.visitor.management.dto.SearchRequest;
import com.visitor.management.dto.VisitorCreateRequest;
import com.visitor.management.dto.VisitorPhotoUploadResponse;
import com.visitor.management.dto.VisitorResponse;
import com.visitor.management.dto.VisitorUpdateRequest;
import com.visitor.management.entity.VisitorStatus;
import com.visitor.management.service.CloudinaryUploadService;
import com.visitor.management.service.VisitorService;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PatchMapping;
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
@RequestMapping("/api/v1/security")
@PreAuthorize("hasRole('SECURITY_GUARD')")
public class SecurityPortalController {

    private final VisitorService visitorService;
    private final CloudinaryUploadService cloudinaryUploadService;

    public SecurityPortalController(VisitorService visitorService, CloudinaryUploadService cloudinaryUploadService) {
        this.visitorService = visitorService;
        this.cloudinaryUploadService = cloudinaryUploadService;
    }

    @GetMapping("/overview")
    public ApiResponse<Map<String, Object>> overview() {
        return ApiResponse.ok("Security overview loaded.", Map.of(
                "area", "SECURITY_GUARD",
                "metrics", visitorService.metrics()
        ));
    }

    @GetMapping("/checkins")
    public ApiResponse<PageResponse<VisitorResponse>> checkins(@Valid @ModelAttribute SearchRequest request) {
        SearchRequest checkedIn = new SearchRequest(
                request.query(),
                request.page(),
                request.size(),
                request.sortBy(),
                request.direction(),
                VisitorStatus.CHECKED_IN,
                request.hostEmployeeId(),
                request.from(),
                request.to()
        );
        return ApiResponse.ok("Security check-in records loaded.", visitorService.search(checkedIn));
    }

    @GetMapping("/photo-capture")
    public ApiResponse<Map<String, String>> photoCapture() {
        return ApiResponse.ok("Security webcam capture endpoint authorized.", Map.of(
                "cameraStatus", "READY",
                "storagePolicy", "Visitor photos are isolated to security workflows."
        ));
    }

    @GetMapping("/qr-verification")
    public ApiResponse<List<Map<String, String>>> qrVerification() {
        return ApiResponse.ok("Security QR verification loaded.", List.of(
                Map.of("code", "VST-1029", "status", "Valid"),
                Map.of("code", "VST-1030", "status", "Pending scan")
        ));
    }

    @GetMapping("/badges")
    public ApiResponse<Map<String, String>> badges() {
        return ApiResponse.ok("Security badge printing loaded.", Map.of(
                "printer", "READY",
                "lastBadge", "VST-1028"
        ));
    }

    @GetMapping("/queue")
    public ApiResponse<PageResponse<VisitorResponse>> queue(@Valid @ModelAttribute SearchRequest request) {
        SearchRequest scheduled = new SearchRequest(
                request.query(),
                request.page(),
                request.size(),
                request.sortBy(),
                request.direction(),
                VisitorStatus.SCHEDULED,
                request.hostEmployeeId(),
                request.from(),
                request.to()
        );
        return ApiResponse.ok("Security live visitor queue loaded.", visitorService.search(scheduled));
    }

    @GetMapping("/visitors")
    public ApiResponse<PageResponse<VisitorResponse>> visitors(@Valid @ModelAttribute SearchRequest request) {
        return ApiResponse.ok("Security visitor records loaded.", visitorService.search(request));
    }

    @GetMapping("/visitors/{id}")
    public ApiResponse<VisitorResponse> visitor(@PathVariable String id) {
        return ApiResponse.ok("Security visitor loaded.", visitorService.get(id));
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
}
