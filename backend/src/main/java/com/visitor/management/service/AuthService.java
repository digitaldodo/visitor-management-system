package com.visitor.management.service;

import com.visitor.management.dto.AuthRequest;
import com.visitor.management.dto.AuthResponse;
import com.visitor.management.dto.ForgotPasswordRequest;
import com.visitor.management.dto.ForgotPasswordResponse;
import com.visitor.management.dto.RefreshTokenRequest;
import com.visitor.management.dto.RegisterRequest;
import com.visitor.management.dto.ResetPasswordRequest;
import com.visitor.management.dto.UserProfileResponse;
import com.visitor.management.dto.VerifyOtpRequest;
import com.visitor.management.dto.VerifyOtpResponse;
import com.visitor.management.entity.AccountStatus;
import com.visitor.management.entity.PasswordResetToken;
import com.visitor.management.entity.RefreshToken;
import com.visitor.management.entity.Role;
import com.visitor.management.entity.User;
import com.visitor.management.exception.BadRequestException;
import com.visitor.management.exception.ConflictException;
import com.visitor.management.exception.UnauthorizedException;
import com.visitor.management.repository.PasswordResetTokenRepository;
import com.visitor.management.repository.RefreshTokenRepository;
import com.visitor.management.repository.UserRepository;
import com.visitor.management.security.JwtService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.security.SecureRandom;
import java.util.Set;
import java.util.regex.Pattern;

