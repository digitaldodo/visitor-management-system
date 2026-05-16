package com.visitor.management.service;

import com.visitor.management.dto.NotificationListResponse;
import com.visitor.management.dto.NotificationResponse;
import com.visitor.management.entity.Notification;
import com.visitor.management.entity.NotificationStatus;
import com.visitor.management.entity.NotificationType;
import com.visitor.management.entity.User;
import com.visitor.management.entity.Visitor;
import com.visitor.management.exception.ResourceNotFoundException;
import com.visitor.management.repository.NotificationRepository;
import com.visitor.management.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Optional;

@Service
public class NotificationService {

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);

    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;
    private final NotificationEmailDispatcher notificationEmailDispatcher;

    public NotificationService(
            NotificationRepository notificationRepository,
            UserRepository userRepository,
            NotificationEmailDispatcher notificationEmailDispatcher
    ) {
        this.notificationRepository = notificationRepository;
        this.userRepository = userRepository;
        this.notificationEmailDispatcher = notificationEmailDispatcher;
    }

    public Notification notifyUser(String recipientUserId, NotificationType type, String title, String message, Visitor visitor, String actionUrl) {
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
        notification.setTitle(title);
        notification.setMessage(message);
        notification.setVisitorId(visitor == null ? null : visitor.getId());
        notification.setVisitorName(visitor == null ? null : visitor.getFullName());
        notification.setActionUrl(actionUrl);
        notification.setEmailEnabled(hasEmail(recipient.get()));
        notification.setEmailStatus(notification.isEmailEnabled() ? NotificationStatus.PENDING : NotificationStatus.FAILED);
        notification.setCreatedAt(Instant.now());
        notification.setUpdatedAt(notification.getCreatedAt());

        Notification saved = notificationRepository.save(notification);
        if (saved.isEmailEnabled()) {
            notificationEmailDispatcher.deliverEmailAsync(saved.getId());
        }
        return saved;
    }

    public NotificationListResponse listForUser(String userId, int limit) {
        Optional<User> user = userRepository.findById(userId);
        if (user.isPresent() && Boolean.FALSE.equals(user.get().getNotificationInAppEnabled())) {
            return new NotificationListResponse(0, java.util.List.of());
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

    private boolean hasEmail(User user) {
        return !Boolean.FALSE.equals(user.getNotificationEmailEnabled())
                && user.getEmail() != null
                && !user.getEmail().isBlank();
    }

    private NotificationResponse toResponse(Notification notification) {
        return new NotificationResponse(
                notification.getId(),
                notification.getType(),
                notification.getTitle(),
                notification.getMessage(),
                notification.getVisitorId(),
                notification.getVisitorName(),
                notification.getActionUrl(),
                notification.isRead(),
                notification.getEmailStatus(),
                notification.getCreatedAt()
        );
    }
}
