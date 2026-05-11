package com.visitor.management.controller;

import com.visitor.management.dto.ApiResponse;
import com.visitor.management.dto.EmployeeDirectoryEntryResponse;
import com.visitor.management.dto.PageResponse;
import com.visitor.management.dto.QrVerificationRequest;
import com.visitor.management.dto.QrVerificationResponse;
import com.visitor.management.dto.SearchRequest;
import com.visitor.management.dto.SecurityMonitoringResponse;
import com.visitor.management.dto.VisitorCreateRequest;
import com.visitor.management.dto.VisitorHistorySummaryResponse;
import com.visitor.management.dto.VisitorPassResponse;
import com.visitor.management.dto.VisitorPhotoUploadResponse;
import com.visitor.management.dto.VisitorResponse;
import com.visitor.management.dto.VisitorUpdateRequest;
import com.visitor.management.entity.VisitorStatus;
import com.visitor.management.service.CloudinaryUploadService;
import com.visitor.management.service.VisitorService;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RequestParam;
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
    public ApiResponse<Map<String, Object>> overview(Authentication authentication) {
        return ApiResponse.ok("Security overview loaded.", Map.of(
                "area", "SECURITY_GUARD",
                "metrics", visitorService.metrics(authentication.getName())
        ));
    }

    @GetMapping("/checkins")
    public ApiResponse<PageResponse<VisitorResponse>> checkins(@Valid @ModelAttribute SearchRequest request, Authentication authentication) {
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
        return ApiResponse.ok("Security check-in records loaded.", visitorService.search(checkedIn, authentication.getName()));
    }

    @GetMapping("/photo-capture")
    public ApiResponse<Map<String, String>> photoCapture() {
        return ApiResponse.ok("Security webcam capture endpoint authorized.", Map.of(
                "cameraStatus", "READY",
                "storagePolicy", "Visitor photos are isolated to security workflows."
        ));
    }

    @PostMapping("/qr-verification")
    public ApiResponse<QrVerificationResponse> qrVerification(@Valid @RequestBody QrVerificationRequest request, Authentication authentication) {
        return ApiResponse.ok("Security QR verification completed.", visitorService.verifyQrPayload(request.qrPayload(), authentication.getName()));
    }

    @GetMapping("/badges")
    public ApiResponse<PageResponse<VisitorResponse>> badges(@Valid @ModelAttribute SearchRequest request, Authentication authentication) {
        SearchRequest approved = new SearchRequest(
                request.query(),
                request.page(),
                request.size(),
                request.sortBy(),
                request.direction(),
                VisitorStatus.APPROVED,
                request.hostEmployeeId(),
                request.from(),
                request.to()
        );
        return ApiResponse.ok("Security badge queue loaded.", visitorService.search(approved, authentication.getName()));
    }

    @GetMapping("/queue")
    public ApiResponse<PageResponse<VisitorResponse>> queue(@Valid @ModelAttribute SearchRequest request, Authentication authentication) {
        SearchRequest scheduled = new SearchRequest(
                request.query(),
                request.page(),
                request.size(),
                request.sortBy(),
                request.direction(),
                VisitorStatus.APPROVED,
                request.hostEmployeeId(),
                request.from(),
                request.to()
        );
        return ApiResponse.ok("Security live visitor queue loaded.", visitorService.search(scheduled, authentication.getName()));
    }

    @GetMapping("/visitors")
    public ApiResponse<PageResponse<VisitorResponse>> visitors(@Valid @ModelAttribute SearchRequest request, Authentication authentication) {
        return ApiResponse.ok("Security visitor records loaded.", visitorService.search(request, authentication.getName()));
    }

    @GetMapping("/monitoring")
    public ApiResponse<SecurityMonitoringResponse> monitoring(@RequestParam(required = false) String query, Authentication authentication) {
        return ApiResponse.ok("Security monitoring loaded.", visitorService.securityMonitoring(authentication.getName(), query));
    }

    @GetMapping("/hosts")
    public ApiResponse<List<EmployeeDirectoryEntryResponse>> hosts(@RequestParam(required = false) String query, Authentication authentication) {
        return ApiResponse.ok("Host directory loaded.", visitorService.searchHosts(query, null, authentication.getName()));
    }

    @GetMapping("/visitors/{id}")
    public ApiResponse<VisitorResponse> visitor(@PathVariable String id, Authentication authentication) {
        return ApiResponse.ok("Security visitor loaded.", visitorService.get(id, authentication.getName()));
    }

    @GetMapping("/visitors/{id}/history")
    public ApiResponse<VisitorHistorySummaryResponse> visitorHistory(@PathVariable String id, Authentication authentication) {
        return ApiResponse.ok("Visitor history loaded.", visitorService.visitorHistory(id, authentication.getName()));
    }

    @GetMapping("/visitors/{id}/pass")
    public ApiResponse<VisitorPassResponse> visitorPass(@PathVariable String id, Authentication authentication) {
        return ApiResponse.ok("Visitor pass generated.", visitorService.pass(id, authentication.getName()));
    }

    @PatchMapping("/visitors/{id}/badge-printed")
    public ApiResponse<VisitorPassResponse> markBadgePrinted(@PathVariable String id, Authentication authentication) {
        return ApiResponse.ok("Badge print recorded.", visitorService.markBadgePrinted(id, authentication.getName()));
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
}
