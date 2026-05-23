package com.visitor.management.service;

import com.visitor.management.dto.AdminPasswordResetRequest;
import com.visitor.management.dto.AdminUserDetailResponse;
import com.visitor.management.dto.AdminUserUpdateRequest;
import com.visitor.management.dto.SuperAdminCreateRequest;
import com.visitor.management.dto.SuperAdminOtpRequest;
import com.visitor.management.dto.SuperAdminOtpResponse;
import com.visitor.management.dto.AdminUserCreateRequest;
import com.visitor.management.dto.AdminUserResponse;
import com.visitor.management.dto.AdminUserRoleUpdateRequest;
import com.visitor.management.dto.WorkforceInviteRequest;
import com.visitor.management.config.CorsOriginResolver;
import com.visitor.management.entity.AccountStatus;
import com.visitor.management.entity.NotificationType;
import com.visitor.management.entity.Organization;
import com.visitor.management.entity.PasswordResetToken;
import com.visitor.management.entity.Role;
import com.visitor.management.entity.SuperAdminCreationOtp;
import com.visitor.management.entity.User;
import com.visitor.management.exception.BadRequestException;
import com.visitor.management.exception.ConflictException;
import com.visitor.management.exception.ResourceNotFoundException;
import com.visitor.management.exception.UnauthorizedException;
import com.visitor.management.repository.AccessAuditLogRepository;
import com.visitor.management.repository.PasswordResetTokenRepository;
import com.visitor.management.repository.RefreshTokenRepository;
import com.visitor.management.repository.SuperAdminCreationOtpRepository;
import com.visitor.management.repository.UserRepository;
import com.visitor.management.validation.UsernamePolicy;
import org.springframework.data.domain.Sort;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.util.UriComponentsBuilder;

import java.time.Instant;
import java.time.Duration;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.security.SecureRandom;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

@Service
public class AdminUserService {

    private static final Pattern STRONG_PASSWORD_PATTERN = Pattern.compile("^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{12,128}$");
    private static final String SECURITY_DEPARTMENT = "Security";
    private static final String ADMINISTRATION_DEPARTMENT = "Administration";
    private static final String RECEPTION_DEPARTMENT = "Reception";
    private static final String OPERATIONS_DEPARTMENT = "Operations";
    private static final String MANAGEMENT_DEPARTMENT = "Management";
    private static final Duration SUPER_ADMIN_OTP_EXPIRY = Duration.ofMinutes(5);
    private static final Duration SUPER_ADMIN_OTP_RESEND_COOLDOWN = Duration.ofSeconds(60);
    private static final int SUPER_ADMIN_OTP_MAX_ATTEMPTS = 5;
    private static final Duration WORKFORCE_INVITE_EXPIRY = Duration.ofDays(7);
    private static final EnumSet<Role> ORG_WORKFORCE_ROLES = EnumSet.of(
            Role.EMPLOYEE,
            Role.SECURITY_GUARD,
            Role.RECEPTION,
            Role.OPERATOR,
            Role.MANAGER
    );

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final SuperAdminCreationOtpRepository superAdminCreationOtpRepository;
    private final AccessAuditLogRepository accessAuditLogRepository;
    private final PasswordEncoder passwordEncoder;
    private final OrganizationService organizationService;
    private final DepartmentService departmentService;
    private final AccessAuditService accessAuditService;
    private final TokenService tokenService;
    private final EmailService emailService;
    private final RateLimitService rateLimitService;
    private final PhoneNumberService phoneNumberService;
    private final EmployeeAttendanceService employeeAttendanceService;
    private final NotificationService notificationService;
    private final CorsOriginResolver corsOriginResolver;
    private final SecureRandom secureRandom = new SecureRandom();

    public AdminUserService(
            UserRepository userRepository,
            RefreshTokenRepository refreshTokenRepository,
            PasswordResetTokenRepository passwordResetTokenRepository,
            SuperAdminCreationOtpRepository superAdminCreationOtpRepository,
            AccessAuditLogRepository accessAuditLogRepository,
            PasswordEncoder passwordEncoder,
            OrganizationService organizationService,
            DepartmentService departmentService,
            AccessAuditService accessAuditService,
            TokenService tokenService,
            EmailService emailService,
            RateLimitService rateLimitService,
            PhoneNumberService phoneNumberService,
            EmployeeAttendanceService employeeAttendanceService,
            NotificationService notificationService,
            CorsOriginResolver corsOriginResolver
    ) {
        this.userRepository = userRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.passwordResetTokenRepository = passwordResetTokenRepository;
        this.superAdminCreationOtpRepository = superAdminCreationOtpRepository;
        this.accessAuditLogRepository = accessAuditLogRepository;
        this.passwordEncoder = passwordEncoder;
        this.organizationService = organizationService;
        this.departmentService = departmentService;
        this.accessAuditService = accessAuditService;
        this.tokenService = tokenService;
        this.emailService = emailService;
        this.rateLimitService = rateLimitService;
        this.phoneNumberService = phoneNumberService;
        this.employeeAttendanceService = employeeAttendanceService;
        this.notificationService = notificationService;
        this.corsOriginResolver = corsOriginResolver;
    }

    public List<AdminUserResponse> listUsers(Authentication authentication) {
        return listUsers(authentication, null, null, null, null, "alphabetical");
    }

    public List<AdminUserResponse> listUsers(
            Authentication authentication,
            String query,
            String status,
            String department,
            Role role,
            String sort
    ) {
        User actor = currentUser(authentication);
        List<User> users = hasRole(authentication, Role.SUPER_ADMIN)
                ? userRepository.findAll(Sort.by(Sort.Direction.ASC, "fullName"))
                : userRepository.findAllByOrganizationId(requiredOrganizationId(actor));
        return users.stream()
                .filter(user -> !actor.getId().equals(user.getId()))
                .filter(this::isInternalWorkforceOrAdmin)
                .filter(user -> role == null || user.getRoles().contains(role))
                .filter(user -> matchesStatus(user, status))
                .filter(user -> matchesDepartment(user, department))
                .filter(user -> matchesQuery(user, query))
                .sorted(userComparator(sort))
                .map(this::toResponse)
                .toList();
    }

    public AdminUserDetailResponse getUser(String id, Authentication authentication) {
        User user = findUser(id);
        validateReadableAccount(user, authentication);
        return new AdminUserDetailResponse(toResponse(user), recentActivity(user));
    }

