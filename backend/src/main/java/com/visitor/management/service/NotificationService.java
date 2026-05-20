package com.visitor.management.service;

import com.visitor.management.config.AppProperties;
import com.visitor.management.dto.NotificationDeviceRegistrationRequest;
import com.visitor.management.dto.NotificationDeviceUnregistrationRequest;
import com.visitor.management.dto.NotificationListResponse;
import com.visitor.management.dto.NotificationResponse;
import com.visitor.management.entity.MobileDeviceRegistration;
import com.visitor.management.entity.Notification;
import com.visitor.management.entity.NotificationCategory;
import com.visitor.management.entity.NotificationPriority;
import com.visitor.management.entity.NotificationStatus;
import com.visitor.management.entity.NotificationType;
import com.visitor.management.entity.Role;
import com.visitor.management.entity.User;
import com.visitor.management.entity.Visitor;
import com.visitor.management.exception.ResourceNotFoundException;
import com.visitor.management.repository.MobileDeviceRegistrationRepository;
import com.visitor.management.repository.NotificationRepository;
import com.visitor.management.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.CompletableFuture;

@Service
public class NotificationService {

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);

    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;
    private final NotificationEmailDispatcher notificationEmailDispatcher;
    private final MobileDeviceRegistrationRepository mobileDeviceRegistrationRepository;
    private final FirebaseCloudMessagingDispatcher firebaseCloudMessagingDispatcher;
    private final AppProperties appProperties;
    private final RestClient restClient;

    public NotificationService(
            NotificationRepository notificationRepository,
            UserRepository userRepository,
            NotificationEmailDispatcher notificationEmailDispatcher,
            MobileDeviceRegistrationRepository mobileDeviceRegistrationRepository,
            FirebaseCloudMessagingDispatcher firebaseCloudMessagingDispatcher,
            AppProperties appProperties
    ) {
        this.notificationRepository = notificationRepository;
        this.userRepository = userRepository;
        this.notificationEmailDispatcher = notificationEmailDispatcher;
        this.mobileDeviceRegistrationRepository = mobileDeviceRegistrationRepository;
        this.firebaseCloudMessagingDispatcher = firebaseCloudMessagingDispatcher;
        this.appProperties = appProperties;
        this.restClient = RestClient.create();
    }

    public Notification notifyUser(String recipientUserId, NotificationType type, String title, String message, Visitor visitor, String actionUrl) {
        return notifyUser(recipientUserId, type, title, message, visitor, actionUrl, null);
    }

    public Notification notifyUser(
            String recipientUserId,
            NotificationType type,
            String title,
            String message,
            Visitor visitor,
            String actionUrl,
            String actorName
    ) {
        Optional<User> recipient = userRepository.findById(recipientUserId);
        if (recipient.isEmpty()) {
            log.warn("Notification recipient {} was not found for {}.", recipientUserId, type);
            return null;
        }

        Notification notification = new Notification();
        notification.setRecipientUserId(recipientUserId);
        notification.setRecipientEmail(recipient.get().getEmail());
        notification.setRecipientName(recipient.get().getFullName());
        notification.setType(type);
        notification.setCategory(resolveCategory(type));
        notification.setPriority(resolvePriority(type));
        notification.setTitle(title);
        notification.setMessage(message);
        notification.setVisitorId(visitor == null ? null : visitor.getId());
        notification.setVisitorName(visitor == null ? null : visitor.getFullName());
        notification.setActionUrl(actionUrl);
        notification.setActorName(trimToNull(actorName));
        notification.setOrganizationTimezone(resolveTimezone(visitor, recipient.get()));
        notification.setEmailEnabled(hasEmail(recipient.get()));
        notification.setEmailStatus(notification.isEmailEnabled() ? NotificationStatus.PENDING : NotificationStatus.FAILED);
        notification.setCreatedAt(Instant.now());
        notification.setUpdatedAt(notification.getCreatedAt());

        Notification saved = notificationRepository.save(notification);
        if (saved.isEmailEnabled()) {
            notificationEmailDispatcher.deliverEmailAsync(saved.getId());
        }
        if (!Boolean.FALSE.equals(recipient.get().getNotificationInAppEnabled())) {
            dispatchPushAsync(saved);
        }
        return saved;
    }

    public int notifyOrganizationRoles(
            String organizationId,
            Set<Role> roles,
            String actorUserIdToSkip,
            NotificationType type,
            String title,
            String message,
            Visitor visitor,
            String actionUrl,
            String actorName
    ) {
        if (organizationId == null || organizationId.isBlank() || roles == null || roles.isEmpty()) {
            return 0;
        }

        return (int) userRepository.findAllByOrganizationIdAndRolesIn(organizationId, roles).stream()
                .filter(User::isActive)
                .filter(user -> user.getId() != null)
                .filter(user -> !Objects.equals(user.getId(), actorUserIdToSkip))
                .map(User::getId)
                .distinct()
                .map(userId -> notifyUser(userId, type, title, message, visitor, actionUrl, actorName))
                .filter(Objects::nonNull)
                .count();
    }

    public NotificationListResponse listForUser(String userId, int limit) {
        Optional<User> user = userRepository.findById(userId);
        if (user.isPresent() && Boolean.FALSE.equals(user.get().getNotificationInAppEnabled())) {
            return new NotificationListResponse(0, List.of());
        }
        int safeLimit = Math.max(1, Math.min(limit, 50));
        return new NotificationListResponse(
                notificationRepository.countByRecipientUserIdAndReadFalse(userId),
                notificationRepository.findByRecipientUserIdOrderByCreatedAtDesc(userId, PageRequest.of(0, safeLimit))
                        .stream()
                        .map(this::toResponse)
                        .toList()
        );
    }

    public NotificationListResponse markRead(String userId, String id) {
        Notification notification = notificationRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Notification was not found."));
        if (!userId.equals(notification.getRecipientUserId())) {
            throw new ResourceNotFoundException("Notification was not found.");
        }
        if (!notification.isRead()) {
            notification.setRead(true);
            notification.setReadAt(Instant.now());
            notification.setUpdatedAt(notification.getReadAt());
            notificationRepository.save(notification);
        }
        return listForUser(userId, 10);
    }

    public NotificationListResponse markAllRead(String userId) {
        Instant now = Instant.now();
        var notifications = notificationRepository.findByRecipientUserIdOrderByCreatedAtDesc(userId, PageRequest.of(0, 50));
        notifications.stream()
                .filter(notification -> !notification.isRead())
                .forEach(notification -> {
                    notification.setRead(true);
                    notification.setReadAt(now);
                    notification.setUpdatedAt(now);
                });
        notificationRepository.saveAll(notifications);
        return listForUser(userId, 10);
    }

    public void registerDevice(String userId, NotificationDeviceRegistrationRequest request) {
        Instant now = Instant.now();
        String deviceId = requiredDeviceId(request.deviceId());
        String permissionStatus = normalizePermissionStatus(request.permissionStatus());
        String expoPushToken = trimToNull(request.expoPushToken());
        String fcmToken = trimToNull(request.fcmToken());
        MobileDeviceRegistration device = findExistingDevice(expoPushToken, fcmToken)
                .orElseGet(MobileDeviceRegistration::new);

        if (device.getId() == null) {
            List<MobileDeviceRegistration> existingDevices = mobileDeviceRegistrationRepository.findAllByUserIdAndDeviceId(userId, deviceId);
            if (!existingDevices.isEmpty()) {
                device = existingDevices.getFirst();
            }
            String selectedDeviceRegistrationId = device.getId();
            existingDevices.stream()
                    .filter(existing -> !Objects.equals(existing.getId(), selectedDeviceRegistrationId))
                    .forEach(existing -> deactivateDevice(existing, "Superseded by a newer device registration.", now));
            if (!existingDevices.isEmpty()) {
                mobileDeviceRegistrationRepository.saveAll(existingDevices);
            }
        }

        device.setUserId(userId);
        device.setDeviceId(deviceId);
        device.setDeviceName(trimToNull(request.deviceName()));
        device.setPlatform(trimToNull(request.platform()));
        device.setAppVersion(trimToNull(request.appVersion()));
        device.setRuntimeVersion(trimToNull(request.runtimeVersion()));
        device.setProjectId(trimToNull(request.projectId()));
        device.setPermissionStatus(permissionStatus);
        device.setExpoPushToken(expoPushToken);
        device.setFcmToken(fcmToken);
        device.setPushProvider(normalizePushProvider(request.pushProvider(), expoPushToken, fcmToken));
        device.setLastSeenAt(now);
        device.setLastActiveAt(now);
        device.setActive(true);
        device.setLastDeliveryError(null);
        mobileDeviceRegistrationRepository.save(device);
    }

    public void unregisterDevice(String userId, NotificationDeviceUnregistrationRequest request) {
        Instant now = Instant.now();
        String deviceId = trimToNull(request.deviceId());
        String expoPushToken = trimToNull(request.expoPushToken());
        String fcmToken = trimToNull(request.fcmToken());
        List<MobileDeviceRegistration> devices = mobileDeviceRegistrationRepository.findAllByUserId(userId);
        devices.stream()
                .filter(device -> matchesDevice(device, deviceId, expoPushToken, fcmToken))
                .forEach(device -> deactivateDevice(device, "Unregistered from mobile session.", now));
        if (!devices.isEmpty()) {
            mobileDeviceRegistrationRepository.saveAll(devices);
        }
    }

    public void deactivateUserDevices(String userId, String reason) {
        Instant now = Instant.now();
        List<MobileDeviceRegistration> devices = mobileDeviceRegistrationRepository.findAllByUserId(userId);
        devices.forEach(device -> deactivateDevice(device, reason, now));
        if (!devices.isEmpty()) {
            mobileDeviceRegistrationRepository.saveAll(devices);
        }
    }

    public boolean hasRecentVisitorNotification(String recipientUserId, NotificationType type, String visitorId, Instant createdAfter) {
        if (recipientUserId == null || visitorId == null || createdAfter == null) {
            return false;
        }
        return notificationRepository.existsByRecipientUserIdAndTypeAndVisitorIdAndCreatedAtAfter(recipientUserId, type, visitorId, createdAfter);
    }

    private boolean hasEmail(User user) {
        return !Boolean.FALSE.equals(user.getNotificationEmailEnabled())
                && user.getEmail() != null
                && !user.getEmail().isBlank();
    }

    private NotificationResponse toResponse(Notification notification) {
        return new NotificationResponse(
                notification.getId(),
                notification.getType(),
                notification.getCategory(),
                notification.getPriority(),
                notification.getTitle(),
                notification.getMessage(),
                notification.getVisitorId(),
                notification.getVisitorName(),
                notification.getActionUrl(),
                notification.getActorName(),
                notification.getOrganizationTimezone(),
                notification.isRead(),
                notification.getEmailStatus(),
                notification.getCreatedAt()
        );
    }

    private NotificationCategory resolveCategory(NotificationType type) {
        return switch (type) {
            case VISITOR_APPROVAL_REQUEST,
                    VISITOR_APPROVED,
                    VISITOR_ARRIVED,
                    VISITOR_REJECTED,
                    VISITOR_RESCHEDULED,
                    VISITOR_ACCESS_WINDOW_EXPIRING,
                    VISITOR_INVITE_SENT,
                    VISITOR_INVITE_VIEWED,
                    VISITOR_PRE_REGISTRATION_COMPLETED,
                    VISITOR_INVITE_REVOKED,
                    VISITOR_CHECKED_IN,
                    VISITOR_EXPIRED -> NotificationCategory.VISITOR;
            case SECURITY_INVALID_QR_SCAN,
                    SECURITY_DENIED_ENTRY,
                    SECURITY_SUSPICIOUS_ACTIVITY,
                    SECURITY_MANUAL_OVERRIDE,
                    SECURITY_ESCALATION,
                    EMERGENCY_LOCKDOWN,
                    EMERGENCY_PANIC,
                    EMERGENCY_BROADCAST,
                    EMERGENCY_EVACUATION -> NotificationCategory.SECURITY;
            case WORKFORCE_ONBOARDING_REQUESTED,
                    WORKFORCE_ONBOARDING_APPROVED,
                    WORKFORCE_ONBOARDING_REJECTED,
                    WORKFORCE_ACCESS_REVOKED,
                    WORKFORCE_CREDENTIAL_DISABLED -> NotificationCategory.WORKFORCE;
            case SYSTEM_SESSION_EXPIRED,
                    SYSTEM_RUNTIME_UPDATE_AVAILABLE,
                    SYSTEM_BACKEND_CONNECTIVITY_ISSUE -> NotificationCategory.SYSTEM;
        };
    }

    private NotificationPriority resolvePriority(NotificationType type) {
        return switch (type) {
            case VISITOR_APPROVAL_REQUEST,
                    VISITOR_ARRIVED,
                    VISITOR_RESCHEDULED,
                    VISITOR_ACCESS_WINDOW_EXPIRING,
                    VISITOR_PRE_REGISTRATION_COMPLETED,
                    VISITOR_INVITE_REVOKED,
                    WORKFORCE_ONBOARDING_REQUESTED,
                    WORKFORCE_ONBOARDING_REJECTED,
                    WORKFORCE_ACCESS_REVOKED,
                    WORKFORCE_CREDENTIAL_DISABLED,
                    SECURITY_DENIED_ENTRY,
                    SECURITY_SUSPICIOUS_ACTIVITY,
                    SECURITY_MANUAL_OVERRIDE,
                    SECURITY_ESCALATION,
                    EMERGENCY_BROADCAST,
                    EMERGENCY_EVACUATION -> NotificationPriority.HIGH;
            case SECURITY_INVALID_QR_SCAN,
                    EMERGENCY_LOCKDOWN,
                    EMERGENCY_PANIC,
                    SYSTEM_SESSION_EXPIRED,
                    SYSTEM_RUNTIME_UPDATE_AVAILABLE,
                    SYSTEM_BACKEND_CONNECTIVITY_ISSUE -> NotificationPriority.CRITICAL;
            case VISITOR_APPROVED,
                    VISITOR_REJECTED,
                    VISITOR_INVITE_SENT,
                    VISITOR_INVITE_VIEWED,
                    VISITOR_CHECKED_IN,
                    VISITOR_EXPIRED,
                    WORKFORCE_ONBOARDING_APPROVED -> NotificationPriority.MEDIUM;
        };
    }

    private void dispatchPushAsync(Notification notification) {
        if (!appProperties.getNotifications().isPushEnabled()) {
            return;
        }
        CompletableFuture.runAsync(() -> deliverPush(notification));
    }

    private void deliverPush(Notification notification) {
        List<MobileDeviceRegistration> devices = mobileDeviceRegistrationRepository.findAllByUserIdAndActiveTrue(notification.getRecipientUserId());
        if (devices.isEmpty()) {
            return;
        }

        for (MobileDeviceRegistration device : devices) {
            Map<String, String> notificationData = buildNotificationData(notification);
            if (trimToNull(device.getFcmToken()) != null) {
                FirebaseCloudMessagingDispatcher.DeliveryResult fcmResult = firebaseCloudMessagingDispatcher.deliver(device, notification, notificationData);
                if (fcmResult.delivered()) {
                    device.setLastDeliveredAt(Instant.now());
                    device.setLastDeliveryError(null);
                    continue;
                }
                if (fcmResult.invalidToken()) {
                    deactivateDevice(device, "FCM token was rejected.", Instant.now());
                    continue;
                }
                if (trimToNull(device.getExpoPushToken()) == null) {
                    device.setLastDeliveryError(trimToNull(fcmResult.errorMessage()));
                    continue;
                }
                log.debug("FCM delivery skipped for notification {} and device {}; falling back to Expo push.", notification.getId(), device.getId());
            }

            if (trimToNull(device.getExpoPushToken()) == null) {
                continue;
            }
            try {
                restClient.post()
                        .uri(appProperties.getNotifications().getExpoPushUrl())
                        .contentType(MediaType.APPLICATION_JSON)
                        .headers(headers -> {
                            String accessToken = trimToNull(appProperties.getNotifications().getExpoAccessToken());
                            if (accessToken != null) {
                                headers.setBearerAuth(accessToken);
                            }
                        })
                        .body(buildExpoPayload(device, notification, notificationData))
                        .retrieve()
                        .toBodilessEntity();
                device.setLastDeliveredAt(Instant.now());
                device.setLastDeliveryError(null);
            } catch (Exception ex) {
                log.warn("Push delivery failed for notification {} and device {}: {}", notification.getId(), device.getId(), ex.getMessage());
                device.setLastDeliveryError(trimToNull(ex.getMessage()));
                if (messageSuggestsInvalidToken(ex.getMessage())) {
                    deactivateDevice(device, "Expo push token was rejected.", Instant.now());
                }
            }
        }

        mobileDeviceRegistrationRepository.saveAll(devices);
    }

    private Map<String, Object> buildExpoPayload(MobileDeviceRegistration device, Notification notification, Map<String, String> data) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("to", device.getExpoPushToken());
        payload.put("title", sanitizeNotificationText(notification.getTitle(), 80));
        payload.put("body", sanitizeNotificationText(notification.getMessage(), 180));
        payload.put("sound", "default");
        payload.put("priority", notification.getPriority() == NotificationPriority.CRITICAL ? "high" : "default");
        payload.put("channelId", notification.getPriority() == NotificationPriority.CRITICAL ? "accessflow-critical" : "accessflow-operations");
        String categoryId = categoryIdFor(notification.getType());
        if (categoryId != null) {
            payload.put("categoryId", categoryId);
        }
        payload.put("data", data);
        return payload;
    }

    private Map<String, String> buildNotificationData(Notification notification) {
        return Map.of(
                "notificationId", safeData(notification.getId()),
                "type", notification.getType().name(),
                "category", notification.getCategory().name(),
                "priority", notification.getPriority().name(),
                "visitorId", safeData(notification.getVisitorId()),
                "actionUrl", safeData(notification.getActionUrl())
        );
    }

    private String categoryIdFor(NotificationType type) {
        return switch (type) {
            case VISITOR_APPROVAL_REQUEST -> "employee-approval";
            default -> null;
        };
    }

    private String resolveTimezone(Visitor visitor, User recipient) {
        if (visitor != null && trimToNull(visitor.getOrganizationTimezone()) != null) {
            return visitor.getOrganizationTimezone();
        }
        return trimToNull(recipient.getOrganizationTimezone());
    }

    private Optional<MobileDeviceRegistration> findExistingDevice(String expoPushToken, String fcmToken) {
        if (fcmToken != null) {
            Optional<MobileDeviceRegistration> device = mobileDeviceRegistrationRepository.findByFcmToken(fcmToken);
            if (device.isPresent()) {
                return device;
            }
        }
        if (expoPushToken != null) {
            return mobileDeviceRegistrationRepository.findByExpoPushToken(expoPushToken);
        }
        return Optional.empty();
    }

    private String normalizePushProvider(String pushProvider, String expoPushToken, String fcmToken) {
        String normalized = trimToNull(pushProvider);
        if (normalized != null) {
            return normalized.toLowerCase(Locale.ROOT);
        }
        if (fcmToken != null && expoPushToken != null) {
            return "firebase-expo";
        }
        if (fcmToken != null) {
            return "firebase";
        }
        if (expoPushToken != null) {
            return "expo";
        }
        return "none";
    }

    private boolean matchesDevice(MobileDeviceRegistration device, String deviceId, String expoPushToken, String fcmToken) {
        return (deviceId != null && deviceId.equals(device.getDeviceId()))
                || (expoPushToken != null && expoPushToken.equals(device.getExpoPushToken()))
                || (fcmToken != null && fcmToken.equals(device.getFcmToken()));
    }

    private void deactivateDevice(MobileDeviceRegistration device, String reason, Instant at) {
        device.setActive(false);
        device.setLastDeliveryError(reason);
        device.setUpdatedAt(at);
    }

    private String requiredDeviceId(String deviceId) {
        String normalized = trimToNull(deviceId);
        if (normalized == null) {
            throw new ResourceNotFoundException("Device registration is missing a device identifier.");
        }
        return normalized;
    }

    private String normalizePermissionStatus(String permissionStatus) {
        String normalized = trimToNull(permissionStatus);
        if (normalized == null) {
            return "UNKNOWN";
        }
        return normalized.toUpperCase(Locale.ROOT);
    }

    private boolean messageSuggestsInvalidToken(String message) {
        String normalized = trimToNull(message);
        if (normalized == null) {
            return false;
        }
        String lower = normalized.toLowerCase(Locale.ROOT);
        return lower.contains("device not registered") || lower.contains("push token") || lower.contains("invalid");
    }

    private String safeData(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            return "";
        }
        return normalized.replaceAll("[\\r\\n\\t]+", " ").trim();
    }

    private String sanitizeNotificationText(String value, int maxLength) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            return "AccessFlow update";
        }
        String sanitized = normalized
                .replaceAll("[\\r\\n\\t]+", " ")
                .replaceAll("\\s{2,}", " ")
                .trim();
        return sanitized.substring(0, Math.min(maxLength, sanitized.length()));
    }

    private String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
