package com.visitor.management.service;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.AndroidConfig;
import com.google.firebase.messaging.AndroidNotification;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingException;
import com.google.firebase.messaging.Message;
import com.visitor.management.config.AppProperties;
import com.visitor.management.entity.MobileDeviceRegistration;
import com.visitor.management.entity.Notification;
import com.visitor.management.entity.NotificationPriority;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.FileInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.Locale;
import java.util.Map;

@Service
public class FirebaseCloudMessagingDispatcher {

    private static final Logger log = LoggerFactory.getLogger(FirebaseCloudMessagingDispatcher.class);
    private static final String FIREBASE_APP_NAME = "accessflow-notifications";
    private static final long DEFAULT_TTL_MS = Duration.ofHours(4).toMillis();

    private final AppProperties appProperties;
    private FirebaseMessaging messaging;
    private boolean initializationAttempted;

    public FirebaseCloudMessagingDispatcher(AppProperties appProperties) {
        this.appProperties = appProperties;
    }

    public DeliveryResult deliver(MobileDeviceRegistration device, Notification notification, Map<String, String> data) {
        String fcmToken = trimToNull(device.getFcmToken());
        if (fcmToken == null) {
            return DeliveryResult.skippedResult("Missing FCM token.");
        }

        FirebaseMessaging firebaseMessaging = getMessaging();
        if (firebaseMessaging == null) {
            return DeliveryResult.skippedResult("Firebase Cloud Messaging is not configured.");
        }

        try {
            firebaseMessaging.send(buildMessage(fcmToken, notification, data));
            return DeliveryResult.deliveredResult();
        } catch (FirebaseMessagingException ex) {
            String errorCode = ex.getMessagingErrorCode() == null ? "" : ex.getMessagingErrorCode().name();
            boolean invalidToken = errorCode.equals("UNREGISTERED")
                    || errorCode.equals("INVALID_ARGUMENT")
                    || messageSuggestsInvalidToken(ex.getMessage());
            return DeliveryResult.failedResult(ex.getMessage(), invalidToken);
        } catch (Exception ex) {
            return DeliveryResult.failedResult(ex.getMessage(), messageSuggestsInvalidToken(ex.getMessage()));
        }
    }

    private synchronized FirebaseMessaging getMessaging() {
        if (messaging != null) {
            return messaging;
        }

        if (initializationAttempted) {
            return null;
        }

        initializationAttempted = true;
        var firebase = appProperties.getNotifications().getFirebase();
        if (!firebase.isEnabled()) {
            return null;
        }

        try (InputStream credentialsStream = openCredentialsStream(firebase)) {
            if (credentialsStream == null) {
                log.warn("Firebase push is enabled, but no Firebase service account credentials were provided.");
                return null;
            }

            FirebaseOptions.Builder options = FirebaseOptions.builder()
                    .setCredentials(GoogleCredentials.fromStream(credentialsStream));
            String projectId = trimToNull(firebase.getProjectId());
            if (projectId != null) {
                options.setProjectId(projectId);
            }

            FirebaseApp firebaseApp = FirebaseApp.getApps().stream()
                    .filter(app -> FIREBASE_APP_NAME.equals(app.getName()))
                    .findFirst()
                    .orElseGet(() -> FirebaseApp.initializeApp(options.build(), FIREBASE_APP_NAME));
            messaging = FirebaseMessaging.getInstance(firebaseApp);
            return messaging;
        } catch (Exception ex) {
            log.warn("Firebase Cloud Messaging initialization failed: {}", ex.getMessage());
            return null;
        }
    }

    private Message buildMessage(String fcmToken, Notification notification, Map<String, String> data) {
        boolean critical = notification.getPriority() == NotificationPriority.CRITICAL;
        String channelId = critical ? "accessflow-critical" : "accessflow-operations";

        return Message.builder()
                .setToken(fcmToken)
                .putAllData(data)
                .setNotification(com.google.firebase.messaging.Notification.builder()
                        .setTitle(sanitizeNotificationText(notification.getTitle(), 80))
                        .setBody(sanitizeNotificationText(notification.getMessage(), 180))
                        .build())
                .setAndroidConfig(AndroidConfig.builder()
                        .setPriority(critical ? AndroidConfig.Priority.HIGH : AndroidConfig.Priority.NORMAL)
                        .setTtl(DEFAULT_TTL_MS)
                        .setCollapseKey(notification.getType().name())
                        .setNotification(AndroidNotification.builder()
                                .setChannelId(channelId)
                                .setSound("default")
                                .setTag(notification.getId())
                                .setVisibility(AndroidNotification.Visibility.PRIVATE)
                                .build())
                        .build())
                .build();
    }

    private InputStream openCredentialsStream(AppProperties.Notifications.Firebase firebase) throws Exception {
        String base64 = trimToNull(firebase.getServiceAccountBase64());
        if (base64 != null) {
            return new ByteArrayInputStream(Base64.getDecoder().decode(base64));
        }

        String json = trimToNull(firebase.getServiceAccountJson());
        if (json != null) {
            return new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8));
        }

        String path = trimToNull(firebase.getServiceAccountPath());
        if (path != null) {
            return new FileInputStream(path);
        }

        return null;
    }

    private boolean messageSuggestsInvalidToken(String message) {
        String normalized = trimToNull(message);
        if (normalized == null) {
            return false;
        }
        String lower = normalized.toLowerCase(Locale.ROOT);
        return lower.contains("registration token")
                || lower.contains("unregistered")
                || lower.contains("not registered")
                || lower.contains("invalid argument");
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

    public record DeliveryResult(boolean delivered, boolean invalidToken, String errorMessage) {
        static DeliveryResult deliveredResult() {
            return new DeliveryResult(true, false, null);
        }

        static DeliveryResult skippedResult(String reason) {
            return new DeliveryResult(false, false, reason);
        }

        static DeliveryResult failedResult(String message, boolean invalidToken) {
            return new DeliveryResult(false, invalidToken, message);
        }
    }
}