    public AdminUserResponse createUser(AdminUserCreateRequest request, Authentication authentication) {
        Role role = request.role();
        User actor = currentUser(authentication);
        validateCreatableRole(role, authentication, actor);
        Organization organization = resolveOrganizationForCreate(request, role, actor, authentication);

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
        PhoneNumberService.NormalizedPhone phone = phoneNumberService.normalize(request.phoneCountryCode(), request.phone(), false);
        if (phone != null) {
            user.setPhone(phone.e164());
            user.setPhoneCountryCode(phone.countryCode());
        }
        applyOrganization(user, organization);
        DepartmentService.DepartmentAssignment departmentAssignment = resolveDepartmentAssignment(role, organization, request.department());
        user.setDepartmentId(departmentAssignment != null ? departmentAssignment.departmentId() : null);
        user.setDepartment(departmentAssignment != null ? departmentAssignment.departmentName() : null);
        user.setRoles(Set.of(role));
        if (isWorkforceRole(role)) {
            applyEmployeeWorkforceFields(user, request);
            employeeAttendanceService.provisionEmployeeCredential(user);
        }
        user.setActive(true);
        user.setAccountStatus(AccountStatus.ACTIVE);
        User saved = userRepository.save(user);
        accessAuditService.recordAccountCreated(actor, saved);
        return toResponse(saved);
    }

    public AdminUserResponse inviteUser(WorkforceInviteRequest request, Authentication authentication) {
        User actor = currentUser(authentication);
        Role role = request.role();
        validateCreatableRole(role, authentication, actor);
        Organization organization = resolveOrganizationForInvite(request, role, actor, authentication);

        if (userRepository.existsByEmailIgnoreCase(request.email())) {
            throw new ConflictException("An account with this email already exists.");
        }

        String username = normalizeUsername(request.username());
        if (userRepository.existsByUsernameIgnoreCase(username)) {
            throw new ConflictException("An account with this username already exists.");
        }

        User user = new User();
        user.setFullName(request.fullName().trim());
        user.setUsername(username);
        user.setEmail(request.email().trim().toLowerCase(Locale.ROOT));
        user.setPasswordHash(passwordEncoder.encode(tokenService.generateOpaqueToken()));
        PhoneNumberService.NormalizedPhone phone = phoneNumberService.normalize(request.phoneCountryCode(), request.phone(), false);
        if (phone != null) {
            user.setPhone(phone.e164());
            user.setPhoneCountryCode(phone.countryCode());
        }
        applyOrganization(user, organization);
        DepartmentService.DepartmentAssignment departmentAssignment = resolveDepartmentAssignment(role, organization, request.department());
        user.setDepartmentId(departmentAssignment != null ? departmentAssignment.departmentId() : null);
        user.setDepartment(departmentAssignment != null ? departmentAssignment.departmentName() : null);
        user.setRoles(Set.of(role));
        applyWorkforceFields(user, role, request.designation(), request.employeeType(), request.employeePhotoUrl(),
                request.shiftName(), request.shiftStartTime(), request.shiftEndTime());
        user.setActive(false);
        user.setAccountStatus(AccountStatus.UNVERIFIED);
        user.setEmailVerified(Boolean.FALSE);
        user.setWorkforceOnboardingCreatedById(actor.getId());
        user.setWorkforceOnboardingCreatedByName(actor.getFullName());
        user.setWorkforceOnboardingCreatedAt(Instant.now());

        User saved = userRepository.save(user);
        issueWorkforceInvite(saved, actor, trimToNull(request.note()), false);
        accessAuditService.recordAccountCreated(actor, saved);
        accessAuditService.recordWorkforceOnboarding(actor, saved, "WORKFORCE_INVITED", "SUCCESS",
                "Workforce invite issued for %s.".formatted(renderSingleRole(role)));
        return toResponse(saved);
    }

    public AdminUserResponse resendInvite(String id, Authentication authentication) {
        User actor = currentUser(authentication);
        User user = findUser(id);
        validateMutableAccount(user, authentication);
        if (!isPendingInvite(user)) {
            throw new BadRequestException("Only pending workforce invites can be resent.");
        }
        issueWorkforceInvite(user, actor, null, true);
        accessAuditService.recordWorkforceOnboarding(actor, user, "WORKFORCE_INVITE_RESENT", "SUCCESS",
                "Pending workforce invite was resent.");
        return toResponse(user);
    }

    public AdminUserResponse revokeInvite(String id, Authentication authentication) {
        User actor = currentUser(authentication);
        User user = findUser(id);
        validateMutableAccount(user, authentication);
        if (!isPendingInvite(user)) {
            throw new BadRequestException("Only pending workforce invites can be revoked.");
        }
        user.setActive(false);
        user.setAccountStatus(AccountStatus.DISABLED);
        revokeAllRefreshTokens(user.getId());
        expirePasswordResetTokens(user.getId());
        User saved = userRepository.save(user);
        accessAuditService.recordAccountStateChanged(actor, saved, "WORKFORCE_INVITE_REVOKED", "Pending workforce invite was revoked.");
        return toResponse(saved);
    }

