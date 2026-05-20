package com.visitor.management.repository;

import com.visitor.management.entity.Visitor;
import com.visitor.management.entity.VisitorStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface VisitorRepository extends MongoRepository<Visitor, String> {
    Optional<Visitor> findByQrCode(String qrCode);
    Optional<Visitor> findByPassTokenId(String passTokenId);

    Page<Visitor> findAllByHostEmployeeId(String hostEmployeeId, Pageable pageable);

    List<Visitor> findAllByEmailIgnoreCaseOrderByCreatedAtDesc(String email);

    List<Visitor> findAllByEmailIgnoreCaseAndOrganizationIdOrderByCreatedAtDesc(String email, String organizationId);

    List<Visitor> findTop8ByOrganizationIdOrderByUpdatedAtDesc(String organizationId);

    Optional<Visitor> findTopByOrganizationIdOrderByUpdatedAtDesc(String organizationId);

    long countByStatus(VisitorStatus status);

    List<Visitor> findAllByStatusOrderByCheckInTimeDesc(VisitorStatus status);

    List<Visitor> findAllByOrganizationIdAndStatusOrderByCheckInTimeDesc(String organizationId, VisitorStatus status);

    long countByOrganizationId(String organizationId);

    long countByOrganizationIdAndStatus(String organizationId, VisitorStatus status);

    long countByOrganizationIdAndCreatedAtGreaterThanEqual(String organizationId, Instant createdAt);

    long countByCheckInTimeBetween(Instant start, Instant end);

    long countByOrganizationIdAndCheckInTimeBetween(String organizationId, Instant start, Instant end);
}
