package com.visitor.management.repository;

import com.visitor.management.entity.Organization;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface OrganizationRepository extends MongoRepository<Organization, String> {
    Optional<Organization> findByCompanyCodeIgnoreCase(String companyCode);

    Optional<Organization> findByCompanyNameIgnoreCase(String companyName);

    boolean existsByCompanyCodeIgnoreCase(String companyCode);

    List<Organization> findAllByActiveStatusTrue(Sort sort);
}
