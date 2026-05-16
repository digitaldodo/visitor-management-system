package com.visitor.management.controller;

import com.visitor.management.dto.ApiResponse;
import com.visitor.management.dto.ActionResponse;
import com.visitor.management.dto.NotificationDeviceRegistrationRequest;
import com.visitor.management.dto.NotificationDeviceUnregistrationRequest;
import com.visitor.management.dto.NotificationListResponse;
import com.visitor.management.service.NotificationService;
import jakarta.validation.Valid;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationController {

    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @GetMapping
    public ApiResponse<NotificationListResponse> notifications(
            @RequestParam(defaultValue = "10") int limit,
            Authentication authentication
    ) {
        return ApiResponse.ok("Notifications loaded.", notificationService.listForUser(authentication.getName(), limit));
    }

    @PatchMapping("/{id}/read")
    public ApiResponse<NotificationListResponse> markRead(@PathVariable String id, Authentication authentication) {
        return ApiResponse.ok("Notification marked read.", notificationService.markRead(authentication.getName(), id));
    }

    @PatchMapping("/read-all")
    public ApiResponse<NotificationListResponse> markAllRead(Authentication authentication) {
        return ApiResponse.ok("Notifications marked read.", notificationService.markAllRead(authentication.getName()));
    }

    @PostMapping("/devices")
    public ApiResponse<ActionResponse> registerDevice(
            @Valid @RequestBody NotificationDeviceRegistrationRequest request,
            Authentication authentication
    ) {
        notificationService.registerDevice(authentication.getName(), request);
        return ApiResponse.ok("Mobile notification device registered.", ActionResponse.ok());
    }

    @PostMapping("/devices/unregister")
    public ApiResponse<ActionResponse> unregisterDevice(
            @Valid @RequestBody NotificationDeviceUnregistrationRequest request,
            Authentication authentication
    ) {
        notificationService.unregisterDevice(authentication.getName(), request);
        return ApiResponse.ok("Mobile notification device unregistered.", ActionResponse.ok());
    }
}
