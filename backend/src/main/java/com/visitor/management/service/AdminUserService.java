package com.visitor.management.service;

import com.visitor.management.dto.AdminPasswordResetRequest;
import com.visitor.management.dto.AdminUserCreateRequest;
import com.visitor.management.dto.AdminUserResponse;
import com.visitor.management.dto.AdminUserRoleUpdateRequest;
import com.visitor.management.entity.AccountStatus;
import com.visitor.management.entity.Role;
import com.visitor.management.entity.User;
import com.visitor.management.exception.BadRequestException;
import com.visitor.management.exception.ConflictException;
import com.visitor.management.exception.ResourceNotFoundException;
import com.visitor.management.repository.RefreshTokenRepository;
import com.visitor.management.repository.UserRepository;
import org.springframework.data.domain.Sort;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

@Service
public class AdminUserService {

    private static final Pattern STRONG_PASSWORD_PATTERN = Pattern.compile("^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{12,128}$");

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;

    public AdminUserService(
            UserRepository userRepository,
            RefreshTokenRepository refreshTokenRepository,
            PasswordEncoder passwordEncoder
    ) {
        this.userRepository = userRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public List<AdminUserResponse> listUsers() {
        return userRepository.findAll(Sort.by(Sort.Direction.ASC, "fullName"))
                .stream()
                .map(this::toResponse)
                .toList();
    }

    public AdminUserResponse createUser(AdminUserCreateRequest request, Authentication authentication) {
        Role role = request.role();
        validateAssignableRole(role, authentication);

        if (userRepository.existsByEmailIgnoreCase(request.email())) {
            throw new ConflictException("An account with this email already exists.");
        }

        String username = normalizeUsername(request.username());
        if (userRepository.existsByUsernameIgnoreCase(username)) {
            throw new ConflictException("An account with this username already exists.");
        }

        validateStrongPassword(request.password());

        User user = new User();
        user.setFullName(request.fullName().trim());
        user.setUsername(username);
        user.setEmail(request.email().trim().toLowerCase(Locale.ROOT));
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setDepartment(trimToNull(request.department()));
        user.setPhone(trimToNull(request.phone()));
        user.setRoles(Set.of(role));
        user.setActive(true);
        user.setAccountStatus(AccountStatus.ACTIVE);
        return toResponse(userRepository.save(user));
    }

    public AdminUserResponse disableUser(String id, Authentication authentication) {
        User user = findUser(id);
        validateMutableAccount(user, authentication);
        user.setActive(false);
        user.setAccountStatus(AccountStatus.DISABLED);
        User saved = userRepository.save(user);
        revokeAllRefreshTokens(saved.getId());
        return toResponse(saved);
    }

    public AdminUserResponse enableUser(String id, Authentication authentication) {
        User user = findUser(id);
        validateMutableAccount(user, authentication);
        user.setActive(true);
        user.setAccountStatus(AccountStatus.ACTIVE);
        return toResponse(userRepository.save(user));
    }

    public AdminUserResponse resetPassword(String id, AdminPasswordResetRequest request, Authentication authentication) {
        User user = findUser(id);
        validateMutableAccount(user, authentication);
        validateStrongPassword(request.newPassword());
        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        user.setPasswordChangedAt(Instant.now());
        User saved = userRepository.save(user);
        revokeAllRefreshTokens(saved.getId());
        return toResponse(saved);
    }

    public AdminUserResponse updateRole(String id, AdminUserRoleUpdateRequest request, Authentication authentication) {
        User user = findUser(id);
        validateMutableAccount(user, authentication);
        Role role = request.role();
        validateAssignableRole(role, authentication);
        if (user.getRoles().contains(role) && user.getRoles().size() == 1) {
            return toResponse(user);
        }
        user.setRoles(Set.of(role));
        User saved = userRepository.save(user);
        revokeAllRefreshTokens(saved.getId());
        return toResponse(saved);
    }

    private void validateAssignableRole(Role role, Authentication authentication) {
        if (role == Role.SUPER_ADMIN || role == Role.VISITOR) {
            throw new BadRequestException("This role cannot be created from internal user management.");
        }
        if (role == Role.ADMIN && !hasRole(authentication, Role.SUPER_ADMIN)) {
            throw new BadRequestException("Only SUPER_ADMIN can create admin accounts.");
        }
        if (role != Role.ADMIN && role != Role.EMPLOYEE && role != Role.SECURITY_GUARD) {
            throw new BadRequestException("Unsupported internal account role.");
        }
    }

    private void validateMutableAccount(User user, Authentication authentication) {
        if (user.getRoles().contains(Role.SUPER_ADMIN)) {
            throw new BadRequestException("SUPER_ADMIN accounts are managed by the secure environment bootstrap process.");
        }
        if (user.getRoles().contains(Role.ADMIN) && !hasRole(authentication, Role.SUPER_ADMIN)) {
            throw new BadRequestException("Only SUPER_ADMIN can manage admin accounts.");
        }
        if (authentication != null && user.getId() != null && user.getId().equals(authentication.getName())) {
            throw new BadRequestException("You cannot change your own access state from this panel.");
        }
    }

    private User findUser(String id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User account was not found."));
    }

    private boolean hasRole(Authentication authentication, Role role) {
        String authorityName = "ROLE_" + role.name();
        return authentication != null
                && authentication.getAuthorities().stream().anyMatch(authority -> authorityName.equals(authority.getAuthority()));
    }

    private void revokeAllRefreshTokens(String userId) {
        var activeTokens = refreshTokenRepository.findAllByUserIdAndRevokedAtIsNull(userId);
        activeTokens.forEach(token -> token.setRevokedAt(Instant.now()));
        refreshTokenRepository.saveAll(activeTokens);
    }

    private AdminUserResponse toResponse(User user) {
        return new AdminUserResponse(
                user.getId(),
                user.getUsername(),
                user.getEmail(),
                user.getFullName(),
                user.getDepartment(),
                user.getPhone(),
                user.getRoles(),
                user.isActive(),
                user.getAccountStatus(),
                user.getCreatedAt(),
                user.getUpdatedAt()
        );
    }

    private String normalizeUsername(String value) {
        return value.trim().toLowerCase(Locale.ROOT);
    }

    private String trimToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private void validateStrongPassword(String password) {
        if (!STRONG_PASSWORD_PATTERN.matcher(password).matches()) {
            throw new BadRequestException("Password must be 12-128 characters and include uppercase, lowercase, number, and symbol.");
        }
    }
}
