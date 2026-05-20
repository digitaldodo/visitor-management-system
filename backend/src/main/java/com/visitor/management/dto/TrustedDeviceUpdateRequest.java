package com.visitor.management.dto;

import jakarta.validation.constraints.Size;

public record TrustedDeviceUpdateRequest(
        @Size(max = 120) String deviceName,
        @Size(max = 32) String deviceCategory,
        @Size(max = 32) String operationalRole,
        @Size(max = 80) String checkpointId,
        @Size(max = 120) String checkpointName,
        @Size(max = 120) String operationalZone,
        Boolean trusted,
        Boolean active,
        @Size(max = 32) String trustStatus,
        Boolean sharedOperationalDevice,
        Boolean scannerFirst,
        Boolean restrictedNavigation,
        Boolean autoRestoreScanner,
        Integer inactivityTimeoutSeconds,
        @Size(max = 240) String reason
) {
}
