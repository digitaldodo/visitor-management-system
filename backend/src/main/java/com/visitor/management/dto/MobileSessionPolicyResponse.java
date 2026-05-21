package com.visitor.management.dto;

public record MobileSessionPolicyResponse(
        boolean sessionValid,
        boolean forceLogout,
        String reason,
        boolean suspiciousDevice,
        int concurrentSessionCount,
        String managedMode,
        boolean kioskModeReady,
        boolean operationalModeEnabled,
        boolean remoteLogoutSupported
) {
}
