package com.visitor.management.controller;

import com.visitor.management.dto.ApiResponse;
import com.visitor.management.dto.NotificationListResponse;
import com.visitor.management.service.NotificationService;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
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
}
