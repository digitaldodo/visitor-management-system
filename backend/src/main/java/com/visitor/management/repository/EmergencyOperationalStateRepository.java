package com.visitor.management.repository;

import com.visitor.management.entity.EmergencyOperationalState;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Optional;

public interface EmergencyOperationalStateRepository extends MongoRepository<EmergencyOperationalState, String> {
    Optional<EmergencyOperationalState> findByOrganizationId(String organizationId);
}
