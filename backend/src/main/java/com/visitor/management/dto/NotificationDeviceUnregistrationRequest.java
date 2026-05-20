package com.visitor.management.dto;

import jakarta.validation.constraints.Size;

public record NotificationDeviceUnregistrationRequest(
        @Size(max = 255) String expoPushToken,
        @Size(max = 512) String fcmToken,
        @Size(max = 120) String deviceId
) {
}
