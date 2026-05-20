package com.visitor.management.repository;

import com.visitor.management.entity.AccessAuditLog;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.time.Instant;
import java.util.List;

public interface AccessAuditLogRepository extends MongoRepository<AccessAuditLog, String> {
    List<AccessAuditLog> findTop50ByOrderByCreatedAtDesc();
    List<AccessAuditLog> findTop50ByOrganizationIdOrderByCreatedAtDesc(String organizationId);
    List<AccessAuditLog> findTop12ByOrganizationIdOrderByCreatedAtDesc(String organizationId);
    List<AccessAuditLog> findTop100ByCreatedAtAfterOrderByCreatedAtAsc(Instant createdAt);
    List<AccessAuditLog> findTop100ByOrganizationIdAndCreatedAtAfterOrderByCreatedAtAsc(String organizationId, Instant createdAt);
    List<AccessAuditLog> findTop100ByOrderByCreatedAtDesc();
    List<AccessAuditLog> findTop100ByOrganizationIdOrderByCreatedAtDesc(String organizationId);
}
