package com.visitor.management.dto;

import java.time.Instant;

public record TrustedDeviceResponse(
        String id,
        String deviceId,
        String deviceName,
        String deviceType,
        String platform,
        String appVersion,
        String runtimeVersion,
        String trustStatus,
        boolean trusted,
        boolean active,
        boolean biometricEnabled,
        boolean currentDevice,
        boolean suspicious,
        Instant lastActiveAt,
        Instant trustEstablishedAt,
        Instant trustRevokedAt,
        String revokedReason,
        DeviceIntegritySignalsResponse integritySignals
) {
}
