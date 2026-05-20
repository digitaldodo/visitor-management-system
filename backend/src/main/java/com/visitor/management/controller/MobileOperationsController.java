package com.visitor.management.controller;

import com.visitor.management.config.AppProperties;
import com.visitor.management.dto.ApiResponse;
import com.visitor.management.dto.ActionResponse;
import com.visitor.management.dto.DeviceIntegritySignalsResponse;
import com.visitor.management.dto.MobileSessionPolicyResponse;
import com.visitor.management.dto.MobileTelemetryRequest;
import com.visitor.management.dto.MobileTelemetryResponse;
import com.visitor.management.dto.OperationalEventBatchResponse;
import com.visitor.management.dto.TrustedDeviceListResponse;
import com.visitor.management.dto.TrustedDeviceRegistrationRequest;
import com.visitor.management.dto.TrustedDeviceResponse;
import com.visitor.management.dto.TrustedDeviceUpdateRequest;
import com.visitor.management.entity.AccountStatus;
import com.visitor.management.entity.MobileDeviceRegistration;
import com.visitor.management.entity.Role;
import com.visitor.management.entity.User;
import com.visitor.management.repository.MobileDeviceRegistrationRepository;
import com.visitor.management.repository.UserRepository;
import com.visitor.management.service.OperationalEventStreamService;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;

@RestController
@RequestMapping("/api/v1/mobile")
public class MobileOperationsController {

    private static final Logger log = LoggerFactory.getLogger(MobileOperationsController.class);

    private final UserRepository userRepository;
    private final MobileDeviceRegistrationRepository mobileDeviceRegistrationRepository;
    private final OperationalEventStreamService operationalEventStreamService;
    private final AppProperties appProperties;

    public MobileOperationsController(
            UserRepository userRepository,
            MobileDeviceRegistrationRepository mobileDeviceRegistrationRepository,
            OperationalEventStreamService operationalEventStreamService,
            AppProperties appProperties
    ) {
        this.userRepository = userRepository;
        this.mobileDeviceRegistrationRepository = mobileDeviceRegistrationRepository;
        this.operationalEventStreamService = operationalEventStreamService;
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

    @GetMapping("/operations/events")
    public ApiResponse<OperationalEventBatchResponse> operationalEvents(
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "80") int limit,
            Authentication authentication
    ) {
        return ApiResponse.ok("Operational events loaded.", operationalEventStreamService.events(authentication.getName(), cursor, limit));
    }

    @GetMapping(value = "/operations/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter operationalStream(
            @RequestParam(required = false) String cursor,
            Authentication authentication
    ) {
        SseEmitter emitter = new SseEmitter(35_000L);
        try {
            OperationalEventBatchResponse batch = operationalEventStreamService.events(authentication.getName(), cursor, 80);
            emitter.send(SseEmitter.event()
                    .id(batch.cursor())
                    .name(batch.heartbeat() ? "heartbeat" : "operations")
                    .data(batch));
            emitter.complete();
        } catch (IOException ex) {
            emitter.completeWithError(ex);
        }
        return emitter;
    }

