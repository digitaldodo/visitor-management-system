package com.visitor.management.service;

import com.visitor.management.dto.AdminPasswordResetRequest;
import com.visitor.management.dto.SuperAdminCreateRequest;
import com.visitor.management.dto.SuperAdminOtpRequest;
import com.visitor.management.dto.SuperAdminOtpResponse;
import com.visitor.management.dto.AdminUserCreateRequest;
import com.visitor.management.dto.AdminUserResponse;
import com.visitor.management.dto.AdminUserRoleUpdateRequest;
import com.visitor.management.entity.AccountStatus;
import com.visitor.management.entity.Organization;
import com.visitor.management.entity.Role;
import com.visitor.management.entity.SuperAdminCreationOtp;
import com.visitor.management.entity.User;
import com.visitor.management.exception.BadRequestException;
import com.visitor.management.exception.ConflictException;
import com.visitor.management.exception.ResourceNotFoundException;
import com.visitor.management.exception.UnauthorizedException;
import com.visitor.management.repository.RefreshTokenRepository;
import com.visitor.management.repository.SuperAdminCreationOtpRepository;
import com.visitor.management.repository.UserRepository;
import com.visitor.management.validation.UsernamePolicy;
import org.springframework.data.domain.Sort;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.Duration;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.security.SecureRandom;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

@Service
public class AdminUserService {

    private static final Pattern STRONG_PASSWORD_PATTERN = Pattern.compile("^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{12,128}$");
    private static final String SECURITY_DEPARTMENT = "Security";
    private static final String ADMINISTRATION_DEPARTMENT = "Administration";
    private static final Duration SUPER_ADMIN_OTP_EXPIRY = Duration.ofMinutes(5);
    private static final Duration SUPER_ADMIN_OTP_RESEND_COOLDOWN = Duration.ofSeconds(60);
    private static final int SUPER_ADMIN_OTP_MAX_ATTEMPTS = 5;

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final SuperAdminCreationOtpRepository superAdminCreationOtpRepository;
    private final PasswordEncoder passwordEncoder;
    private final OrganizationService organizationService;
    private final DepartmentService departmentService;
    private final AccessAuditService accessAuditService;
    private final TokenService tokenService;
    private final EmailService emailService;
    private final RateLimitService rateLimitService;
    private final PhoneNumberService phoneNumberService;
    private final EmployeeAttendanceService employeeAttendanceService;
    private final SecureRandom secureRandom = new SecureRandom();

    public AdminUserService(
            UserRepository userRepository,
            RefreshTokenRepository refreshTokenRepository,
            SuperAdminCreationOtpRepository superAdminCreationOtpRepository,
            PasswordEncoder passwordEncoder,
            OrganizationService organizationService,
            DepartmentService departmentService,
            AccessAuditService accessAuditService,
            TokenService tokenService,
            EmailService emailService,
            RateLimitService rateLimitService,
            PhoneNumberService phoneNumberService,
            EmployeeAttendanceService employeeAttendanceService
    ) {
        this.userRepository = userRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.superAdminCreationOtpRepository = superAdminCreationOtpRepository;
        this.passwordEncoder = passwordEncoder;
        this.organizationService = organizationService;
        this.departmentService = departmentService;
        this.accessAuditService = accessAuditService;
        this.tokenService = tokenService;
        this.emailService = emailService;
        this.rateLimitService = rateLimitService;
        this.phoneNumberService = phoneNumberService;
        this.employeeAttendanceService = employeeAttendanceService;
    }

    public List<AdminUserResponse> listUsers(Authentication authentication) {
        User actor = currentUser(authentication);
        List<User> users = hasRole(authentication, Role.SUPER_ADMIN)
                ? userRepository.findAll(Sort.by(Sort.Direction.ASC, "fullName"))
                : userRepository.findAllByOrganizationId(requiredOrganizationId(actor));
        return users
                .stream()
                .filter(user -> !actor.getId().equals(user.getId()))
                .map(this::toResponse)
                .toList();
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
        if (role == Role.EMPLOYEE) {
            applyEmployeeWorkforceFields(user, request);
            employeeAttendanceService.provisionEmployeeCredential(user);
        }
        user.setActive(true);
        user.setAccountStatus(AccountStatus.ACTIVE);
        User saved = userRepository.save(user);
        accessAuditService.recordAccountCreated(actor, saved);
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
        user.setActive(false);
        user.setAccountStatus(AccountStatus.DISABLED);
        User saved = userRepository.save(user);
        revokeAllRefreshTokens(saved.getId());
        accessAuditService.recordAccountStateChanged(actor, saved, "ACCOUNT_DISABLED", "Internal account access was disabled.");
        return toResponse(saved);
    }

    public AdminUserResponse enableUser(String id, Authentication authentication) {
        User actor = currentUser(authentication);
        User user = findUser(id);
        validateMutableAccount(user, authentication);
        user.setActive(true);
        user.setAccountStatus(AccountStatus.ACTIVE);
        User saved = userRepository.save(user);
        accessAuditService.recordAccountStateChanged(actor, saved, "ACCOUNT_ENABLED", "Internal account access was enabled.");
        return toResponse(saved);
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
        accessAuditService.recordAccountStateChanged(actor, saved, "PASSWORD_RESET", "Internal password reset completed.");
        return toResponse(saved);
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
        if (role != Role.ADMIN && role != Role.EMPLOYEE && role != Role.SECURITY_GUARD) {
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
        if (role != Role.ADMIN && role != Role.EMPLOYEE && role != Role.SECURITY_GUARD) {
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
                user.getEmployeeId(),
                user.getDesignation(),
                user.getEmployeeType(),
                user.getEmployeePhotoUrl(),
                user.getShiftName(),
                user.getWorkingDays(),
                user.getShiftStartTime(),
                user.getShiftEndTime(),
                user.getGracePeriodMinutes(),
                user.getOvertimePolicy(),
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
                user.getCreatedAt(),
                user.getUpdatedAt()
        );
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
        user.setDesignation(trimToNull(request.designation()));
        user.setEmployeeType(trimToNull(request.employeeType()) == null ? "FULL_TIME" : trimToNull(request.employeeType()).toUpperCase(Locale.ROOT));
        user.setEmployeePhotoUrl(trimToNull(request.employeePhotoUrl()));
        user.setShiftName(trimToNull(request.shiftName()) == null ? "General Shift" : trimToNull(request.shiftName()));
        user.setShiftStartTime(validateShiftTime(request.shiftStartTime(), "09:00"));
        user.setShiftEndTime(validateShiftTime(request.shiftEndTime(), "18:00"));
        user.setGracePeriodMinutes(validateGracePeriod(request.gracePeriodMinutes()));
        user.setOvertimePolicy(trimToNull(request.overtimePolicy()));
        user.setWorkingDays(normalizeWorkingDays(request.workingDays()));
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

    private Integer validateGracePeriod(Integer value) {
        int minutes = value == null ? 10 : value;
        if (minutes < 0 || minutes > 180) {
            throw new BadRequestException("Grace period must be between 0 and 180 minutes.");
        }
        return minutes;
    }

    private Set<String> normalizeWorkingDays(Set<String> workingDays) {
        if (workingDays == null || workingDays.isEmpty()) {
            return new HashSet<>(Set.of("MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"));
        }
        Set<String> normalized = new HashSet<>();
        for (String day : workingDays) {
            try {
                normalized.add(DayOfWeek.valueOf(day.trim().toUpperCase(Locale.ROOT)).name());
            } catch (RuntimeException ex) {
                throw new BadRequestException("Working days must be valid weekday names.");
            }
        }
        return normalized;
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
}
