package com.visitor.management.repository;

import com.visitor.management.entity.Visitor;
import com.visitor.management.entity.VisitorStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.time.Instant;
import java.util.Optional;

public interface VisitorRepository extends MongoRepository<Visitor, String> {
    Optional<Visitor> findByQrCode(String qrCode);

    Page<Visitor> findAllByHostEmployeeId(String hostEmployeeId, Pageable pageable);

    long countByStatus(VisitorStatus status);

    long countByCheckInTimeBetween(Instant start, Instant end);
}
