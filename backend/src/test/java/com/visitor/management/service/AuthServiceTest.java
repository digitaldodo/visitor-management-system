package com.visitor.management.service;

import com.visitor.management.config.CorsOriginResolver;
import com.visitor.management.dto.AuthRequest;
import com.visitor.management.dto.EmailVerificationStatusResponse;
import com.visitor.management.dto.RegisterRequest;
import com.visitor.management.entity.AccountStatus;
import com.visitor.management.entity.Organization;
import com.visitor.management.entity.Role;
import com.visitor.management.entity.User;
import com.visitor.management.exception.UnauthorizedException;
import com.visitor.management.repository.PasswordResetTokenRepository;
import com.visitor.management.repository.RefreshTokenRepository;
import com.visitor.management.repository.UserRepository;
import com.visitor.management.security.JwtService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Instant;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private RefreshTokenRepository refreshTokenRepository;

    @Mock
    private PasswordResetTokenRepository passwordResetTokenRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private JwtService jwtService;

    @Mock
    private TokenService tokenService;

    @Mock
    private EmailService emailService;

    @Mock
    private RateLimitService rateLimitService;

    @Mock
    private OrganizationService organizationService;

    @Mock
    private AccessAuditService accessAuditService;

    @Mock
    private PhoneNumberService phoneNumberService;

    @Mock
    private CorsOriginResolver corsOriginResolver;

    @InjectMocks
    private AuthService authService;

    @Test
    void registerCreatesUnverifiedVisitorAndSendsVerification() {
        RegisterRequest request = new RegisterRequest();
        request.setFullName("Visitor User");
        request.setUsername("visitor01");
        request.setEmail("visitor@example.com");
        request.setPassword("SecurePass123!");
        request.setCompanyCode("ACME");

        when(userRepository.existsByEmailIgnoreCase("visitor@example.com")).thenReturn(false);
        when(userRepository.existsByUsernameIgnoreCase("visitor01")).thenReturn(false);
        when(organizationService.resolveRequired("ACME", null)).thenReturn(activeOrganization());
        when(passwordEncoder.encode("SecurePass123!")).thenReturn("encoded-password");
        when(phoneNumberService.normalize(null, null, false)).thenReturn(null);
        when(tokenService.generateOpaqueToken()).thenReturn("verification-token");
        when(tokenService.hash("verification-token")).thenReturn("verification-token-hash");
        when(corsOriginResolver.resolvePublicOrigin()).thenReturn("https://accessflow-web.onrender.com");
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> {
            User user = invocation.getArgument(0);
            if (user.getId() == null) {
                user.setId("visitor-1");
            }
            return user;
        });

        var response = authService.register(request, null, "client-fingerprint");

        assertThat(response.email()).isEqualTo("visitor@example.com");
        assertThat(response.verificationRequired()).isTrue();
        assertThat(response.roles()).containsExactly(Role.VISITOR);

        ArgumentCaptor<User> savedUsers = ArgumentCaptor.forClass(User.class);
        verify(userRepository, atLeastOnce()).save(savedUsers.capture());
        User finalSavedUser = savedUsers.getAllValues().getLast();
        assertThat(finalSavedUser.getAccountStatus()).isEqualTo(AccountStatus.UNVERIFIED);
        assertThat(finalSavedUser.getEmailVerified()).isFalse();
        assertThat(finalSavedUser.getEmailVerificationTokenHash()).isEqualTo("verification-token-hash");
        verify(emailService).sendVisitorEmailVerification(
                eq("visitor@example.com"),
                eq("Visitor User"),
                eq("https://accessflow-web.onrender.com/verify-email?token=verification-token"),
                eq(24L)
        );
    }

    @Test
    void loginBlocksUnverifiedVisitorUntilEmailIsVerified() {
        User user = new User();
        user.setId("visitor-1");
        user.setActive(true);
        user.setRoles(Set.of(Role.VISITOR));
        user.setAccountStatus(AccountStatus.UNVERIFIED);
        user.setPasswordHash("encoded-password");
        user.setEmail("visitor@example.com");

        when(userRepository.findByEmailIgnoreCase("visitor@example.com")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("SecurePass123!", "encoded-password")).thenReturn(true);

        assertThatThrownBy(() -> authService.login(
                new AuthRequest("visitor@example.com", null, null, "visitor", "SecurePass123!"),
                "client-fingerprint"
        ))
                .isInstanceOf(UnauthorizedException.class)
                .hasMessage("Please verify your email before signing in.");
    }

    @Test
    void verifyVisitorEmailActivatesAccountAndClearsVerificationToken() {
        User user = new User();
        user.setId("visitor-1");
        user.setActive(true);
        user.setRoles(Set.of(Role.VISITOR));
        user.setEmail("visitor@example.com");
        user.setAccountStatus(AccountStatus.UNVERIFIED);
        user.setEmailVerificationTokenHash("verification-token-hash");
        user.setEmailVerificationExpiresAt(Instant.now().plusSeconds(300));
        user.setEmailVerified(Boolean.FALSE);

        when(tokenService.hash("verification-token")).thenReturn("verification-token-hash");
        when(userRepository.findByEmailVerificationTokenHash("verification-token-hash")).thenReturn(Optional.of(user));
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));

        EmailVerificationStatusResponse response = authService.verifyVisitorEmail("verification-token", "client-fingerprint");

        assertThat(response.emailVerified()).isTrue();
        assertThat(response.email()).isEqualTo("visitor@example.com");
        assertThat(user.getAccountStatus()).isEqualTo(AccountStatus.ACTIVE);
        assertThat(user.getEmailVerified()).isTrue();
        assertThat(user.getEmailVerificationTokenHash()).isNull();
        assertThat(user.getEmailVerificationExpiresAt()).isNull();
        assertThat(user.getEmailVerificationSentAt()).isNull();
        assertThat(user.getEmailVerifiedAt()).isNotNull();
    }

    private Organization activeOrganization() {
        Organization organization = new Organization();
        organization.setId("org-1");
        organization.setCompanyName("Acme");
        organization.setCompanyCode("ACME");
        organization.setTimezone("Asia/Kolkata");
        organization.setRegionCountry("India");
        organization.setActiveStatus(true);
        return organization;
    }
}
