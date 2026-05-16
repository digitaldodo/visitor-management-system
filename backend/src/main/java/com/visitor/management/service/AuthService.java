package com.visitor.management.service;

import com.visitor.management.config.CorsOriginResolver;
import com.visitor.management.dto.AuthRequest;
import com.visitor.management.dto.AuthResponse;
import com.visitor.management.dto.EmailVerificationDispatchRequest;
import com.visitor.management.dto.EmailVerificationDispatchResponse;
import com.visitor.management.dto.EmailVerificationStatusResponse;
import com.visitor.management.dto.ForgotPasswordRequest;
import com.visitor.management.dto.ForgotPasswordResponse;
import com.visitor.management.dto.RefreshTokenRequest;
import com.visitor.management.dto.RegisterRequest;
import com.visitor.management.dto.ResetPasswordRequest;
import com.visitor.management.dto.UserProfileResponse;
import com.visitor.management.dto.VerifyOtpRequest;
import com.visitor.management.dto.VerifyOtpResponse;
import com.visitor.management.entity.AccountStatus;
import com.visitor.management.entity.Organization;
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
import com.visitor.management.validation.UsernamePolicy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.util.UriComponentsBuilder;

import java.time.Duration;
import java.time.Instant;
import java.security.SecureRandom;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);
    private static final Duration OTP_EXPIRY = Duration.ofMinutes(5);
    private static final Duration RESET_TOKEN_EXPIRY = Duration.ofMinutes(10);
    private static final Duration RESEND_COOLDOWN = Duration.ofSeconds(60);
    private static final Duration EMAIL_VERIFICATION_EXPIRY = Duration.ofHours(24);
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
    private final OrganizationService organizationService;
    private final AccessAuditService accessAuditService;
    private final PhoneNumberService phoneNumberService;
    private final CorsOriginResolver corsOriginResolver;
    private final SecureRandom secureRandom = new SecureRandom();

    public AuthService(
            UserRepository userRepository,
            RefreshTokenRepository refreshTokenRepository,
            PasswordResetTokenRepository passwordResetTokenRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            TokenService tokenService,
            EmailService emailService,
            RateLimitService rateLimitService,
            OrganizationService organizationService,
            AccessAuditService accessAuditService,
            PhoneNumberService phoneNumberService,
            CorsOriginResolver corsOriginResolver
    ) {
        this.userRepository = userRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.passwordResetTokenRepository = passwordResetTokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.tokenService = tokenService;
        this.emailService = emailService;
        this.rateLimitService = rateLimitService;
        this.organizationService = organizationService;
        this.accessAuditService = accessAuditService;
        this.phoneNumberService = phoneNumberService;
        this.corsOriginResolver = corsOriginResolver;
    }

    public EmailVerificationDispatchResponse register(RegisterRequest request, Authentication authentication, String clientFingerprint) {
        rateLimitService.check("register-visitor-client", clientFingerprint, 5, Duration.ofMinutes(15));
        rateLimitService.check("register-visitor-email", normalizeIdentifier(request.email()), 3, Duration.ofHours(1));

        if (userRepository.existsByEmailIgnoreCase(request.email())) {
            throw new ConflictException("An account with this email already exists.");
        }

        String username = normalizeUsername(request.username());
        rateLimitService.check("register-visitor-username", username, 3, Duration.ofHours(1));
        if (userRepository.existsByUsernameIgnoreCase(username)) {
            throw new ConflictException("An account with this username already exists.");
        }

        validateStrongPassword(request.password());

        Organization organization = organizationService.resolveRequired(request.companyCode(), request.companyName());

        User user = new User();
        user.setFullName(request.fullName().trim());
        user.setUsername(username);
        user.setEmail(request.email().trim().toLowerCase());
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setDepartment(null);
        PhoneNumberService.NormalizedPhone phone = phoneNumberService.normalize(request.phoneCountryCode(), request.phone(), false);
        if (phone != null) {
            user.setPhone(phone.e164());
            user.setPhoneCountryCode(phone.countryCode());
        }
        applyOrganization(user, organization);
        user.setRoles(Set.of(Role.VISITOR));
        user.setActive(true);
        user.setAccountStatus(AccountStatus.UNVERIFIED);
        user.setEmailVerified(Boolean.FALSE);

        User saved = userRepository.save(user);
        EmailVerificationDispatchResponse response = issueVisitorVerification(saved, false);
        accessAuditService.recordVisitorAccountRegistered(saved);
        return response;
    }

    public AuthResponse login(AuthRequest request, String clientFingerprint) {
        String identifier = normalizeIdentifier(request.loginIdentifier());
        try {
            User user = findByIdentifier(identifier)
                    .orElseThrow(() -> new UnauthorizedException("Invalid username/email or password."));
            if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
                throw new UnauthorizedException("Invalid username/email or password.");
            }
            validateOrganizationLogin(user, request.companyCode());
            validatePortalAudience(user, request.portalAudience());
            if (isPendingVisitorVerification(user)) {
                throw new UnauthorizedException("Please verify your email before signing in.");
            }
            if (!isActiveAccount(user)) {
                throw new UnauthorizedException("Invalid username/email or password.");
            }
            accessAuditService.recordLoginSuccess(user, request.portalAudience());
            return issueTokens(user);
        } catch (UnauthorizedException ex) {
            rateLimitService.check("login-failure-client", clientFingerprint, 12, Duration.ofMinutes(10));
            rateLimitService.check("login-failure-identifier", identifier + ":" + clientFingerprint, 10, Duration.ofMinutes(10));
            accessAuditService.recordLoginFailure(identifier, request.companyCode(), request.portalAudience(), ex.getMessage());
            throw ex;
        }
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

    public EmailVerificationDispatchResponse resendVisitorVerification(EmailVerificationDispatchRequest request, String clientFingerprint) {
        String identifier = normalizeIdentifier(request.lookupIdentifier());
        rateLimitService.check("resend-visitor-verification-client", clientFingerprint, 6, Duration.ofMinutes(30));
        rateLimitService.check("resend-visitor-verification-identifier", identifier, 6, Duration.ofMinutes(30));

        Instant now = Instant.now();
        Instant fallbackSentAt = now;
        Instant fallbackExpiresAt = now.plus(EMAIL_VERIFICATION_EXPIRY);
        Instant fallbackResendAvailableAt = now.plus(RESEND_COOLDOWN);

        Optional<User> candidate = findByIdentifier(identifier)
                .filter(this::isPendingVisitorVerification);
        if (candidate.isEmpty()) {
            return new EmailVerificationDispatchResponse(null, true, fallbackExpiresAt, fallbackSentAt, fallbackResendAvailableAt, Set.of(Role.VISITOR));
        }

        return issueVisitorVerification(candidate.get(), true);
    }

    public EmailVerificationStatusResponse verifyVisitorEmail(String token, String clientFingerprint) {
        String normalizedToken = trimToNull(token);
        if (normalizedToken == null) {
            throw invalidVerificationToken();
        }

        rateLimitService.check("verify-visitor-email-client", clientFingerprint, 20, Duration.ofMinutes(10));
        rateLimitService.check("verify-visitor-email-token", tokenService.hash(normalizedToken), 8, Duration.ofMinutes(10));

        User user = userRepository.findByEmailVerificationTokenHash(tokenService.hash(normalizedToken))
                .filter(this::isPendingVisitorVerification)
                .orElseThrow(() -> {
                    accessAuditService.recordVisitorVerificationFailure("token", "DENIED", "Email verification rejected because the token was invalid.");
                    return invalidVerificationToken();
                });

        Instant now = Instant.now();
        if (user.getEmailVerificationExpiresAt() == null || user.getEmailVerificationExpiresAt().isBefore(now)) {
            accessAuditService.recordVisitorVerificationFailure(user.getEmail(), "DENIED", "Email verification rejected because the token expired.");
            clearEmailVerificationState(user, false);
            userRepository.save(user);
            throw invalidVerificationToken();
        }

        clearEmailVerificationState(user, true);
        user.setAccountStatus(AccountStatus.ACTIVE);
        user.setEmailVerified(Boolean.TRUE);
        user.setEmailVerifiedAt(now);
        User saved = userRepository.save(user);
        accessAuditService.recordVisitorEmailVerified(saved);
        return new EmailVerificationStatusResponse(saved.getEmail(), true, saved.getEmailVerifiedAt());
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
        refreshOrganizationContext(user);
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
                user.getOrganizationId(),
                user.getOrganizationName(),
                user.getOrganizationCode(),
                user.getOrganizationTimezone(),
                user.getOrganizationRegionCountry(),
                user.getRoles()
        );
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
                user.getEmployeeId(),
                user.getDesignation(),
                user.getEmployeeType(),
                user.getEmployeePhotoUrl(),
                user.getShiftName(),
                user.getShiftStartTime(),
                user.getShiftEndTime(),
                user.getPhone(),
                user.getPhoneCountryCode(),
                user.getEmergencyContact(),
                user.getPreferredLanguage(),
                user.getNotificationEmailEnabled(),
                user.getNotificationInAppEnabled(),
                user.isActive(),
                user.getAccountStatus() != null ? user.getAccountStatus().name() : null,
                user.getOrganizationId(),
                user.getOrganizationName(),
                user.getOrganizationCode(),
                user.getOrganizationTimezone(),
                user.getOrganizationRegionCountry(),
                user.getRoles()
        );
    }

    private void applyOrganization(User user, Organization organization) {
        if (organization == null) {
            return;
        }
        if (!organization.isActiveStatus()) {
            throw new BadRequestException("Selected organization is inactive.");
        }
        user.setOrganizationId(organization.getId());
        user.setOrganizationName(organization.getCompanyName());
        user.setOrganizationCode(organization.getCompanyCode());
        user.setOrganizationTimezone(organization.getTimezone());
        user.setOrganizationRegionCountry(organization.getRegionCountry());
    }

    private void refreshOrganizationContext(User user) {
        String organizationId = trimToNull(user.getOrganizationId());
        if (organizationId == null) {
            return;
        }
        Organization organization = organizationService.requireActive(organizationId);
        applyOrganization(user, organization);
        userRepository.save(user);
    }

    private void validateOrganizationLogin(User user, String companyCode) {
        if (user.getRoles().contains(Role.SUPER_ADMIN) || user.getRoles().contains(Role.VISITOR) || user.getOrganizationId() == null) {
            return;
        }
        String requestedCode = trimToNull(companyCode);
        if (requestedCode == null || user.getOrganizationCode() == null || !user.getOrganizationCode().equalsIgnoreCase(requestedCode)) {
            throw new UnauthorizedException("Company code is required for this organization account.");
        }
    }

    private void validatePortalAudience(User user, String portalAudience) {
        String audience = normalizePortalAudience(portalAudience);
        if (audience == null) {
            return;
        }

        boolean allowed = switch (audience) {
            case "admin" -> user.getRoles().contains(Role.SUPER_ADMIN) || user.getRoles().contains(Role.ADMIN);
            case "employee" -> user.getRoles().contains(Role.EMPLOYEE);
            case "security" -> user.getRoles().contains(Role.SECURITY_GUARD);
            case "visitor" -> user.getRoles().contains(Role.VISITOR);
            default -> false;
        };

        if (!allowed) {
            throw new UnauthorizedException("Use the correct access option for this account.");
        }
    }

    private String normalizePortalAudience(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim().toLowerCase(Locale.ROOT).replace('_', '-');
    }

    private String trimToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private EmailVerificationDispatchResponse issueVisitorVerification(User user, boolean resend) {
        if (!isPendingVisitorVerification(user)) {
            throw new BadRequestException("This visitor account does not require email verification.");
        }

        Instant now = Instant.now();
        Instant resendAvailableAt = user.getEmailVerificationSentAt() == null
                ? now
                : user.getEmailVerificationSentAt().plus(RESEND_COOLDOWN);
        if (resend && resendAvailableAt.isAfter(now)) {
            throw new BadRequestException("Please wait before requesting another verification email.");
        }

        String rawToken = tokenService.generateOpaqueToken();
        Instant expiresAt = now.plus(EMAIL_VERIFICATION_EXPIRY);
        user.setEmailVerificationTokenHash(tokenService.hash(rawToken));
        user.setEmailVerificationExpiresAt(expiresAt);
        user.setEmailVerificationSentAt(now);
        userRepository.save(user);

        try {
            emailService.sendVisitorEmailVerification(
                    user.getEmail(),
                    user.getFullName(),
                    visitorVerificationUrl(rawToken),
                    EMAIL_VERIFICATION_EXPIRY.toHours()
            );
        } catch (RuntimeException ex) {
            log.error("AccessFlow verification delivery failed for visitor {}.", user.getId(), ex);
        }

        accessAuditService.recordVisitorVerificationEmailSent(user, resend);
        return new EmailVerificationDispatchResponse(
                user.getEmail(),
                true,
                expiresAt,
                now,
                now.plus(RESEND_COOLDOWN),
                user.getRoles()
        );
    }

    private String visitorVerificationUrl(String rawToken) {
        String publicOrigin = corsOriginResolver.resolvePublicOrigin();
        if (publicOrigin == null) {
            throw new IllegalStateException("AccessFlow public frontend origin is not configured.");
        }
        return UriComponentsBuilder.fromUriString(publicOrigin)
                .path("/verify-email")
                .queryParam("token", rawToken)
                .build(true)
                .toUriString();
    }

    private void clearEmailVerificationState(User user, boolean keepVerifiedFlag) {
        user.setEmailVerificationTokenHash(null);
        user.setEmailVerificationExpiresAt(null);
        user.setEmailVerificationSentAt(null);
        if (!keepVerifiedFlag) {
            user.setEmailVerified(Boolean.FALSE);
            user.setEmailVerifiedAt(null);
        }
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

    private boolean isPendingVisitorVerification(User user) {
        return user != null
                && user.getRoles() != null
                && user.getRoles().contains(Role.VISITOR)
                && user.getAccountStatus() == AccountStatus.UNVERIFIED;
    }

    private String normalizeIdentifier(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private String normalizeUsername(String value) {
        var errors = UsernamePolicy.validate(value);
        if (!errors.isEmpty()) {
            throw new BadRequestException(errors.values().iterator().next());
        }
        return UsernamePolicy.normalizeForLookup(value);
    }

    private void validateStrongPassword(String password) {
        if (!STRONG_PASSWORD_PATTERN.matcher(password).matches()) {
            throw new BadRequestException("Password must be 12-128 characters and include uppercase, lowercase, number, and symbol.");
        }
    }

    private UnauthorizedException invalidOtp() {
        return new UnauthorizedException("Invalid or expired verification code.");
    }

    private BadRequestException invalidVerificationToken() {
        return new BadRequestException("This verification link is invalid or has expired.");
    }
}
