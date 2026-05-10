package com.visitor.management.repository;

import com.visitor.management.entity.VisitorAuditLog;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface VisitorAuditLogRepository extends MongoRepository<VisitorAuditLog, String> {
    List<VisitorAuditLog> findAllByVisitorIdOrderByCreatedAtAsc(String visitorId);
}
