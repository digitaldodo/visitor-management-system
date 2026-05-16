package com.visitor.management.controller;

import com.visitor.management.config.AppProperties;
import com.visitor.management.dto.ApiResponse;
import com.visitor.management.dto.MobileSessionPolicyResponse;
import com.visitor.management.dto.MobileTelemetryRequest;
import com.visitor.management.dto.MobileTelemetryResponse;
import com.visitor.management.entity.AccountStatus;
import com.visitor.management.entity.MobileDeviceRegistration;
import com.visitor.management.entity.User;
import com.visitor.management.repository.MobileDeviceRegistrationRepository;
import com.visitor.management.repository.UserRepository;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Locale;

@RestController
@RequestMapping("/api/v1/mobile")
public class MobileOperationsController {

    private static final Logger log = LoggerFactory.getLogger(MobileOperationsController.class);

    private final UserRepository userRepository;
    private final MobileDeviceRegistrationRepository mobileDeviceRegistrationRepository;
    private final AppProperties appProperties;

    public MobileOperationsController(
            UserRepository userRepository,
            MobileDeviceRegistrationRepository mobileDeviceRegistrationRepository,
            AppProperties appProperties
    ) {
        this.userRepository = userRepository;
        this.mobileDeviceRegistrationRepository = mobileDeviceRegistrationRepository;
        this.appProperties = appProperties;
    }

    @PostMapping("/telemetry")
    public ApiResponse<MobileTelemetryResponse> telemetry(
            @Valid @RequestBody MobileTelemetryRequest request,
            Authentication authentication
    ) {
        int diagnosticCount = request.diagnostics() == null ? 0 : request.diagnostics().size();
        int metricCount = request.metrics() == null ? 0 : request.metrics().size();
        int accepted = diagnosticCount + metricCount;

        if (accepted > 0 && log.isInfoEnabled()) {
            log.info(
                    "Accepted mobile telemetry batch for user {}: diagnostics={}, metrics={}",
                    authentication.getName(),
                    diagnosticCount,
                    metricCount
            );
        }

        return ApiResponse.ok("Mobile telemetry accepted.", new MobileTelemetryResponse(accepted));
    }

    @GetMapping("/session-policy")
    public ApiResponse<MobileSessionPolicyResponse> sessionPolicy(
            @RequestParam(required = false) String deviceId,
            Authentication authentication
    ) {
        User user = userRepository.findById(authentication.getName()).orElse(null);
        boolean sessionValid = user != null && user.isActive() && user.getAccountStatus() == AccountStatus.ACTIVE;
        List<MobileDeviceRegistration> devices = mobileDeviceRegistrationRepository.findAllByUserId(authentication.getName());
        long activeSessions = devices.stream().filter(MobileDeviceRegistration::isActive).count();
        boolean suspicious = activeSessions > appProperties.getMobile().getSuspiciousConcurrentSessionThreshold();

        MobileSessionPolicyResponse response = new MobileSessionPolicyResponse(
                sessionValid,
                !sessionValid,
                sessionValid ? null : "user-revoked-or-disabled",
                suspicious,
                Math.toIntExact(Math.min(activeSessions, Integer.MAX_VALUE)),
                resolveManagedMode(deviceId),
                false,
                true
        );

        return ApiResponse.ok("Mobile session policy loaded.", response);
    }

    private String resolveManagedMode(String deviceId) {
        String normalized = deviceId == null ? "" : deviceId.toLowerCase(Locale.ROOT);
        if (normalized.contains("kiosk")) {
            return "kiosk-ready";
        }
        if (normalized.contains("guard")) {
            return "shared-guard";
        }
        return "personal";
    }
}