    public AdminUserResponse updateUser(String id, AdminUserUpdateRequest request, Authentication authentication) {
        User actor = currentUser(authentication);
        User user = findUser(id);
        validateMutableAccount(user, authentication);

        if (trimToNull(request.fullName()) != null) {
            user.setFullName(request.fullName().trim());
        }
        String email = trimToNull(request.email());
        if (email != null && !email.equalsIgnoreCase(user.getEmail())) {
            if (userRepository.existsByEmailIgnoreCase(email)) {
                throw new ConflictException("An account with this email already exists.");
            }
            user.setEmail(email.toLowerCase(Locale.ROOT));
        }
        if (request.phone() != null || request.phoneCountryCode() != null) {
            PhoneNumberService.NormalizedPhone phone = phoneNumberService.normalize(
                    request.phoneCountryCode() != null ? request.phoneCountryCode() : user.getPhoneCountryCode(),
                    request.phone(),
                    false
            );
            user.setPhone(phone != null ? phone.e164() : null);
            user.setPhoneCountryCode(phone != null ? phone.countryCode() : phoneNumberService.normalizeDialCode(request.phoneCountryCode()));
        }
        Role effectiveRole = (user.getRoles() == null || user.getRoles().isEmpty()) ? Role.EMPLOYEE : user.getRoles().iterator().next();
        if (request.role() != null && !user.getRoles().contains(request.role())) {
            validateReassignableRole(request.role(), authentication, actor);
            if (user.getRoles().contains(Role.ADMIN) && request.role() != Role.ADMIN) {
                ensureNotFinalActiveOrganizationAdmin(user, "The final active organization admin cannot be reassigned.");
            }
            Set<Role> previousRoles = Set.copyOf(user.getRoles());
            effectiveRole = request.role();
            user.setRoles(Set.of(effectiveRole));
            revokeAllRefreshTokens(user.getId());
            notificationService.deactivateUserDevices(user.getId(), "Role changes invalidated the current mobile session.");
            accessAuditService.recordRoleChanged(actor, user, previousRoles, user.getRoles());
        }
        Organization organization = effectiveRole == Role.SUPER_ADMIN ? null : resolveOrganizationForExistingUser(user);
        if (request.department() != null || request.role() != null) {
            DepartmentService.DepartmentAssignment departmentAssignment = resolveDepartmentAssignment(effectiveRole, organization, request.department() != null ? request.department() : user.getDepartment());
            user.setDepartmentId(departmentAssignment != null ? departmentAssignment.departmentId() : null);
            user.setDepartment(departmentAssignment != null ? departmentAssignment.departmentName() : null);
        }
        applyWorkforceFields(user, effectiveRole, request.designation(), request.employeeType(), request.employeePhotoUrl(),
                request.shiftName(), request.shiftStartTime(), request.shiftEndTime());
        if (request.accountStatus() != null) {
            applyAccountStatus(user, request.accountStatus());
        }
        if (request.active() != null) {
            user.setActive(request.active());
        }
        if (user.getRoles().contains(Role.ADMIN) && !isActiveAdmin(user)) {
            ensureNotFinalActiveOrganizationAdmin(user, "The final active organization admin cannot be deactivated.");
        }

        User saved = userRepository.save(user);
        if (isWorkforceRole(effectiveRole)) {
            if (saved.isActive() && saved.getAccountStatus() == AccountStatus.ACTIVE) {
                employeeAttendanceService.activateEmployeeCredential(saved);
            } else {
                employeeAttendanceService.deactivateEmployeeCredential(saved);
            }
        }
        accessAuditService.recordAccountStateChanged(actor, saved, "WORKFORCE_PROFILE_UPDATED", "Workforce profile and access metadata were updated.");
        return toResponse(saved);
    }

    public SuperAdminOtpResponse initiateSuperAdminCreation(SuperAdminOtpRequest request, Authentication authentication) {
        User actor = currentUser(authentication);
        requireSuperAdmin(authentication, actor);
        rateLimitService.check("super-admin-creation-otp", actor.getId(), 3, Duration.ofMinutes(15));

        if (!passwordEncoder.matches(request.password(), actor.getPasswordHash())) {
            accessAuditService.recordSuperAdminOtpGeneration(actor, "DENIED", "Password confirmation failed before OTP generation.");
            throw new UnauthorizedException("Password confirmation failed.");
        }

        Instant now = Instant.now();
        Optional<SuperAdminCreationOtp> latest = superAdminCreationOtpRepository.findTopByActorUserIdAndUsedAtIsNullOrderByCreatedAtDesc(actor.getId());
        if (latest.isPresent()) {
            SuperAdminCreationOtp token = latest.get();
            if (token.getResendAvailableAt() != null
                    && token.getResendAvailableAt().isAfter(now)
                    && token.getExpiresAt() != null
                    && token.getExpiresAt().isAfter(now)
                    && token.getLockedAt() == null
                    && token.getVerifiedAt() == null) {
                accessAuditService.recordSuperAdminOtpGeneration(actor, "DENIED", "OTP generation was requested before the resend cooldown elapsed.");
                throw new BadRequestException("A SUPER_ADMIN verification code was already sent. Please wait before requesting another.");
            }
            token.setUsedAt(now);
            superAdminCreationOtpRepository.save(token);
        }

        String otp = "%06d".formatted(secureRandom.nextInt(1_000_000));
        Instant expiresAt = now.plus(SUPER_ADMIN_OTP_EXPIRY);
        SuperAdminCreationOtp token = new SuperAdminCreationOtp();
        token.setActorUserId(actor.getId());
        token.setOtpHash(tokenService.hash(actor.getId() + ":" + otp));
        token.setExpiresAt(expiresAt);
        token.setResendAvailableAt(now.plus(SUPER_ADMIN_OTP_RESEND_COOLDOWN));
        token.setMaxAttempts(SUPER_ADMIN_OTP_MAX_ATTEMPTS);
        token.setCreatedAt(now);
        superAdminCreationOtpRepository.save(token);

        emailService.sendSuperAdminCreationOtp(actor.getEmail(), actor.getFullName(), otp);
        accessAuditService.recordSuperAdminOtpGeneration(actor, "SUCCESS", "SUPER_ADMIN creation OTP generated and sent to the authenticated platform owner.");
        return new SuperAdminOtpResponse(expiresAt, SUPER_ADMIN_OTP_MAX_ATTEMPTS);
    }

    public AdminUserResponse createSuperAdmin(SuperAdminCreateRequest request, Authentication authentication) {
        User actor = currentUser(authentication);
        requireSuperAdmin(authentication, actor);
        rateLimitService.check("super-admin-creation-verify", actor.getId(), 10, Duration.ofMinutes(10));
        accessAuditService.recordSuperAdminCreationAttempt(actor, request.email(), "PENDING", "SUPER_ADMIN creation requested through OTP-confirmed flow.");

        if (!passwordEncoder.matches(request.currentPassword(), actor.getPasswordHash())) {
            accessAuditService.recordSuperAdminOtpVerification(actor, "DENIED", "Password confirmation failed during SUPER_ADMIN creation.");
            throw new UnauthorizedException("Password confirmation failed.");
        }

        verifySuperAdminCreationOtp(actor, request.otp());

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
        PhoneNumberService.NormalizedPhone phone = phoneNumberService.normalize(request.phoneCountryCode(), request.phone(), false);
        if (phone != null) {
            user.setPhone(phone.e164());
            user.setPhoneCountryCode(phone.countryCode());
        }
        user.setRoles(Set.of(Role.SUPER_ADMIN));
        user.setActive(true);
        user.setAccountStatus(AccountStatus.ACTIVE);

        User saved = userRepository.save(user);
        accessAuditService.recordSuperAdminCreated(actor, saved);
        return toResponse(saved);
    }

