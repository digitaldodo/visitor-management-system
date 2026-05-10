package com.visitor.management.repository;

import com.visitor.management.entity.Role;
import com.visitor.management.entity.User;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Optional;
import java.util.Collection;

public interface UserRepository extends MongoRepository<User, String> {
    Optional<User> findByEmailIgnoreCase(String email);

    Optional<User> findByUsernameIgnoreCase(String username);

    boolean existsByEmailIgnoreCase(String email);

    boolean existsByUsernameIgnoreCase(String username);

    boolean existsByRolesContaining(Role role);

    boolean existsByRolesIn(Collection<Role> roles);
}
