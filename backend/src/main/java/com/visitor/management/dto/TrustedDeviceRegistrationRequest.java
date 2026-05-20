package com.visitor.management.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record TrustedDeviceRegistrationRequest(
        @NotBlank @Size(max = 120) String deviceId,
        @Size(max = 120) String deviceName,
        @Size(max = 32) String deviceType,
        @NotBlank @Size(max = 24) String platform,
        @Size(max = 40) String platformVersion,
        @Size(max = 32) String appVersion,
        @Size(max = 32) String runtimeVersion,
        @NotBlank @Size(max = 512) String fingerprint,
        boolean biometricEnabled,
        @Valid DeviceIntegritySignalsRequest integritySignals
) {
}
