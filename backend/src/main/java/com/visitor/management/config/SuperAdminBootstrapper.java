package com.visitor.management.config;

import com.visitor.management.entity.AccountStatus;
import com.visitor.management.entity.Role;
import com.visitor.management.entity.User;
import com.visitor.management.repository.UserRepository;
import com.visitor.management.validation.UsernamePolicy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

@Component
@Profile("!test")
public class SuperAdminBootstrapper implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SuperAdminBootstrapper.class);

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
        try {
            if (adminExists()) {
                return;
            }

            String username = required("SUPER_ADMIN_USERNAME");
            String email = required("SUPER_ADMIN_EMAIL").toLowerCase(java.util.Locale.ROOT);
            String password = required("SUPER_ADMIN_PASSWORD");
            String name = displayName(username);

            validate(name, username, email, password);

            if (userRepository.existsByUsernameIgnoreCase(username) || userRepository.existsByEmailIgnoreCase(email)) {
                throw new IllegalStateException("Initial SUPER_ADMIN username or email already exists without an admin role.");
            }

            User user = new User();
            user.setFullName(name.trim());
            user.setUsername(UsernamePolicy.normalizeForLookup(username));
            user.setEmail(email);
            user.setPasswordHash(passwordEncoder.encode(password));
            user.setRoles(Set.of(Role.SUPER_ADMIN));
            user.setActive(true);
            user.setAccountStatus(AccountStatus.ACTIVE);
            user.setPasswordChangedAt(Instant.now());
            userRepository.save(user);
            log.info("Initial AccessFlow SUPER_ADMIN account bootstrapped for {}.", email);
        } catch (RuntimeException ex) {
            log.error("AccessFlow SUPER_ADMIN bootstrap did not complete during startup: {}", ex.getMessage());
        }
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
            throw new IllegalStateException("SUPER_ADMIN_USERNAME must produce a valid display name.");
        }
        if (!UsernamePolicy.validate(username).isEmpty()) {
            throw new IllegalStateException("SUPER_ADMIN_USERNAME must be 3-32 characters long and use only lowercase letters, numbers, or underscores.");
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
        String normalized = value.toLowerCase(java.util.Locale.ROOT);
        return normalized.contains("replace-with")
                || normalized.contains("example.com")
                || normalized.contains("changeme")
                || normalized.contains("change-me")
                || normalized.contains("placeholder");
    }

    private String displayName(String username) {
        String normalized = username.replaceAll("[._-]+", " ").trim();
        if (normalized.isBlank()) {
            return username;
        }
        StringBuilder result = new StringBuilder();
        for (String part : normalized.split("\\s+")) {
            if (part.isBlank()) {
                continue;
            }
            if (!result.isEmpty()) {
                result.append(' ');
            }
            result.append(Character.toUpperCase(part.charAt(0)));
            if (part.length() > 1) {
                result.append(part.substring(1).toLowerCase(java.util.Locale.ROOT));
            }
        }
        return result.toString();
    }
}
