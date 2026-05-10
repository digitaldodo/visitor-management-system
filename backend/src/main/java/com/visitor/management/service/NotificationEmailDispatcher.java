package com.visitor.management.service;

import com.visitor.management.entity.Notification;
import com.visitor.management.entity.NotificationStatus;
import com.visitor.management.repository.NotificationRepository;
import org.springframework.data.domain.PageRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.Instant;

@Service
public class NotificationEmailDispatcher {

    private static final Logger log = LoggerFactory.getLogger(NotificationEmailDispatcher.class);
    private static final int MAX_EMAIL_ATTEMPTS = 3;

    private final NotificationRepository notificationRepository;
    private final EmailService emailService;

    public NotificationEmailDispatcher(NotificationRepository notificationRepository, EmailService emailService) {
        this.notificationRepository = notificationRepository;
        this.emailService = emailService;
    }

    @Async
    public void deliverEmailAsync(String notificationId) {
        notificationRepository.findById(notificationId).ifPresent(this::deliverEmail);
    }

    public void retryPendingEmails() {
        notificationRepository.findByEmailEnabledTrueAndEmailStatusAndEmailAttemptsLessThan(
                        NotificationStatus.PENDING,
                        MAX_EMAIL_ATTEMPTS,
                        PageRequest.of(0, 25)
                )
                .forEach(this::deliverEmail);
    }

    private void deliverEmail(Notification notification) {
        if (!notification.isEmailEnabled() || notification.getEmailAttempts() >= MAX_EMAIL_ATTEMPTS) {
            return;
        }

        notification.setEmailAttempts(notification.getEmailAttempts() + 1);
        notification.setEmailLastAttemptAt(Instant.now());
        try {
            emailService.sendNotificationEmail(
                    notification.getRecipientEmail(),
                    notification.getRecipientName(),
                    notification.getTitle(),
                    notification.getTitle(),
                    notification.getMessage(),
                    notification.getActionUrl()
            );
            notification.setEmailStatus(NotificationStatus.SENT);
            notification.setLastEmailError(null);
        } catch (RuntimeException ex) {
            notification.setEmailStatus(notification.getEmailAttempts() >= MAX_EMAIL_ATTEMPTS
                    ? NotificationStatus.FAILED
                    : NotificationStatus.PENDING);
            notification.setLastEmailError(ex.getMessage());
            log.warn("Notification email attempt {} failed for {}: {}", notification.getEmailAttempts(), notification.getId(), ex.getMessage());
        }
        notification.setUpdatedAt(Instant.now());
        notificationRepository.save(notification);
    }
}
