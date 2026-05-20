package com.visitor.management.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record NotificationDeviceRegistrationRequest(
        @Size(max = 255) String expoPushToken,
        @Size(max = 512) String fcmToken,
        @Size(max = 32) String pushProvider,
        @NotBlank @Size(max = 120) String deviceId,
        @Size(max = 120) String deviceName,
        @NotBlank @Size(max = 24) String platform,
        @Size(max = 32) String appVersion,
        @Size(max = 32) String runtimeVersion,
        @Size(max = 120) String projectId,
        @NotBlank @Size(max = 24) String permissionStatus
) {
}
