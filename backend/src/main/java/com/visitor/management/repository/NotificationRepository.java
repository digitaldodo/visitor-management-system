package com.visitor.management.repository;

import com.visitor.management.entity.Notification;
import com.visitor.management.entity.NotificationStatus;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface NotificationRepository extends MongoRepository<Notification, String> {
    List<Notification> findByRecipientUserIdOrderByCreatedAtDesc(String recipientUserId, Pageable pageable);

    long countByRecipientUserIdAndReadFalse(String recipientUserId);

    List<Notification> findByEmailEnabledTrueAndEmailStatusAndEmailAttemptsLessThan(NotificationStatus status, int attempts, Pageable pageable);
}
