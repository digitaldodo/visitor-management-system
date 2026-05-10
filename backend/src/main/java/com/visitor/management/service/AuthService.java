package com.visitor.management.service;

import com.visitor.management.dto.AuthRequest;
import com.visitor.management.dto.AuthResponse;
import com.visitor.management.dto.ForgotPasswordRequest;
import com.visitor.management.dto.ForgotPasswordResponse;
import com.visitor.management.dto.RefreshTokenRequest;
import com.visitor.management.dto.RegisterRequest;
import com.visitor.management.dto.ResetPasswordRequest;
import com.visitor.management.dto.UserProfileResponse;
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
import java.util.List;
import java.util.Set;

@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final TokenService tokenService;

    public AuthService(
            UserRepository userRepository,
            RefreshTokenRepository refreshTokenRepository,
            PasswordResetTokenRepository passwordResetTokenRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            TokenService tokenService
    ) {
        this.userRepository = userRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.passwordResetTokenRepository = passwordResetTokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.tokenService = tokenService;
    }

    public UserProfileResponse register(RegisterRequest request, Authentication authentication) {
        Role requestedRole = request.role();
        boolean firstUser = userRepository.count() == 0;

        if (firstUser && requestedRole != Role.ADMIN) {
            throw new BadRequestException("The first account must be an ADMIN account.");
        }

        if (!firstUser && requestedRole != Role.EMPLOYEE) {
            requireAdmin(authentication);
        }

        if (userRepository.existsByEmailIgnoreCase(request.email())) {
            throw new ConflictException("An account with this email already exists.");
        }

        User user = new User();
        user.setFullName(request.fullName().trim());
        user.setEmail(request.email().trim().toLowerCase());
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setDepartment(trimToNull(request.department()));
        user.setPhone(trimToNull(request.phone()));
        user.setRoles(Set.of(requestedRole));
        user.setActive(true);

        return toProfile(userRepository.save(user));
    }

    public AuthResponse login(AuthRequest request) {
        User user = userRepository.findByEmailIgnoreCase(request.email())
                .filter(User::isActive)
                .filter(candidate -> passwordEncoder.matches(request.password(), candidate.getPasswordHash()))
                .orElseThrow(() -> new UnauthorizedException("Invalid email or password."));

        return issueTokens(user);
    }

    public AuthResponse refresh(RefreshTokenRequest request) {
        RefreshToken refreshToken = refreshTokenRepository.findByTokenHash(tokenService.hash(request.refreshToken()))
                .orElseThrow(() -> new UnauthorizedException("Refresh token is invalid."));

        if (refreshToken.isRevoked() || refreshToken.isExpired()) {
            throw new UnauthorizedException("Refresh token has expired or was revoked.");
        }

        User user = userRepository.findById(refreshToken.getUserId())
                .filter(User::isActive)
                .orElseThrow(() -> new UnauthorizedException("Refresh token user is no longer active."));

        revoke(refreshToken);
        return issueTokens(user);
    }

    public void logout(String refreshToken) {
        refreshTokenRepository.findByTokenHash(tokenService.hash(refreshToken))
                .ifPresent(this::revoke);
    }

    public ForgotPasswordResponse forgotPassword(ForgotPasswordRequest request) {
        Instant expiresAt = Instant.now().plusSeconds(15 * 60);

        userRepository.findByEmailIgnoreCase(request.email())
                .filter(User::isActive)
                .ifPresent(user -> {
                    String resetToken = tokenService.generateOpaqueToken();
                    PasswordResetToken passwordResetToken = new PasswordResetToken();
                    passwordResetToken.setUserId(user.getId());
                    passwordResetToken.setTokenHash(tokenService.hash(resetToken));
                    passwordResetToken.setExpiresAt(expiresAt);
                    passwordResetTokenRepository.save(passwordResetToken);
                    log.info("Password reset token created for {}. Wire email delivery before exposing reset links.", user.getEmail());
                });

        return new ForgotPasswordResponse(true, expiresAt);
    }

    public void resetPassword(ResetPasswordRequest request) {
        PasswordResetToken resetToken = passwordResetTokenRepository.findByTokenHash(tokenService.hash(request.token()))
                .orElseThrow(() -> new UnauthorizedException("Password reset token is invalid."));

        if (resetToken.getUsedAt() != null || resetToken.getExpiresAt().isBefore(Instant.now())) {
            throw new UnauthorizedException("Password reset token has expired or was already used.");
        }

        User user = userRepository.findById(resetToken.getUserId())
                .filter(User::isActive)
                .orElseThrow(() -> new UnauthorizedException("Password reset user is no longer active."));

        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        userRepository.save(user);

        resetToken.setUsedAt(Instant.now());
        passwordResetTokenRepository.save(resetToken);
        revokeAllRefreshTokens(user.getId());
    }

    public UserProfileResponse currentUser(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new UnauthorizedException("Authentication is required.");
        }

        User user = userRepository.findById(authentication.getName())
                .filter(User::isActive)
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
                user.getEmail(),
                user.getFullName(),
                user.getRoles()
        );
    }

    private void requireAdmin(Authentication authentication) {
        if (authentication == null || authentication.getAuthorities().stream().noneMatch(authority -> "ROLE_ADMIN".equals(authority.getAuthority()))) {
            throw new UnauthorizedException("An ADMIN account is required for this registration.");
        }
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
}
