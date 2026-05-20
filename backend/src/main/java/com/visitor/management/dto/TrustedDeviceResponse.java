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
        String organizationId,
        String organizationName,
        String userId,
        String registeredByName,
        String trustStatus,
        boolean trusted,
        boolean active,
        boolean biometricEnabled,
        boolean currentDevice,
        boolean suspicious,
        String deviceCategory,
        String operationalRole,
        String checkpointId,
        String checkpointName,
        String operationalZone,
        boolean sharedOperationalDevice,
        boolean scannerFirst,
        boolean restrictedNavigation,
        boolean autoRestoreScanner,
        Integer inactivityTimeoutSeconds,
        Instant lastActiveAt,
        Instant trustEstablishedAt,
        Instant trustRevokedAt,
        String revokedReason,
        Instant disabledAt,
        String disabledReason,
        Instant policyUpdatedAt,
        DeviceIntegritySignalsResponse integritySignals
) {
}
