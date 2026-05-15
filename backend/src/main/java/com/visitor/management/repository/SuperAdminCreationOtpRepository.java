package com.visitor.management.repository;

import com.visitor.management.entity.SuperAdminCreationOtp;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Optional;

public interface SuperAdminCreationOtpRepository extends MongoRepository<SuperAdminCreationOtp, String> {
    Optional<SuperAdminCreationOtp> findTopByActorUserIdAndUsedAtIsNullOrderByCreatedAtDesc(String actorUserId);
}