    @GetMapping("/session-policy")
    public ApiResponse<MobileSessionPolicyResponse> sessionPolicy(
            @RequestParam(required = false) String deviceId,
            Authentication authentication
    ) {
        User user = userRepository.findById(authentication.getName()).orElse(null);
        boolean sessionValid = user != null && user.isActive() && user.getAccountStatus() == AccountStatus.ACTIVE;
        List<MobileDeviceRegistration> devices = mobileDeviceRegistrationRepository.findAllByUserId(authentication.getName());
        List<MobileDeviceRegistration> organizationDevices = user != null && trimToNull(user.getOrganizationId()) != null
                ? mobileDeviceRegistrationRepository.findAllByOrganizationIdAndDeviceId(user.getOrganizationId(), trimToNull(deviceId))
                : List.of();
        Optional<MobileDeviceRegistration> currentDevice = findCurrentDevice(organizationDevices.isEmpty() ? devices : organizationDevices, deviceId);
        long activeSessions = devices.stream().filter(MobileDeviceRegistration::isActive).count();
        boolean suspicious = activeSessions > appProperties.getMobile().getSuspiciousConcurrentSessionThreshold()
                || currentDevice.map(MobileDeviceRegistration::isSuspicious).orElse(false);
        boolean enterpriseRole = user != null && hasEnterpriseMobileRole(user);
        boolean deviceRevoked = currentDevice
                .map(device -> "REVOKED".equalsIgnoreCase(trimToEmpty(device.getTrustStatus()))
                        || "DISABLED".equalsIgnoreCase(trimToEmpty(device.getTrustStatus()))
                        || !device.isActive())
                .orElse(false);
        boolean deviceTrusted = currentDevice
                .map(device -> device.isTrusted()
                        && device.isActive()
                        && !"REVOKED".equalsIgnoreCase(trimToEmpty(device.getTrustStatus()))
                        && !"DISABLED".equalsIgnoreCase(trimToEmpty(device.getTrustStatus())))
                .orElse(!enterpriseRole);
        String trustStatus = currentDevice.map(MobileDeviceRegistration::getTrustStatus)
                .filter(value -> value != null && !value.isBlank())
                .orElse(enterpriseRole ? "UNTRUSTED" : "OPTIONAL");
        if (deviceRevoked) {
            sessionValid = false;
        }
        currentDevice.ifPresent(device -> {
            Instant now = Instant.now();
            device.setLastSeenAt(now);
            device.setLastActiveAt(now);
            mobileDeviceRegistrationRepository.save(device);
        });

        String deviceCategory = currentDevice
                .map(device -> normalizeDeviceCategory(device.getDeviceCategory()))
                .orElse("PERSONAL_DEVICE");
        boolean operationalModeEnabled = currentDevice
                .map(this::isOperationalDeviceEnabled)
                .orElse(false);

        MobileSessionPolicyResponse response = new MobileSessionPolicyResponse(
                sessionValid,
                !sessionValid || deviceRevoked,
                sessionValid ? null : deviceRevoked ? "device-trust-revoked" : "user-revoked-or-disabled",
                suspicious,
                Math.toIntExact(Math.min(activeSessions, Integer.MAX_VALUE)),
                resolveManagedMode(deviceId, currentDevice.orElse(null)),
                operationalModeEnabled,
                true,
                deviceTrusted,
                enterpriseRole,
                trustStatus,
                deviceCategory,
                currentDevice.map(MobileDeviceRegistration::getOperationalRole).map(this::normalizeOperationalRole).orElse("PERSONAL"),
                currentDevice.map(MobileDeviceRegistration::getCheckpointId).orElse(null),
                currentDevice.map(MobileDeviceRegistration::getCheckpointName).orElse(null),
                currentDevice.map(MobileDeviceRegistration::getOperationalZone).orElse(null),
                operationalModeEnabled,
                currentDevice.map(MobileDeviceRegistration::isScannerFirst).orElse(false),
                currentDevice.map(MobileDeviceRegistration::isRestrictedNavigation).orElse(false),
                currentDevice.map(MobileDeviceRegistration::isAutoRestoreScanner).orElse(false),
                currentDevice.map(MobileDeviceRegistration::isSharedOperationalDevice).orElse(false),
                currentDevice.map(MobileDeviceRegistration::getInactivityTimeoutSeconds).orElse(null)
        );

        return ApiResponse.ok("Mobile session policy loaded.", response);
    }

    @GetMapping("/trusted-devices")
    public ApiResponse<TrustedDeviceListResponse> trustedDevices(
            @RequestParam(required = false) String currentDeviceId,
            Authentication authentication
    ) {
        User user = userRepository.findById(authentication.getName()).orElse(null);
        List<MobileDeviceRegistration> registrations = canManageOrganizationDevices(authentication, user)
                ? mobileDeviceRegistrationRepository.findAllByOrganizationId(user.getOrganizationId())
                : mobileDeviceRegistrationRepository.findAllByUserId(authentication.getName());
        List<TrustedDeviceResponse> devices = registrations
                .stream()
                .map(device -> toTrustedDeviceResponse(device, Objects.equals(device.getDeviceId(), currentDeviceId)))
                .toList();
        return ApiResponse.ok("Trusted devices loaded.", new TrustedDeviceListResponse(devices));
    }