@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);
    private static final Duration OTP_EXPIRY = Duration.ofMinutes(5);
    private static final Duration RESET_TOKEN_EXPIRY = Duration.ofMinutes(10);
    private static final Duration RESEND_COOLDOWN = Duration.ofSeconds(60);
    private static final int MAX_OTP_ATTEMPTS = 5;
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    private static final Pattern STRONG_PASSWORD_PATTERN = Pattern.compile("^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{12,128}$");

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final TokenService tokenService;
    private final EmailService emailService;
    private final RateLimitService rateLimitService;
    private final SecureRandom secureRandom = new SecureRandom();

    public AuthService(
            UserRepository userRepository,
            RefreshTokenRepository refreshTokenRepository,
            PasswordResetTokenRepository passwordResetTokenRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            TokenService tokenService,
            EmailService emailService,
            RateLimitService rateLimitService
    ) {
        this.userRepository = userRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.passwordResetTokenRepository = passwordResetTokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.tokenService = tokenService;
        this.emailService = emailService;
        this.rateLimitService = rateLimitService;
    }

    public UserProfileResponse register(RegisterRequest request, Authentication authentication) {
        Role requestedRole = request.role();

        if (requestedRole == Role.SUPER_ADMIN) {
            throw new BadRequestException("SUPER_ADMIN accounts are created only by the secure environment bootstrap process.");
        }

        if (!adminExists()) {
            throw new BadRequestException("Initial SUPER_ADMIN bootstrap must complete before account registration.");
        }

        if (requestedRole == Role.ADMIN) {
            requireSuperAdmin(authentication);
        } else if (requestedRole == Role.SECURITY_GUARD) {
            requireAdminOrSuperAdmin(authentication);
        }

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
        user.setEmail(request.email().trim().toLowerCase());
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setDepartment(trimToNull(request.department()));
        user.setPhone(trimToNull(request.phone()));
        user.setRoles(Set.of(requestedRole));
        user.setActive(true);
        user.setAccountStatus(AccountStatus.ACTIVE);

        return toProfile(userRepository.save(user));
    }

    public AuthResponse login(AuthRequest request) {
        String identifier = normalizeIdentifier(request.loginIdentifier());
        User user = findByIdentifier(identifier)
                .filter(this::isActiveAccount)
                .filter(candidate -> passwordEncoder.matches(request.password(), candidate.getPasswordHash()))
                .orElseThrow(() -> new UnauthorizedException("Invalid username/email or password."));

        return issueTokens(user);
    }

    public AuthResponse refresh(RefreshTokenRequest request) {
        RefreshToken refreshToken = refreshTokenRepository.findByTokenHash(tokenService.hash(request.refreshToken()))
                .orElseThrow(() -> new UnauthorizedException("Refresh token is invalid."));

        if (refreshToken.isRevoked() || refreshToken.isExpired()) {
            throw new UnauthorizedException("Refresh token has expired or was revoked.");
        }

        User user = userRepository.findById(refreshToken.getUserId())
                .filter(this::isActiveAccount)
                .orElseThrow(() -> new UnauthorizedException("Refresh token user is no longer active."));

        revoke(refreshToken);
        return issueTokens(user);
    }

    public void logout(String refreshToken) {
        refreshTokenRepository.findByTokenHash(tokenService.hash(refreshToken))
                .ifPresent(this::revoke);
    }

    public ForgotPasswordResponse forgotPassword(ForgotPasswordRequest request) {
        String identifier = normalizeIdentifier(request.identifier());
        rateLimitService.check("forgot-password", identifier, 5, Duration.ofMinutes(15));
        Instant fallbackExpiresAt = Instant.now().plus(OTP_EXPIRY);

        findByIdentifier(identifier)
                .filter(this::isActiveAccount)
                .ifPresent(user -> createOrResendOtp(user, fallbackExpiresAt));

        return new ForgotPasswordResponse(true, fallbackExpiresAt);
    }

    public VerifyOtpResponse verifyOtp(VerifyOtpRequest request) {
        String identifier = normalizeIdentifier(request.identifier());
        rateLimitService.check("verify-otp", identifier, 10, Duration.ofMinutes(10));

        User user = findByIdentifier(identifier)
                .filter(this::isActiveAccount)
                .orElseThrow(() -> invalidOtp());

        PasswordResetToken resetToken = passwordResetTokenRepository.findTopByUserIdAndUsedAtIsNullOrderByCreatedAtDesc(user.getId())
                .orElseThrow(() -> invalidOtp());

        Instant now = Instant.now();
        if (resetToken.getLockedAt() != null
                || resetToken.getVerifiedAt() != null
                || resetToken.getExpiresAt() == null
                || resetToken.getExpiresAt().isBefore(now)
                || resetToken.getOtpHash() == null) {
            throw invalidOtp();
        }

        String expectedHash = tokenService.hash(user.getId() + ":" + request.otp());
        if (!expectedHash.equals(resetToken.getOtpHash())) {
            resetToken.setAttempts(resetToken.getAttempts() + 1);
            if (resetToken.getAttempts() >= resetToken.getMaxAttempts()) {
                resetToken.setLockedAt(now);
            }
            passwordResetTokenRepository.save(resetToken);
            throw invalidOtp();
        }

        String resetTokenValue = tokenService.generateOpaqueToken();
        Instant resetTokenExpiresAt = now.plus(RESET_TOKEN_EXPIRY);
        resetToken.setOtpHash(null);
        resetToken.setVerifiedAt(now);
        resetToken.setResetTokenHash(tokenService.hash(resetTokenValue));
        resetToken.setResetTokenExpiresAt(resetTokenExpiresAt);
        passwordResetTokenRepository.save(resetToken);

        return new VerifyOtpResponse(resetTokenValue, resetTokenExpiresAt);
    }

    public void resetPassword(ResetPasswordRequest request) {
        validateStrongPassword(request.newPassword());

        PasswordResetToken resetToken = passwordResetTokenRepository.findByResetTokenHash(tokenService.hash(request.resetToken()))
                .orElseThrow(() -> new UnauthorizedException("Password reset token is invalid."));

        Instant now = Instant.now();
        if (resetToken.getUsedAt() != null
                || resetToken.getVerifiedAt() == null
                || resetToken.getResetTokenExpiresAt() == null
                || resetToken.getResetTokenExpiresAt().isBefore(now)) {
            throw new UnauthorizedException("Password reset token has expired or was already used.");
        }

        User user = userRepository.findById(resetToken.getUserId())
                .filter(this::isActiveAccount)
                .orElseThrow(() -> new UnauthorizedException("Password reset user is no longer active."));

        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        user.setPasswordChangedAt(now);
        userRepository.save(user);

        resetToken.setUsedAt(now);
        passwordResetTokenRepository.save(resetToken);
        revokeAllRefreshTokens(user.getId());
    }

    public UserProfileResponse currentUser(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new UnauthorizedException("Authentication is required.");
        }

        User user = userRepository.findById(authentication.getName())
                .filter(this::isActiveAccount)
                .orElseThrow(() -> new UnauthorizedException("Authenticated user was not found."));

        return toProfile(user);
    }

    private AuthResponse issueTokens(User user) {
        String accessToken = jwtService.generateAccessToken(user);
        String refreshToken = tokenService.generateOpaqueToken();

        RefreshToken entity = new RefreshToken();
        entity.setUserId(user.getId());
        entity.setTokenHash(tokenService.hash(refreshToken));
        entity.setExpiresAt(Instant.now().plusSeconds(jwtService.getRefreshExpirationDays() * 24 * 60 * 60));
        refreshTokenRepository.save(entity);

        return new AuthResponse(
                accessToken,
                refreshToken,
                "Bearer",
                jwtService.getAccessTokenExpiresAt(),
                user.getId(),
                user.getUsername(),
                user.getEmail(),
                user.getFullName(),
                user.getRoles()
        );
    }

    private boolean adminExists() {
        return userRepository.existsByRolesIn(List.of(Role.SUPER_ADMIN, Role.ADMIN));
    }

    private void requireSuperAdmin(Authentication authentication) {
        if (!hasRole(authentication, Role.SUPER_ADMIN)) {
            throw new UnauthorizedException("A SUPER_ADMIN account is required for this registration.");
        }
    }

    private void requireAdminOrSuperAdmin(Authentication authentication) {
        if (!hasRole(authentication, Role.SUPER_ADMIN) && !hasRole(authentication, Role.ADMIN)) {
            throw new UnauthorizedException("An ADMIN account is required for this registration.");
        }
    }

    private boolean hasRole(Authentication authentication, Role role) {
        String authorityName = "ROLE_" + role.name();
        return authentication != null
                && authentication.getAuthorities().stream().anyMatch(authority -> authorityName.equals(authority.getAuthority()));
    }

    private void revoke(RefreshToken refreshToken) {
        if (!refreshToken.isRevoked()) {
            refreshToken.setRevokedAt(Instant.now());
            refreshTokenRepository.save(refreshToken);
        }
    }

    private void revokeAllRefreshTokens(String userId) {
        List<RefreshToken> activeTokens = refreshTokenRepository.findAllByUserIdAndRevokedAtIsNull(userId);
        activeTokens.forEach(token -> token.setRevokedAt(Instant.now()));
        refreshTokenRepository.saveAll(activeTokens);
    }

    private UserProfileResponse toProfile(User user) {
        return new UserProfileResponse(
                user.getId(),
                user.getUsername(),
                user.getEmail(),
                user.getFullName(),
                user.getDepartment(),
                user.getPhone(),
                user.getRoles()
        );
    }

    private String trimToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private void createOrResendOtp(User user, Instant fallbackExpiresAt) {
        Instant now = Instant.now();
        Optional<PasswordResetToken> latest = passwordResetTokenRepository.findTopByUserIdAndUsedAtIsNullOrderByCreatedAtDesc(user.getId());
        if (latest.isPresent()) {
            PasswordResetToken token = latest.get();
            if (token.getResendAvailableAt() != null
                    && token.getResendAvailableAt().isAfter(now)
                    && token.getExpiresAt() != null
                    && token.getExpiresAt().isAfter(now)
                    && token.getVerifiedAt() == null
                    && token.getLockedAt() == null) {
                return;
            }
            if (token.getUsedAt() == null) {
                token.setUsedAt(now);
                passwordResetTokenRepository.save(token);
            }
        }

        String otp = "%06d".formatted(secureRandom.nextInt(1_000_000));
        PasswordResetToken passwordResetToken = new PasswordResetToken();
        passwordResetToken.setUserId(user.getId());
        passwordResetToken.setTokenHash(tokenService.hash(tokenService.generateOpaqueToken()));
        passwordResetToken.setOtpHash(tokenService.hash(user.getId() + ":" + otp));
        passwordResetToken.setExpiresAt(fallbackExpiresAt);
        passwordResetToken.setResendAvailableAt(now.plus(RESEND_COOLDOWN));
        passwordResetToken.setMaxAttempts(MAX_OTP_ATTEMPTS);
        passwordResetToken.setCreatedAt(now);
        passwordResetTokenRepository.save(passwordResetToken);

        try {
            emailService.sendPasswordResetOtp(user.getEmail(), user.getFullName(), otp);
        } catch (RuntimeException ex) {
            log.error("SendGrid password reset delivery failed for user {}.", user.getId(), ex);
        }
    }

    private Optional<User> findByIdentifier(String identifier) {
        if (identifier == null || identifier.isBlank()) {
            return Optional.empty();
        }
        if (EMAIL_PATTERN.matcher(identifier).matches()) {
            return userRepository.findByEmailIgnoreCase(identifier);
        }
        return userRepository.findByUsernameIgnoreCase(identifier);
    }

    private boolean isActiveAccount(User user) {
        return user.isActive() && (user.getAccountStatus() == null || user.getAccountStatus() == AccountStatus.ACTIVE);
    }

    private String normalizeIdentifier(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private String normalizeUsername(String value) {
        return value.trim().toLowerCase(Locale.ROOT);
    }

    private void validateStrongPassword(String password) {
        if (!STRONG_PASSWORD_PATTERN.matcher(password).matches()) {
            throw new BadRequestException("Password must be 12-128 characters and include uppercase, lowercase, number, and symbol.");
        }
    }

    private UnauthorizedException invalidOtp() {
        return new UnauthorizedException("Invalid or expired OTP.");
    }
}
