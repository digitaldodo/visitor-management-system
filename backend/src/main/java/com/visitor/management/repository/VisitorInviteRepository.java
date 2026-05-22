package com.visitor.management.repository;

import com.visitor.management.entity.VisitorInvite;
import com.visitor.management.entity.VisitorInviteStatus;
import com.visitor.management.entity.NotificationStatus;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface VisitorInviteRepository extends MongoRepository<VisitorInvite, String> {
    Optional<VisitorInvite> findByTokenHash(String tokenHash);

    List<VisitorInvite> findTop50ByHostEmployeeIdOrderByCreatedAtDesc(String hostEmployeeId);

    List<VisitorInvite> findTop50ByOrganizationIdOrderByCreatedAtDesc(String organizationId);

    List<VisitorInvite> findAllByStatusInAndExpiresAtBefore(List<VisitorInviteStatus> statuses, Instant expiresAt);

    List<VisitorInvite> findByVisitorEmailIsNotNullAndEmailStatusAndEmailAttemptsLessThan(NotificationStatus status, int attempts);
}