    public AdminUserResponse disableUser(String id, Authentication authentication) {
        User actor = currentUser(authentication);
        User user = findUser(id);
        validateMutableAccount(user, authentication);
        ensureNotFinalActiveOrganizationAdmin(user, "The final active organization admin cannot be disabled.");
        user.setActive(false);
        user.setAccountStatus(AccountStatus.DISABLED);
        if (isAnyWorkforceUser(user)) {
            employeeAttendanceService.deactivateEmployeeCredential(user);
        }
        User saved = userRepository.save(user);
        revokeAllRefreshTokens(saved.getId());
        notificationService.deactivateUserDevices(saved.getId(), "Account access was disabled.");
        accessAuditService.recordAccountStateChanged(actor, saved, "ACCOUNT_DISABLED", "Internal account access was disabled.");
        if (isAnyWorkforceUser(saved)) {
            accessAuditService.recordWorkforceOnboarding(actor, saved, "WORKFORCE_QR_DEACTIVATED", "SUCCESS", "Static workforce QR was deactivated with account access.");
            notificationService.notifyUser(
                    saved.getId(),
                    NotificationType.WORKFORCE_ACCESS_REVOKED,
                    "Workforce access revoked",
                    "Your workforce access was revoked by an administrator. Contact your administrator if this is unexpected.",
                    null,
                    "/pages/employee/#notifications",
                    actor.getFullName()
            );
        }
        return toResponse(saved);
    }

    public AdminUserResponse archiveUser(String id, Authentication authentication) {
        User actor = currentUser(authentication);
        User user = findUser(id);
        validateMutableAccount(user, authentication);
        boolean organizationAdmin = user.getRoles() != null && user.getRoles().contains(Role.ADMIN);
        ensureNotFinalActiveOrganizationAdmin(user, "The final active organization admin cannot be removed.");
        user.setActive(false);
        user.setAccountStatus(AccountStatus.DISABLED);
        if (isAnyWorkforceUser(user)) {
            employeeAttendanceService.deactivateEmployeeCredential(user);
        }
        User saved = userRepository.save(user);
        revokeAllRefreshTokens(saved.getId());
        expirePasswordResetTokens(saved.getId());
        notificationService.deactivateUserDevices(saved.getId(), organizationAdmin ? "Organization admin access was removed." : "Workforce account was archived.");
        accessAuditService.recordAccountStateChanged(
                actor,
                saved,
                organizationAdmin ? "ORGANIZATION_ADMIN_REMOVED" : "WORKFORCE_ACCESS_ARCHIVED",
                organizationAdmin
                        ? "Organization admin access was removed from the tenant workspace."
                        : "Workforce account was archived and operational access was revoked."
        );
        return toResponse(saved);
    }

    public AdminUserResponse enableUser(String id, Authentication authentication) {
        User actor = currentUser(authentication);
        User user = findUser(id);
        validateMutableAccount(user, authentication);
        if (user.getAccountStatus() == AccountStatus.PENDING_APPROVAL || user.getAccountStatus() == AccountStatus.REJECTED) {
            throw new BadRequestException("Workforce onboarding requests must be approved before access can be enabled.");
        }
        user.setActive(true);
        user.setAccountStatus(AccountStatus.ACTIVE);
        if (isAnyWorkforceUser(user)) {
            employeeAttendanceService.activateEmployeeCredential(user);
        }
        User saved = userRepository.save(user);
        accessAuditService.recordAccountStateChanged(actor, saved, "ACCOUNT_ENABLED", "Internal account access was enabled.");
        if (isAnyWorkforceUser(saved)) {
            accessAuditService.recordWorkforceOnboarding(actor, saved, "WORKFORCE_QR_ACTIVATED", "SUCCESS", "Static workforce QR was activated with account access.");
        }
        return toResponse(saved);
    }

    public AdminUserResponse revokeSessions(String id, Authentication authentication) {
        User actor = currentUser(authentication);
        User user = findUser(id);
        validateMutableAccount(user, authentication);
        revokeAllRefreshTokens(user.getId());
        notificationService.deactivateUserDevices(user.getId(), "Administrator revoked active sessions.");
        accessAuditService.recordAccountStateChanged(actor, user, "SESSIONS_REVOKED", "All active refresh tokens and mobile devices were revoked.");
        return toResponse(user);
    }

    public AdminUserResponse resetPassword(String id, AdminPasswordResetRequest request, Authentication authentication) {
        User actor = currentUser(authentication);
        User user = findUser(id);
        validateMutableAccount(user, authentication);
        validateStrongPassword(request.newPassword());
        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        user.setPasswordChangedAt(Instant.now());
        User saved = userRepository.save(user);
        revokeAllRefreshTokens(saved.getId());
        notificationService.deactivateUserDevices(saved.getId(), "Password reset invalidated the current mobile session.");
        accessAuditService.recordAccountStateChanged(actor, saved, "PASSWORD_RESET", "Internal password reset completed.");
        return toResponse(saved);
    }

