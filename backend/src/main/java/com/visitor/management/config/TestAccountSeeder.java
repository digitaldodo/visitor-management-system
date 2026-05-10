package com.visitor.management.config;

import com.visitor.management.entity.Role;
import com.visitor.management.entity.AccountStatus;
import com.visitor.management.entity.User;
import com.visitor.management.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Set;

@Configuration
@Profile("!test")
public class TestAccountSeeder {

    private static final Logger log = LoggerFactory.getLogger(TestAccountSeeder.class);

    @Bean
    CommandLineRunner seedTestAccounts(AppProperties properties, UserRepository userRepository, PasswordEncoder passwordEncoder) {
        return args -> {
            if (!properties.getSeed().isTestAccounts()) {
                return;
            }

            if (userRepository.count() > 0) {
                log.info("Skipping test account seed because users already exist.");
                return;
            }

            createUser(userRepository, passwordEncoder, "Admin User", "admin", "admin@visitor.local", "Admin@12345", Role.ADMIN, "Operations");
            createUser(userRepository, passwordEncoder, "Employee User", "employee", "employee@visitor.local", "Employee@12345", Role.EMPLOYEE, "People");
            createUser(userRepository, passwordEncoder, "Security Guard", "security", "security@visitor.local", "Security@12345", Role.SECURITY_GUARD, "Security");
            log.info("Seeded Visitor Management test accounts. Disable APP_SEED_TEST_ACCOUNTS outside controlled environments.");
        };
    }

    private void createUser(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            String fullName,
            String username,
            String email,
            String password,
            Role role,
            String department
    ) {
        User user = new User();
        user.setFullName(fullName);
        user.setUsername(username);
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(password));
        user.setRoles(Set.of(role));
        user.setDepartment(department);
        user.setActive(true);
        user.setAccountStatus(AccountStatus.ACTIVE);
        userRepository.save(user);
    }
}
