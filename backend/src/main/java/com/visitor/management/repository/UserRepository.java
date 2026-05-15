package com.visitor.management.repository;

import com.visitor.management.entity.Role;
import com.visitor.management.entity.User;
import com.visitor.management.entity.AccountStatus;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Optional;
import java.util.Collection;
import java.util.List;

public interface UserRepository extends MongoRepository<User, String> {
    Optional<User> findByEmailIgnoreCase(String email);

    Optional<User> findByUsernameIgnoreCase(String username);

    Optional<User> findByFullNameIgnoreCase(String fullName);

    boolean existsByEmailIgnoreCase(String email);

    boolean existsByUsernameIgnoreCase(String username);

    boolean existsByRolesContaining(Role role);

    boolean existsByRolesIn(Collection<Role> roles);

    List<User> findAllByOrganizationId(String organizationId);

    List<User> findAllByOrganizationIdAndRolesContaining(String organizationId, Role role);

    List<User> findAllByRolesContaining(Role role);

    Optional<User> findByEmployeeQrToken(String employeeQrToken);

    long countByRolesContainingAndActiveTrueAndAccountStatus(Role role, AccountStatus accountStatus);
}