    public Map<String, Object> workforceAnalytics(Authentication authentication) {
        User actor = currentUser(authentication);
        String organizationId = hasRole(authentication, Role.SUPER_ADMIN) ? null : requiredOrganizationId(actor);
        List<User> users = organizationId == null
                ? userRepository.findAll()
                : userRepository.findAllByOrganizationId(organizationId);
        List<User> workforce = users.stream()
                .filter(this::isAnyWorkforceUser)
                .toList();
        long active = workforce.stream().filter(user -> user.isActive() && user.getAccountStatus() == AccountStatus.ACTIVE).count();
        long inactive = workforce.stream().filter(user -> !user.isActive() || user.getAccountStatus() == AccountStatus.DISABLED).count();
        long pending = workforce.stream().filter(this::isPendingInvite).count();
        long pendingApproval = workforce.stream().filter(user -> user.getAccountStatus() == AccountStatus.PENDING_APPROVAL).count();
        long changesRequested = workforce.stream().filter(user -> user.getAccountStatus() == AccountStatus.CHANGES_REQUESTED).count();
        long security = workforce.stream().filter(user -> user.getRoles().contains(Role.SECURITY_GUARD) && user.isActive()).count();
        long managers = workforce.stream().filter(user -> user.getRoles().contains(Role.MANAGER) && user.isActive()).count();
        long approvalWorkload = pendingApproval + changesRequested;
        Map<String, Long> byDepartment = new LinkedHashMap<>();
        workforce.forEach(user -> byDepartment.merge(trimToNull(user.getDepartment()) == null ? "Unassigned" : user.getDepartment(), 1L, Long::sum));
        List<Map<String, Object>> widgets = List.of(
                Map.of("label", "Active workforce", "value", active, "note", "Approved employee, security, reception, operator, and manager accounts"),
                Map.of("label", "Inactive workforce", "value", inactive, "note", "Disabled or suspended workforce accounts"),
                Map.of("label", "Pending invites", "value", pending, "note", "Invites awaiting activation"),
                Map.of("label", "Pending approvals", "value", pendingApproval, "note", "Security-submitted requests awaiting organization admin decision"),
                Map.of("label", "Changes requested", "value", changesRequested, "note", "Requests returned to security for correction")
        );
        List<Map<String, Object>> alerts = List.of(
                Map.of("label", "Approval workload", "value", approvalWorkload, "note", approvalWorkload > 0 ? "Admin decision required" : "No workforce approval backlog"),
                Map.of("label", "Security coverage", "value", security, "note", security > 0 ? "Security portal coverage available" : "No active security workforce accounts")
        );
        return Map.ofEntries(
                Map.entry("total", workforce.size()),
                Map.entry("active", active),
                Map.entry("inactive", inactive),
                Map.entry("pendingInvites", pending),
                Map.entry("pendingApprovals", pendingApproval),
                Map.entry("changesRequested", changesRequested),
                Map.entry("securityStaffAvailable", security),
                Map.entry("managersActive", managers),
                Map.entry("attendanceAnomalies", 0),
                Map.entry("departmentBreakdown", byDepartment),
                Map.entry("metrics", Map.of(
                        "total", workforce.size(),
                        "active", active,
                        "inactive", inactive,
                        "pendingInvites", pending,
                        "pendingApprovals", pendingApproval,
                        "changesRequested", changesRequested,
                        "securityStaffAvailable", security,
                        "managersActive", managers,
                        "attendanceAnomalies", 0
                )),
                Map.entry("widgets", widgets),
                Map.entry("operationalMetrics", List.of(
                        Map.of("label", "Lifecycle backlog", "value", approvalWorkload, "note", "Pending approval plus changes requested"),
                        Map.of("label", "Security available", "value", security, "note", "Active security portal accounts"),
                        Map.of("label", "Managers active", "value", managers, "note", "Active manager accounts")
                )),
                Map.entry("alerts", alerts)
        );
    }

    public AdminUserResponse updateRole(String id, AdminUserRoleUpdateRequest request, Authentication authentication) {
        User actor = currentUser(authentication);
        User user = findUser(id);
        validateMutableAccount(user, authentication);
        Role role = request.role();
        validateReassignableRole(role, authentication, actor);
        if (user.getRoles().contains(role) && user.getRoles().size() == 1) {
            return toResponse(user);
        }
        if (user.getRoles().contains(Role.ADMIN) && role != Role.ADMIN) {
            ensureNotFinalActiveOrganizationAdmin(user, "The final active organization admin cannot be reassigned.");
        }
        Set<Role> previousRoles = Set.copyOf(user.getRoles());
        user.setRoles(Set.of(role));
        DepartmentService.DepartmentAssignment departmentAssignment = resolveDepartmentAssignment(
                role,
                role == Role.SUPER_ADMIN ? null : resolveOrganizationForExistingUser(user),
                user.getDepartment()
        );
        user.setDepartmentId(departmentAssignment != null ? departmentAssignment.departmentId() : null);
        user.setDepartment(departmentAssignment != null ? departmentAssignment.departmentName() : null);
        User saved = userRepository.save(user);
        revokeAllRefreshTokens(saved.getId());
        notificationService.deactivateUserDevices(saved.getId(), "Role changes invalidated the current mobile session.");
        accessAuditService.recordRoleChanged(actor, saved, previousRoles, saved.getRoles());
        return toResponse(saved);
    }

    private void validateCreatableRole(Role role, Authentication authentication, User actor) {
        if (role == Role.VISITOR) {
            throw new BadRequestException("This role cannot be created from internal user management.");
        }
        if (role == Role.SUPER_ADMIN) {
            accessAuditService.recordPrivilegeEscalationAttempt(actor, role,
                    "SUPER_ADMIN creation was attempted through standard internal user management.");
            throw new BadRequestException("SUPER_ADMIN accounts require the secure OTP-confirmed creation flow.");
        }
        if (role == Role.ADMIN && !hasRole(authentication, Role.SUPER_ADMIN)) {
            throw new BadRequestException("Only SUPER_ADMIN can create admin accounts.");
        }
        if (role != Role.ADMIN && !isWorkforceRole(role)) {
            throw new BadRequestException("Unsupported internal account role.");
        }
    }

    private void validateReassignableRole(Role role, Authentication authentication, User actor) {
        if (role == Role.SUPER_ADMIN || role == Role.VISITOR) {
            if (role == Role.SUPER_ADMIN) {
                accessAuditService.recordPrivilegeEscalationAttempt(actor, role,
                        "SUPER_ADMIN promotion was attempted through standard internal role management.");
            }
            throw new BadRequestException("This role cannot be assigned from internal user management.");
        }
        if (role == Role.ADMIN && !hasRole(authentication, Role.SUPER_ADMIN)) {
            throw new BadRequestException("Only SUPER_ADMIN can assign admin accounts.");
        }
        if (role != Role.ADMIN && !isWorkforceRole(role)) {
            throw new BadRequestException("Unsupported internal account role.");
        }
    }

    private void validateMutableAccount(User user, Authentication authentication) {
        User actor = currentUser(authentication);
        if (user.getRoles().contains(Role.SUPER_ADMIN)) {
            accessAuditService.recordPrivilegeEscalationAttempt(actor, Role.SUPER_ADMIN,
                    "SUPER_ADMIN account mutation was attempted through standard internal user management.");
            if (userRepository.countByRolesContainingAndActiveTrueAndAccountStatus(Role.SUPER_ADMIN, AccountStatus.ACTIVE) <= 1) {
                throw new BadRequestException("The last active SUPER_ADMIN account cannot be changed.");
            }
            throw new BadRequestException("SUPER_ADMIN accounts require secure platform-owner workflows.");
        }
        if (user.getRoles().contains(Role.ADMIN) && !hasRole(authentication, Role.SUPER_ADMIN)) {
            throw new BadRequestException("Only SUPER_ADMIN can manage admin accounts.");
        }
        if (!hasRole(authentication, Role.SUPER_ADMIN) && !requiredOrganizationId(actor).equals(user.getOrganizationId())) {
            throw new ResourceNotFoundException("User account was not found.");
        }
        if (authentication != null && user.getId() != null && user.getId().equals(authentication.getName())) {
            throw new BadRequestException("You cannot change your own access state from this panel.");
        }
    }

