package com.visitor.management.repository;

import com.visitor.management.entity.Department;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface DepartmentRepository extends MongoRepository<Department, String> {
    List<Department> findAllByOrganizationId(String organizationId, Sort sort);

    List<Department> findAllByOrganizationIdAndActiveStatusTrue(String organizationId, Sort sort);

    List<Department> findAllByActiveStatusTrue(Sort sort);

    Optional<Department> findByOrganizationIdAndNormalizedName(String organizationId, String normalizedName);
}