    @PostMapping("/trusted-devices")
    public ApiResponse<TrustedDeviceResponse> registerTrustedDevice(
            @Valid @RequestBody TrustedDeviceRegistrationRequest request,
            Authentication authentication
    ) {
        Instant now = Instant.now();
        String deviceId = trimToNull(request.deviceId());
        User user = userRepository.findById(authentication.getName()).orElse(null);
        List<MobileDeviceRegistration> existingDevices = user != null && trimToNull(user.getOrganizationId()) != null
                ? mobileDeviceRegistrationRepository.findAllByOrganizationIdAndDeviceId(user.getOrganizationId(), deviceId)
                : mobileDeviceRegistrationRepository.findAllByUserIdAndDeviceId(authentication.getName(), deviceId);
        MobileDeviceRegistration device = existingDevices.isEmpty() ? new MobileDeviceRegistration() : existingDevices.getFirst();
        String selectedDeviceRegistrationId = device.getId();

        existingDevices.stream()
                .filter(existing -> !Objects.equals(existing.getId(), selectedDeviceRegistrationId))
                .forEach(existing -> revokeDevice(existing, "Superseded by trusted-device registration.", now));
        if (!existingDevices.isEmpty()) {
            mobileDeviceRegistrationRepository.saveAll(existingDevices);
        }

        device.setUserId(authentication.getName());
        device.setOrganizationId(user == null ? null : trimToNull(user.getOrganizationId()));
        device.setOrganizationName(user == null ? null : trimToNull(user.getOrganizationName()));
        device.setRegisteredByUserId(authentication.getName());
        device.setRegisteredByName(user == null ? null : trimToNull(user.getFullName()));
        device.setDeviceId(deviceId);
        device.setInstallationId(trimToNull(request.installationId()));
        device.setDeviceName(trimToNull(request.deviceName()));
        device.setDeviceType(trimToNull(request.deviceType()));
        device.setPlatform(trimToNull(request.platform()));
        device.setPlatformVersion(trimToNull(request.platformVersion()));
        device.setAppVersion(trimToNull(request.appVersion()));
        device.setRuntimeVersion(trimToNull(request.runtimeVersion()));
        device.setDeviceFingerprint(trimToNull(request.fingerprint()));
        device.setBiometricEnabled(request.biometricEnabled());
        device.setTrusted(true);
        device.setActive(true);
        device.setTrustStatus(resolveTrustStatus(request));
        device.setTrustEstablishedAt(device.getTrustEstablishedAt() == null ? now : device.getTrustEstablishedAt());
        device.setTrustRevokedAt(null);
        device.setRevokedReason(null);
        device.setDisabledAt(null);
        device.setDisabledReason(null);
        device.setLastSeenAt(now);
        device.setLastActiveAt(now);
        device.setLastDeliveryError(null);
        if (trimToNull(device.getDeviceCategory()) == null) {
            device.setDeviceCategory("PERSONAL_DEVICE");
        }
        if (trimToNull(device.getOperationalRole()) == null) {
            device.setOperationalRole("PERSONAL");
        }
        device.setPolicyUpdatedAt(device.getPolicyUpdatedAt() == null ? now : device.getPolicyUpdatedAt());
        applyIntegritySignals(device, request);

        MobileDeviceRegistration saved = mobileDeviceRegistrationRepository.save(device);
        return ApiResponse.ok("Trusted device registered.", toTrustedDeviceResponse(saved, true));
    }

    @PatchMapping("/trusted-devices/{id}")
    public ApiResponse<TrustedDeviceResponse> updateTrustedDevice(
            @PathVariable String id,
            @Valid @RequestBody TrustedDeviceUpdateRequest request,
            Authentication authentication
    ) {
        User user = userRepository.findById(authentication.getName()).orElse(null);
        MobileDeviceRegistration device = mobileDeviceRegistrationRepository.findById(id).orElse(null);
        if (device == null
                || !canManageOrganizationDevices(authentication, user)
                || !Objects.equals(trimToNull(device.getOrganizationId()), trimToNull(user.getOrganizationId()))) {
            return ApiResponse.ok("Trusted device not found.", null);
        }

        Instant now = Instant.now();
        applyDevicePolicyUpdate(device, request, now);
        MobileDeviceRegistration saved = mobileDeviceRegistrationRepository.save(device);
        return ApiResponse.ok("Trusted device updated.", toTrustedDeviceResponse(saved, false));
    }