    private void ensureNotFinalActiveOrganizationAdmin(User user, String message) {
        if (user.getRoles() == null || !user.getRoles().contains(Role.ADMIN) || !isActiveAdmin(user)) {
            return;
        }
        String organizationId = trimToNull(user.getOrganizationId());
        if (organizationId == null) {
            return;
        }
        long activeAdmins = userRepository.countByOrganizationIdAndRolesContainingAndActiveTrueAndAccountStatus(
                organizationId,
                Role.ADMIN,
                AccountStatus.ACTIVE
        );
        if (activeAdmins <= 1) {
            throw new BadRequestException(message);
        }
    }

    private boolean isActiveAdmin(User user) {
        return user.getRoles() != null
                && user.getRoles().contains(Role.ADMIN)
                && user.isActive()
                && user.getAccountStatus() == AccountStatus.ACTIVE;
    }

    private void validateReadableAccount(User user, Authentication authentication) {
        User actor = currentUser(authentication);
        if (user.getRoles().contains(Role.SUPER_ADMIN) && !hasRole(authentication, Role.SUPER_ADMIN)) {
            throw new ResourceNotFoundException("User account was not found.");
        }
        if (!hasRole(authentication, Role.SUPER_ADMIN) && !requiredOrganizationId(actor).equals(user.getOrganizationId())) {
            throw new ResourceNotFoundException("User account was not found.");
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

    private void expirePasswordResetTokens(String userId) {
        passwordResetTokenRepository.findTopByUserIdAndUsedAtIsNullOrderByCreatedAtDesc(userId)
                .ifPresent(token -> {
                    token.setUsedAt(Instant.now());
                    passwordResetTokenRepository.save(token);
                });
    }

    private void issueWorkforceInvite(User user, User actor, String note, boolean resend) {
        expirePasswordResetTokens(user.getId());
        String resetToken = tokenService.generateOpaqueToken();
        Instant now = Instant.now();
        PasswordResetToken token = new PasswordResetToken();
        token.setUserId(user.getId());
        token.setTokenHash(tokenService.hash(tokenService.generateOpaqueToken()));
        token.setResetTokenHash(tokenService.hash(resetToken));
        token.setVerifiedAt(now);
        token.setExpiresAt(now.plus(WORKFORCE_INVITE_EXPIRY));
        token.setResetTokenExpiresAt(now.plus(WORKFORCE_INVITE_EXPIRY));
        token.setCreatedAt(now);
        passwordResetTokenRepository.save(token);

        try {
            emailService.sendWorkforceInvite(
                    user.getEmail(),
                    user.getFullName(),
                    user.getOrganizationName(),
                    renderSingleRole(user.getRoles() == null || user.getRoles().isEmpty() ? null : user.getRoles().iterator().next()),
                    workforceActivationUrl(resetToken, user.getEmail()),
                    WORKFORCE_INVITE_EXPIRY.toDays(),
                    note,
                    actor != null ? actor.getFullName() : null,
                    resend
            );
        } catch (RuntimeException ex) {
            accessAuditService.recordWorkforceOnboarding(actor, user, "WORKFORCE_INVITE_DELIVERY_FAILED", "FAILED",
                    "Invite email delivery failed: %s".formatted(ex.getMessage()));
        }
    }

    private String workforceActivationUrl(String resetToken, String email) {
        String publicOrigin = corsOriginResolver.resolvePublicOrigin();
        if (publicOrigin == null) {
            throw new IllegalStateException("AccessFlow public frontend origin is not configured.");
        }
        return UriComponentsBuilder.fromUriString(publicOrigin)
                .path("/reset-password")
                .queryParam("token", resetToken)
                .queryParam("email", email)
                .build(true)
                .toUriString();
    }

    private AdminUserResponse toResponse(User user) {
        return new AdminUserResponse(
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
                user.getOrganizationId(),
                user.getOrganizationName(),
                user.getOrganizationCode(),
                user.getOrganizationTimezone(),
                user.getOrganizationRegionCountry(),
                user.getRoles(),
                user.isActive(),
                user.getAccountStatus(),
                user.getWorkforceOnboardingCreatedById(),
                user.getWorkforceOnboardingCreatedByName(),
                user.getWorkforceOnboardingCreatedAt(),
                user.getWorkforceApprovedById(),
                user.getWorkforceApprovedByName(),
                user.getWorkforceApprovedAt(),
                user.getWorkforceRejectedById(),
                user.getWorkforceRejectedByName(),
                user.getWorkforceRejectedAt(),
                user.getWorkforceRejectionReason(),
                user.getCreatedAt(),
                user.getUpdatedAt()
        );
    }

    private List<Map<String, String>> recentActivity(User user) {
        if (trimToNull(user.getOrganizationId()) == null) {
            return List.of();
        }
        return accessAuditLogRepository.findTop50ByOrganizationIdOrderByCreatedAtDesc(user.getOrganizationId())
                .stream()
                .filter(log -> user.getId() != null && (user.getId().equals(log.getTargetId()) || user.getId().equals(log.getActorId())))
                .limit(12)
                .map(log -> Map.of(
                        "title", "%s · %s".formatted(log.getAction(), trimToNull(log.getActorName()) == null ? "System" : log.getActorName()),
                        "status", trimToNull(log.getDetails()) == null
                                ? (trimToNull(log.getOutcome()) == null ? "Recorded" : log.getOutcome())
                                : log.getDetails()
                ))
                .toList();
    }

    private boolean matchesQuery(User user, String query) {
        String normalized = trimToNull(query);
        if (normalized == null) {
            return true;
        }
        String lookup = normalized.toLowerCase(Locale.ROOT);
        return List.of(
                user.getFullName(),
                user.getEmail(),
                user.getUsername(),
                user.getDepartment(),
                user.getDesignation(),
                user.getEmployeeId(),
                user.getOrganizationName(),
                user.getOrganizationCode(),
                renderSingleRole(user.getRoles() == null || user.getRoles().isEmpty() ? null : user.getRoles().iterator().next())
        ).stream()
                .filter(value -> value != null && !value.isBlank())
                .anyMatch(value -> value.toLowerCase(Locale.ROOT).contains(lookup));
    }

    private boolean matchesStatus(User user, String status) {
        String normalized = trimToNull(status);
        if (normalized == null || "ALL".equalsIgnoreCase(normalized)) {
            return true;
        }
        return switch (normalized.toUpperCase(Locale.ROOT)) {
            case "ACTIVE" -> user.isActive() && user.getAccountStatus() == AccountStatus.ACTIVE;
            case "INACTIVE", "DISABLED" -> !user.isActive() || user.getAccountStatus() == AccountStatus.DISABLED;
            case "PENDING", "PENDING_INVITES", "UNVERIFIED" -> isPendingInvite(user);
            default -> user.getAccountStatus() != null && user.getAccountStatus().name().equalsIgnoreCase(normalized);
        };
    }

    private boolean matchesDepartment(User user, String department) {
        String normalized = trimToNull(department);
        return normalized == null || (user.getDepartment() != null && user.getDepartment().equalsIgnoreCase(normalized));
    }

    private Comparator<User> userComparator(String sort) {
        String normalized = trimToNull(sort) == null ? "alphabetical" : sort.trim().toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "newest" -> Comparator.comparing(User::getCreatedAt, Comparator.nullsLast(Comparator.naturalOrder())).reversed();
            case "role" -> Comparator.comparing(user -> renderSingleRole(user.getRoles() == null || user.getRoles().isEmpty() ? null : user.getRoles().iterator().next()));
            case "last-active", "lastactive" -> Comparator.comparing(User::getUpdatedAt, Comparator.nullsLast(Comparator.naturalOrder())).reversed();
            default -> Comparator.comparing(user -> trimToNull(user.getFullName()) == null ? user.getEmail() : user.getFullName(), String.CASE_INSENSITIVE_ORDER);
        };
    }

    private String normalizeUsername(String value) {
        var errors = UsernamePolicy.validate(value);
        if (!errors.isEmpty()) {
            throw new BadRequestException(errors.values().iterator().next());
        }
        return UsernamePolicy.normalizeForLookup(value);
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

    private User currentUser(Authentication authentication) {
        if (authentication == null || authentication.getName() == null) {
            throw new BadRequestException("Authentication is required.");
        }
        return userRepository.findById(authentication.getName())
                .orElseThrow(() -> new ResourceNotFoundException("User account was not found."));
    }

    private void applyEmployeeWorkforceFields(User user, AdminUserCreateRequest request) {
        applyWorkforceFields(
                user,
                request.role(),
                request.designation(),
                request.employeeType(),
                request.employeePhotoUrl(),
                request.shiftName(),
                request.shiftStartTime(),
                request.shiftEndTime()
        );
    }

    private void applyWorkforceFields(
            User user,
            Role role,
            String designation,
            String employeeType,
            String employeePhotoUrl,
            String shiftName,
            String shiftStartTime,
            String shiftEndTime
    ) {
        if (!isWorkforceRole(role)) {
            return;
        }
        if (designation != null) {
            user.setDesignation(trimToNull(designation));
        }
        if (employeeType != null || trimToNull(user.getEmployeeType()) == null) {
            user.setEmployeeType(trimToNull(employeeType) == null ? defaultEmployeeType(role) : trimToNull(employeeType).toUpperCase(Locale.ROOT));
        }
        if (employeePhotoUrl != null) {
            user.setEmployeePhotoUrl(trimToNull(employeePhotoUrl));
        }
        if (shiftName != null || trimToNull(user.getShiftName()) == null) {
            user.setShiftName(trimToNull(shiftName) == null ? "General Shift" : trimToNull(shiftName));
        }
        if (shiftStartTime != null || trimToNull(user.getShiftStartTime()) == null) {
            user.setShiftStartTime(validateShiftTime(shiftStartTime, trimToNull(user.getShiftStartTime()) == null ? "09:00" : user.getShiftStartTime()));
        }
        if (shiftEndTime != null || trimToNull(user.getShiftEndTime()) == null) {
            user.setShiftEndTime(validateShiftTime(shiftEndTime, trimToNull(user.getShiftEndTime()) == null ? "18:00" : user.getShiftEndTime()));
        }
    }

    private void applyAccountStatus(User user, AccountStatus accountStatus) {
        if (accountStatus == AccountStatus.PENDING_APPROVAL
                || accountStatus == AccountStatus.CHANGES_REQUESTED
                || accountStatus == AccountStatus.REJECTED) {
            throw new BadRequestException("Onboarding approval states are managed by the approval workflow.");
        }
        user.setAccountStatus(accountStatus);
        user.setActive(accountStatus == AccountStatus.ACTIVE);
    }

    private String validateShiftTime(String value, String fallback) {
        String candidate = trimToNull(value);
        if (candidate == null) {
            return fallback;
        }
        try {
            LocalTime.parse(candidate);
            return candidate;
        } catch (DateTimeParseException ex) {
            throw new BadRequestException("Shift times must use HH:mm format.");
        }
    }

    private void requireSuperAdmin(Authentication authentication, User actor) {
        if (!hasRole(authentication, Role.SUPER_ADMIN) || actor.getRoles() == null || !actor.getRoles().contains(Role.SUPER_ADMIN)) {
            accessAuditService.recordPrivilegeEscalationAttempt(actor, Role.SUPER_ADMIN,
                    "Non-SUPER_ADMIN account attempted to use the secure SUPER_ADMIN creation flow.");
            throw new BadRequestException("Only SUPER_ADMIN can use this platform-owner flow.");
        }
    }

    private void verifySuperAdminCreationOtp(User actor, String otp) {
        SuperAdminCreationOtp token = superAdminCreationOtpRepository.findTopByActorUserIdAndUsedAtIsNullOrderByCreatedAtDesc(actor.getId())
                .orElseThrow(() -> invalidSuperAdminOtp(actor, "No active SUPER_ADMIN creation OTP was found."));

        Instant now = Instant.now();
        if (token.getLockedAt() != null
                || token.getVerifiedAt() != null
                || token.getUsedAt() != null
                || token.getExpiresAt() == null
                || token.getExpiresAt().isBefore(now)
                || token.getOtpHash() == null) {
            throw invalidSuperAdminOtp(actor, "SUPER_ADMIN creation OTP was expired, locked, used, or unavailable.");
        }

        String expectedHash = tokenService.hash(actor.getId() + ":" + otp);
        if (!expectedHash.equals(token.getOtpHash())) {
            token.setAttempts(token.getAttempts() + 1);
            if (token.getAttempts() >= token.getMaxAttempts()) {
                token.setLockedAt(now);
            }
            superAdminCreationOtpRepository.save(token);
            throw invalidSuperAdminOtp(actor, "SUPER_ADMIN creation OTP verification failed.");
        }

        token.setOtpHash(null);
        token.setVerifiedAt(now);
        token.setUsedAt(now);
        superAdminCreationOtpRepository.save(token);
        accessAuditService.recordSuperAdminOtpVerification(actor, "SUCCESS", "SUPER_ADMIN creation OTP verified and invalidated.");
    }

    private UnauthorizedException invalidSuperAdminOtp(User actor, String detail) {
        accessAuditService.recordSuperAdminOtpVerification(actor, "DENIED", detail);
        return new UnauthorizedException("Invalid or expired SUPER_ADMIN verification code.");
    }

    private Organization resolveOrganizationForCreate(AdminUserCreateRequest request, Role role, User actor, Authentication authentication) {
        if (role == Role.SUPER_ADMIN) {
            if (trimToNull(request.organizationId()) != null || trimToNull(request.companyCode()) != null) {
                throw new BadRequestException("SUPER_ADMIN accounts are platform-level and cannot be assigned to an organization.");
            }
            return null;
        }
        if (hasRole(authentication, Role.SUPER_ADMIN)) {
            String organizationId = trimToNull(request.organizationId());
            if (organizationId != null) {
                return organizationService.requireActive(organizationId);
            }
            return organizationService.resolveRequired(request.companyCode(), null);
        }
        if (role == Role.ADMIN) {
            throw new BadRequestException("Only SUPER_ADMIN can create admin accounts.");
        }
        return organizationService.requireActive(requiredOrganizationId(actor));
    }

    private Organization resolveOrganizationForInvite(WorkforceInviteRequest request, Role role, User actor, Authentication authentication) {
        if (role == Role.ADMIN || role == Role.SUPER_ADMIN || role == Role.VISITOR) {
            throw new BadRequestException("Only organization workforce roles can be invited.");
        }
        if (hasRole(authentication, Role.SUPER_ADMIN)) {
            String organizationId = trimToNull(request.organizationId());
            if (organizationId != null) {
                return organizationService.requireActive(organizationId);
            }
            return organizationService.resolveRequired(request.companyCode(), null);
        }
        return organizationService.requireActive(requiredOrganizationId(actor));
    }

    private void applyOrganization(User user, Organization organization) {
        if (organization == null) {
            user.setOrganizationId(null);
            user.setOrganizationName(null);
            user.setOrganizationCode(null);
            user.setOrganizationTimezone(null);
            user.setOrganizationRegionCountry(null);
            return;
        }
        user.setOrganizationId(organization.getId());
        user.setOrganizationName(organization.getCompanyName());
        user.setOrganizationCode(organization.getCompanyCode());
        user.setOrganizationTimezone(organization.getTimezone());
        user.setOrganizationRegionCountry(organization.getRegionCountry());
    }

    private DepartmentService.DepartmentAssignment resolveDepartmentAssignment(Role role, Organization organization, String requestedDepartment) {
        String department = trimToNull(requestedDepartment);
        if (role == Role.SUPER_ADMIN) {
            if (department != null) {
                throw new BadRequestException("SUPER_ADMIN accounts do not use departments.");
            }
            return null;
        }
        if (organization == null) {
            throw new BadRequestException("An organization is required for this account role.");
        }

        if (role == Role.SECURITY_GUARD) {
            if (department != null && !SECURITY_DEPARTMENT.equalsIgnoreCase(department)) {
                throw new BadRequestException("Security portal accounts must use the Security department.");
            }
            return departmentService.resolveAssignment(organization.getId(), SECURITY_DEPARTMENT);
        }
        if (role == Role.RECEPTION) {
            return departmentService.resolveAssignment(organization.getId(), department == null ? RECEPTION_DEPARTMENT : requestedDepartment);
        }
        if (role == Role.OPERATOR) {
            return departmentService.resolveAssignment(organization.getId(), department == null ? OPERATIONS_DEPARTMENT : requestedDepartment);
        }
        if (role == Role.MANAGER) {
            return departmentService.resolveAssignment(organization.getId(), department == null ? MANAGEMENT_DEPARTMENT : requestedDepartment);
        }
        if (role == Role.ADMIN) {
            if (department != null && !ADMINISTRATION_DEPARTMENT.equalsIgnoreCase(department)) {
                throw new BadRequestException("Administration portal accounts must use the Administration department.");
            }
            return departmentService.resolveAssignment(organization.getId(), ADMINISTRATION_DEPARTMENT);
        }
        return departmentService.resolveAssignment(organization.getId(), requestedDepartment);
    }

    private Organization resolveOrganizationForExistingUser(User user) {
        String organizationId = trimToNull(user.getOrganizationId());
        if (organizationId == null) {
            throw new BadRequestException("This account is not assigned to an organization.");
        }
        return organizationService.requireActive(organizationId);
    }

    private String requiredOrganizationId(User user) {
        String organizationId = trimToNull(user.getOrganizationId());
        if (organizationId == null) {
            throw new BadRequestException("Your account is not assigned to an organization.");
        }
        return organizationId;
    }

    private boolean isInternalWorkforceOrAdmin(User user) {
        return user.getRoles() != null
                && !user.getRoles().contains(Role.VISITOR)
                && (user.getRoles().contains(Role.ADMIN) || user.getRoles().contains(Role.SUPER_ADMIN) || isAnyWorkforceUser(user));
    }

    private boolean isAnyWorkforceUser(User user) {
        return user.getRoles() != null && user.getRoles().stream().anyMatch(this::isWorkforceRole);
    }

    private boolean isWorkforceRole(Role role) {
        return role != null && ORG_WORKFORCE_ROLES.contains(role);
    }

    private boolean isPendingInvite(User user) {
        return isAnyWorkforceUser(user) && user.getAccountStatus() == AccountStatus.UNVERIFIED;
    }

    private String defaultEmployeeType(Role role) {
        return switch (role) {
            case SECURITY_GUARD -> "SECURITY";
            case RECEPTION -> "RECEPTION";
            case OPERATOR -> "OPERATOR";
            case MANAGER -> "MANAGER";
            default -> "FULL_TIME";
        };
    }

    private String renderSingleRole(Role role) {
        if (role == null) {
            return "WORKFORCE";
        }
        return role.name().replace('_', ' ');
    }
}
