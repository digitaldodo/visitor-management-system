package com.visitor.management.repository;

import com.visitor.management.entity.EmergencyIncident;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface EmergencyIncidentRepository extends MongoRepository<EmergencyIncident, String> {
    List<EmergencyIncident> findTop75ByOrganizationIdOrderByCreatedAtDesc(String organizationId);

    List<EmergencyIncident> findTop75ByOrderByCreatedAtDesc();

    long countByOrganizationIdAndSubjectTypeAndSubjectId(String organizationId, String subjectType, String subjectId);
}
