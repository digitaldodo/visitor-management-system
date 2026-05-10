package com.visitor.management.config;

import com.visitor.management.entity.AccountStatus;
import com.visitor.management.entity.Role;
import com.visitor.management.entity.User;
import com.visitor.management.repository.UserRepository;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

@Component
@Profile("!test")
public class SuperAdminBootstrapper implements ApplicationRunner {

    private static final Pattern USERNAME_PATTERN = Pattern.compile("^[A-Za-z0-9._-]{3,32}$");
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    private static final Pattern STRONG_PASSWORD_PATTERN = Pattern.compile("^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{12,128}$");

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final Environment environment;

    public SuperAdminBootstrapper(UserRepository userRepository, PasswordEncoder passwordEncoder, Environment environment) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.environment = environment;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (adminExists()) {
            return;
        }

        String name = required("SUPER_ADMIN_NAME");
        String username = required("SUPER_ADMIN_USERNAME").toLowerCase(Locale.ROOT);
        String email = required("SUPER_ADMIN_EMAIL").toLowerCase(Locale.ROOT);
        String password = required("SUPER_ADMIN_PASSWORD");

        validate(name, username, email, password);

        if (userRepository.existsByUsernameIgnoreCase(username) || userRepository.existsByEmailIgnoreCase(email)) {
            throw new IllegalStateException("Initial SUPER_ADMIN username or email already exists without an admin role.");
        }

        User user = new User();
        user.setFullName(name.trim());
        user.setUsername(username);
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(password));
        user.setRoles(Set.of(Role.SUPER_ADMIN));
        user.setActive(true);
        user.setAccountStatus(AccountStatus.ACTIVE);
        user.setPasswordChangedAt(Instant.now());
        userRepository.save(user);
    }

    private boolean adminExists() {
        return userRepository.existsByRolesIn(List.of(Role.SUPER_ADMIN, Role.ADMIN));
    }

    private String required(String name) {
        String value = environment.getProperty(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(name + " is required to bootstrap the initial SUPER_ADMIN account.");
        }
        return value.trim();
    }

    private void validate(String name, String username, String email, String password) {
        if (name.trim().length() < 2 || name.trim().length() > 120) {
            throw new IllegalStateException("SUPER_ADMIN_NAME must be 2-120 characters.");
        }
        if (!USERNAME_PATTERN.matcher(username).matches()) {
            throw new IllegalStateException("SUPER_ADMIN_USERNAME must be 3-32 characters and use only letters, numbers, dots, underscores, or hyphens.");
        }
        if (!EMAIL_PATTERN.matcher(email).matches()) {
            throw new IllegalStateException("SUPER_ADMIN_EMAIL must be a valid email address.");
        }
        if (!STRONG_PASSWORD_PATTERN.matcher(password).matches()) {
            throw new IllegalStateException("SUPER_ADMIN_PASSWORD must be 12-128 characters and include uppercase, lowercase, number, and symbol.");
        }
        if (hasPlaceholder(name) || hasPlaceholder(username) || hasPlaceholder(email) || hasPlaceholder(password)) {
            throw new IllegalStateException("SUPER_ADMIN bootstrap values must not use placeholder values.");
        }
    }

    private boolean hasPlaceholder(String value) {
        String normalized = value.toLowerCase(Locale.ROOT);
        return normalized.contains("replace-with")
                || normalized.contains("example.com")
                || normalized.contains("changeme")
                || normalized.contains("change-me")
                || normalized.contains("placeholder");
    }
}
