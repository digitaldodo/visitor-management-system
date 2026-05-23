package com.visitor.management.service;

import com.visitor.management.entity.NotificationStatus;
import com.visitor.management.entity.VisitorInvite;
import com.visitor.management.repository.VisitorInviteRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.Instant;

@Service
public class VisitorInviteEmailDispatcher {

    private static final Logger log = LoggerFactory.getLogger(VisitorInviteEmailDispatcher.class);
    private final VisitorInviteRepository visitorInviteRepository;
    private final EmailService emailService;

    public VisitorInviteEmailDispatcher(VisitorInviteRepository visitorInviteRepository, EmailService emailService) {
        this.visitorInviteRepository = visitorInviteRepository;
        this.emailService = emailService;
    }

    @Async
    public void deliverInviteEmailAsync(String inviteId) {
        visitorInviteRepository.findById(inviteId).ifPresent(this::deliverInviteEmail);
    }

    public void retryPendingInviteEmails() {
        visitorInviteRepository.findByVisitorEmailIsNotNullAndEmailStatusAndEmailAttemptsLessThan(
                        NotificationStatus.PENDING,
                        EmailDeliveryPolicy.MAX_ATTEMPTS
                )
                .forEach(this::deliverInviteEmail);
    }

    private void deliverInviteEmail(VisitorInvite invite) {
        if (invite.getVisitorEmail() == null || invite.getVisitorEmail().isBlank()) {
            invite.setEmailStatus(NotificationStatus.FAILED);
            invite.setLastEmailError("Visitor email address was not provided.");
            visitorInviteRepository.save(invite);
            return;
        }
        if (invite.getEmailStatus() == NotificationStatus.SENT || invite.getEmailAttempts() >= EmailDeliveryPolicy.MAX_ATTEMPTS) {
            return;
        }

        Instant attemptAt = Instant.now();
        invite.setEmailAttempts(invite.getEmailAttempts() + 1);
        invite.setEmailLastAttemptAt(attemptAt);
        invite.setEmailStatus(NotificationStatus.SENDING);
        invite.setUpdatedAt(attemptAt);
        invite = visitorInviteRepository.save(invite);

        try {
            emailService.sendVisitorInvite(invite);
            Instant sentAt = Instant.now();
            invite.setEmailStatus(NotificationStatus.SENT);
            invite.setEmailSentAt(sentAt);
            invite.setLastEmailError(null);
            invite.setUpdatedAt(sentAt);
        } catch (RuntimeException ex) {
            invite.setEmailStatus(EmailDeliveryPolicy.statusAfterFailure(invite.getEmailAttempts()));
            invite.setLastEmailError(trimToNull(ex.getMessage()));
            invite.setUpdatedAt(Instant.now());
            log.warn("Visitor invite email attempt {} failed for invite {}: {}", invite.getEmailAttempts(), invite.getId(), ex.getMessage());
        }
        visitorInviteRepository.save(invite);
    }

    private String trimToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
