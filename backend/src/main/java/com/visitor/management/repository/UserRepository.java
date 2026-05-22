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

    Optional<User> findByEmailVerificationTokenHash(String emailVerificationTokenHash);

    Optional<User> findByUsernameIgnoreCase(String username);

    Optional<User> findByFullNameIgnoreCase(String fullName);

    boolean existsByEmailIgnoreCase(String email);

    boolean existsByUsernameIgnoreCase(String username);

    boolean existsByRolesContaining(Role role);

    boolean existsByRolesIn(Collection<Role> roles);

    List<User> findAllByOrganizationId(String organizationId);

    List<User> findAllByOrganizationIdAndRolesIn(String organizationId, Collection<Role> roles);

    List<User> findAllByRolesIn(Collection<Role> roles);

    List<User> findAllByOrganizationIdAndRolesContaining(String organizationId, Role role);

    List<User> findAllByOrganizationIdAndRolesContainingAndAccountStatus(String organizationId, Role role, AccountStatus accountStatus);

    List<User> findAllByOrganizationIdAndRolesInAndAccountStatus(String organizationId, Collection<Role> roles, AccountStatus accountStatus);

    List<User> findAllByRolesContaining(Role role);

    List<User> findAllByRolesContainingAndAccountStatus(Role role, AccountStatus accountStatus);

    List<User> findAllByRolesInAndAccountStatus(Collection<Role> roles, AccountStatus accountStatus);

    List<User> findAllByOrganizationIdAndWorkforceOnboardingCreatedById(String organizationId, String workforceOnboardingCreatedById);

    Optional<User> findByEmployeeQrToken(String employeeQrToken);

    long countByRolesContainingAndActiveTrueAndAccountStatus(Role role, AccountStatus accountStatus);
}