    @DeleteMapping("/trusted-devices/{id}")
    public ApiResponse<ActionResponse> revokeTrustedDevice(
            @PathVariable String id,
            Authentication authentication
    ) {
        MobileDeviceRegistration device = mobileDeviceRegistrationRepository.findById(id).orElse(null);
        User user = userRepository.findById(authentication.getName()).orElse(null);
        if (device != null && canAccessDevice(authentication, user, device)) {
            revokeDevice(device, "Revoked by account owner.", Instant.now());
            mobileDeviceRegistrationRepository.save(device);
        }
        return ApiResponse.ok("Trusted device revoked.", ActionResponse.ok());
    }

    @PostMapping("/trusted-devices/{id}/logout")
    public ApiResponse<ActionResponse> logoutTrustedDevice(
            @PathVariable String id,
            Authentication authentication
    ) {
        MobileDeviceRegistration device = mobileDeviceRegistrationRepository.findById(id).orElse(null);
        User user = userRepository.findById(authentication.getName()).orElse(null);
        if (device != null && canAccessDevice(authentication, user, device)) {
            revokeDevice(device, "Logged out from trusted-device management.", Instant.now());
            mobileDeviceRegistrationRepository.save(device);
        }
        return ApiResponse.ok("Trusted device session logged out.", ActionResponse.ok());
    }

    private String resolveManagedMode(String deviceId, MobileDeviceRegistration device) {
        if (device != null && isOperationalDeviceEnabled(device)) {
            String category = normalizeDeviceCategory(device.getDeviceCategory());
            if ("RECEPTION_KIOSK".equals(category)) {
                return "kiosk-ready";
            }
            if ("CHECKPOINT_SCANNER".equals(category)) {
                return "checkpoint-scanner";
            }
            if ("TABLET_SECURITY_STATION".equals(category)) {
                return "organization-owned";
            }
            return "shared-guard";
        }
        if (device != null && "tablet".equalsIgnoreCase(trimToEmpty(device.getDeviceType()))) {
            return "shared-guard";
        }
        String normalized = deviceId == null ? "" : deviceId.toLowerCase(Locale.ROOT);
        if (normalized.contains("kiosk")) {
            return "kiosk-ready";
        }
        if (normalized.contains("guard")) {
            return "shared-guard";
        }
        return "personal";
    }

    private void applyDevicePolicyUpdate(MobileDeviceRegistration device, TrustedDeviceUpdateRequest request, Instant now) {
        String category = request.deviceCategory() == null ? normalizeDeviceCategory(device.getDeviceCategory()) : normalizeDeviceCategory(request.deviceCategory());
        String trustStatus = request.trustStatus() == null ? trimToEmpty(device.getTrustStatus()) : normalizeTrustStatus(request.trustStatus());
        boolean trusted = request.trusted() == null ? device.isTrusted() : request.trusted();
        boolean active = request.active() == null ? device.isActive() : request.active();

        if (request.deviceName() != null) {
            device.setDeviceName(trimToNull(request.deviceName()));
        }
        device.setDeviceCategory(category);
        device.setOperationalRole(request.operationalRole() == null ? normalizeOperationalRole(device.getOperationalRole()) : normalizeOperationalRole(request.operationalRole()));
        if (request.checkpointId() != null) {
            device.setCheckpointId(trimToNull(request.checkpointId()));
        }
        if (request.checkpointName() != null) {
            device.setCheckpointName(trimToNull(request.checkpointName()));
        }
        if (request.operationalZone() != null) {
            device.setOperationalZone(trimToNull(request.operationalZone()));
        }

        boolean operationalCategory = isOperationalCategory(category);
        device.setTrusted(trusted && !"REVOKED".equals(trustStatus) && !"DISABLED".equals(trustStatus));
        device.setActive(active && !"REVOKED".equals(trustStatus) && !"DISABLED".equals(trustStatus));
        device.setTrustStatus(trustStatus.isBlank() ? (device.isTrusted() ? "TRUSTED" : "UNTRUSTED") : trustStatus);
        device.setSharedOperationalDevice(request.sharedOperationalDevice() == null ? operationalCategory : request.sharedOperationalDevice());
        device.setScannerFirst(request.scannerFirst() == null ? operationalCategory : request.scannerFirst());
        device.setRestrictedNavigation(request.restrictedNavigation() == null ? operationalCategory : request.restrictedNavigation());
        device.setAutoRestoreScanner(request.autoRestoreScanner() == null ? operationalCategory : request.autoRestoreScanner());
        device.setInactivityTimeoutSeconds(request.inactivityTimeoutSeconds() == null
                ? device.getInactivityTimeoutSeconds()
                : Math.max(60, Math.min(request.inactivityTimeoutSeconds(), 43_200)));
        device.setPolicyUpdatedAt(now);

        if (!device.isTrusted()) {
            device.setTrustRevokedAt(device.getTrustRevokedAt() == null ? now : device.getTrustRevokedAt());
            device.setRevokedReason(trimToNull(request.reason()) == null ? "Trust removed by device policy." : trimToNull(request.reason()));
        } else {
            device.setTrustEstablishedAt(device.getTrustEstablishedAt() == null ? now : device.getTrustEstablishedAt());
            device.setTrustRevokedAt(null);
            device.setRevokedReason(null);
        }

        if (!device.isActive() || "DISABLED".equals(device.getTrustStatus())) {
            device.setDisabledAt(device.getDisabledAt() == null ? now : device.getDisabledAt());
            device.setDisabledReason(trimToNull(request.reason()) == null ? "Device disabled by device policy." : trimToNull(request.reason()));
            device.setTrustStatus("DISABLED");
        } else {
            device.setDisabledAt(null);
            device.setDisabledReason(null);
        }
    }

