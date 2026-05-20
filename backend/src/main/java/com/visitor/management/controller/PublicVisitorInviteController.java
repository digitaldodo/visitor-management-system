package com.visitor.management.controller;

import com.visitor.management.dto.ApiResponse;
import com.visitor.management.dto.VisitorInviteRegistrationRequest;
import com.visitor.management.dto.VisitorInviteResponse;
import com.visitor.management.dto.VisitorPhotoUploadResponse;
import com.visitor.management.service.CloudinaryUploadService;
import com.visitor.management.service.VisitorInviteService;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/public/visitor-invites")
public class PublicVisitorInviteController {

    private final VisitorInviteService visitorInviteService;
    private final CloudinaryUploadService cloudinaryUploadService;

    public PublicVisitorInviteController(
            VisitorInviteService visitorInviteService,
            CloudinaryUploadService cloudinaryUploadService
    ) {
        this.visitorInviteService = visitorInviteService;
        this.cloudinaryUploadService = cloudinaryUploadService;
    }

    @GetMapping("/{token}")
    public ApiResponse<VisitorInviteResponse> invite(@PathVariable String token) {
        return ApiResponse.ok("Visitor invite loaded.", visitorInviteService.viewPublic(token));
    }

    @PostMapping("/{token}/registration")
    public ApiResponse<VisitorInviteResponse> completeRegistration(
            @PathVariable String token,
            @Valid @RequestBody VisitorInviteRegistrationRequest request
    ) {
        return ApiResponse.ok("Visitor pre-registration completed.", visitorInviteService.completeRegistration(token, request));
    }

    @PostMapping(value = "/{token}/photo", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<VisitorPhotoUploadResponse> uploadInvitePhoto(
            @PathVariable String token,
            @RequestPart("file") MultipartFile file
    ) {
        visitorInviteService.validatePhotoUploadToken(token);
        return ApiResponse.ok("Visitor invite photo uploaded.", cloudinaryUploadService.uploadVisitorPhoto(file));
    }
}
