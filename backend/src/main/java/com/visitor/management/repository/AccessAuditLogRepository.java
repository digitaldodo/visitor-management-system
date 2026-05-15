package com.visitor.management.repository;

import com.visitor.management.entity.AccessAuditLog;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface AccessAuditLogRepository extends MongoRepository<AccessAuditLog, String> {
    List<AccessAuditLog> findTop50ByOrderByCreatedAtDesc();
    List<AccessAuditLog> findTop50ByOrganizationIdOrderByCreatedAtDesc(String organizationId);
    List<AccessAuditLog> findTop12ByOrganizationIdOrderByCreatedAtDesc(String organizationId);
}