    private boolean canManageOrganizationDevices(Authentication authentication, User user) {
        return user != null
                && trimToNull(user.getOrganizationId()) != null
                && authentication.getAuthorities().stream().anyMatch(authority ->
                "ROLE_ADMIN".equals(authority.getAuthority()) || "ROLE_SUPER_ADMIN".equals(authority.getAuthority()));
    }

    private boolean canAccessDevice(Authentication authentication, User user, MobileDeviceRegistration device) {
        if (device == null) {
            return false;
        }
        if (Objects.equals(device.getUserId(), authentication.getName())) {
            return true;
        }
        return canManageOrganizationDevices(authentication, user)
                && Objects.equals(trimToNull(device.getOrganizationId()), trimToNull(user.getOrganizationId()));
    }

    private boolean isOperationalDeviceEnabled(MobileDeviceRegistration device) {
        return device != null
                && device.isTrusted()
                && device.isActive()
                && !"REVOKED".equalsIgnoreCase(trimToEmpty(device.getTrustStatus()))
                && !"DISABLED".equalsIgnoreCase(trimToEmpty(device.getTrustStatus()))
                && isOperationalCategory(normalizeDeviceCategory(device.getDeviceCategory()));
    }

    private boolean isOperationalCategory(String category) {
        return "SHARED_GUARD_DEVICE".equals(category)
                || "RECEPTION_KIOSK".equals(category)
                || "CHECKPOINT_SCANNER".equals(category)
                || "TABLET_SECURITY_STATION".equals(category);
    }

    private String normalizeDeviceCategory(String value) {
        String normalized = trimToEmpty(value).toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        return switch (normalized) {
            case "SHARED_GUARD", "GUARD", "GUARD_TABLET", "SHARED_GUARD_DEVICE" -> "SHARED_GUARD_DEVICE";
            case "RECEPTION", "KIOSK", "RECEPTION_KIOSK" -> "RECEPTION_KIOSK";
            case "CHECKPOINT", "SCANNER", "CHECKPOINT_SCANNER" -> "CHECKPOINT_SCANNER";
            case "TABLET", "SECURITY_STATION", "TABLET_SECURITY_STATION" -> "TABLET_SECURITY_STATION";
            default -> "PERSONAL_DEVICE";
        };
    }

    private String normalizeOperationalRole(String value) {
        String normalized = trimToEmpty(value).toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        return switch (normalized) {
            case "GUARD", "SECURITY", "SECURITY_GUARD" -> "SECURITY_GUARD";
            case "RECEPTION", "RECEPTIONIST" -> "RECEPTION";
            case "CHECKPOINT", "CHECKPOINT_OPERATOR", "SCANNER" -> "CHECKPOINT_OPERATOR";
            case "KIOSK", "KIOSK_OPERATOR" -> "KIOSK";
            default -> "PERSONAL";
        };
    }

    private String normalizeTrustStatus(String value) {
        String normalized = trimToEmpty(value).toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        return switch (normalized) {
            case "TRUSTED", "UNTRUSTED", "REVOKED", "SUSPICIOUS", "DISABLED" -> normalized;
            default -> "UNTRUSTED";
        };
    }

    private Optional<MobileDeviceRegistration> findCurrentDevice(List<MobileDeviceRegistration> devices, String deviceId) {
        String normalized = trimToNull(deviceId);
        if (normalized == null) {
            return Optional.empty();
        }
        return devices.stream()
                .filter(device -> Objects.equals(device.getDeviceId(), normalized))
                .sorted((left, right) -> Boolean.compare(right.isActive() && right.isTrusted(), left.isActive() && left.isTrusted()))
                .findFirst();
    }

    private boolean hasEnterpriseMobileRole(User user) {
        return user.getRoles() != null && user.getRoles().stream().anyMatch(role ->
                role == Role.ADMIN || role == Role.SUPER_ADMIN || role == Role.EMPLOYEE || role == Role.SECURITY_GUARD);
    }

    private TrustedDeviceResponse toTrustedDeviceResponse(MobileDeviceRegistration device, boolean currentDevice) {
        return new TrustedDeviceResponse(
                device.getId(),
                device.getDeviceId(),
                device.getDeviceName(),
                device.getDeviceType(),
                device.getPlatform(),
                device.getAppVersion(),
                device.getRuntimeVersion(),
                device.getOrganizationId(),
                device.getOrganizationName(),
                device.getUserId(),
                device.getRegisteredByName(),
                trimToNull(device.getTrustStatus()) == null ? (device.isTrusted() ? "TRUSTED" : "UNTRUSTED") : device.getTrustStatus(),
                device.isTrusted(),
                device.isActive(),
                device.isBiometricEnabled(),
                currentDevice,
                device.isSuspicious(),
                normalizeDeviceCategory(device.getDeviceCategory()),
                normalizeOperationalRole(device.getOperationalRole()),
                device.getCheckpointId(),
                device.getCheckpointName(),
                device.getOperationalZone(),
                device.isSharedOperationalDevice(),
                device.isScannerFirst(),
                device.isRestrictedNavigation(),
                device.isAutoRestoreScanner(),
                device.getInactivityTimeoutSeconds(),
                device.getLastActiveAt() == null ? device.getLastSeenAt() : device.getLastActiveAt(),
                device.getTrustEstablishedAt(),
                device.getTrustRevokedAt(),
                device.getRevokedReason(),
                device.getDisabledAt(),
                device.getDisabledReason(),
                device.getPolicyUpdatedAt(),
                new DeviceIntegritySignalsResponse(
                        device.isRootedOrJailbroken(),
                        device.isEmulator(),
                        device.isDebugBuild(),
                        device.isSuspicious(),
                        integrityReasons(device.getIntegrityReasons())
                )
        );
    }

    private void applyIntegritySignals(MobileDeviceRegistration device, TrustedDeviceRegistrationRequest request) {
        if (request.integritySignals() == null) {
            device.setRootedOrJailbroken(false);
            device.setEmulator(false);
            device.setDebugBuild(false);
            device.setSuspicious(false);
            device.setIntegrityReasons(null);
            return;
        }

        device.setRootedOrJailbroken(request.integritySignals().rootedOrJailbroken());
        device.setEmulator(request.integritySignals().emulator());
        device.setDebugBuild(request.integritySignals().debugBuild());
        device.setSuspicious(request.integritySignals().suspicious());
        device.setIntegrityReasons(request.integritySignals().reasons() == null
                ? null
                : String.join(",", request.integritySignals().reasons()));
    }

    private String resolveTrustStatus(TrustedDeviceRegistrationRequest request) {
        if (request.integritySignals() != null && request.integritySignals().suspicious()) {
            return "SUSPICIOUS";
        }
        return "TRUSTED";
    }

    private void revokeDevice(MobileDeviceRegistration device, String reason, Instant now) {
        device.setTrusted(false);
        device.setActive(false);
        device.setBiometricEnabled(false);
        device.setTrustStatus("REVOKED");
        device.setTrustRevokedAt(now);
        device.setRevokedReason(reason);
        device.setLastDeliveryError(reason);
        device.setUpdatedAt(now);
    }

    private List<String> integrityReasons(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            return List.of();
        }
        return Arrays.stream(normalized.split(","))
                .map(this::trimToNull)
                .filter(Objects::nonNull)
                .toList();
    }

    private String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String trimToEmpty(String value) {
        String normalized = trimToNull(value);
        return normalized == null ? "" : normalized;
    }
}
