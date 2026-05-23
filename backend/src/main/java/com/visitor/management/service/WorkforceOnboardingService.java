package com.visitor.management.service;

import com.visitor.management.dto.AdminUserResponse;
import com.visitor.management.dto.WorkforceApprovalRequest;
import com.visitor.management.dto.WorkforceOnboardingRequest;
import com.visitor.management.dto.WorkforceRejectionRequest;
import com.visitor.management.entity.AccountStatus;
import com.visitor.management.entity.NotificationType;
import com.visitor.management.entity.Organization;
import com.visitor.management.entity.PasswordResetToken;
import com.visitor.management.entity.Role;
import com.visitor.management.entity.User;
import com.visitor.management.config.CorsOriginResolver;
import com.visitor.management.exception.BadRequestException;
import com.visitor.management.exception.ConflictException;
import com.visitor.management.exception.ResourceNotFoundException;
import com.visitor.management.repository.PasswordResetTokenRepository;
import com.visitor.management.repository.UserRepository;
import com.visitor.management.validation.UsernamePolicy;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.util.UriComponentsBuilder;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.EnumSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Service
public class WorkforceOnboardingService {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Duration WORKFORCE_ACTIVATION_EXPIRY = Duration.ofDays(7);
    private static final EnumSet<Role> APPROVABLE_WORKFORCE_ROLES = EnumSet.of(
            Role.EMPLOYEE,
            Role.SECURITY_GUARD,
            Role.RECEPTION,
            Role.OPERATOR,
            Role.MANAGER
    );

    private final UserRepository userRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final OrganizationService organizationService;
    private final DepartmentService departmentService;
    private final PhoneNumberService phoneNumberService;
    private final EmployeeAttendanceService employeeAttendanceService;
    private final AccessAuditService accessAuditService;
    private final NotificationService notificationService;
    private final TokenService tokenService;
    private final EmailService emailService;
    private final CorsOriginResolver corsOriginResolver;

    public WorkforceOnboardingService(
            UserRepository userRepository,
            PasswordResetTokenRepository passwordResetTokenRepository,
            PasswordEncoder passwordEncoder,
            OrganizationService organizationService,
            DepartmentService departmentService,
            PhoneNumberService phoneNumberService,
            EmployeeAttendanceService employeeAttendanceService,
            AccessAuditService accessAuditService,
            NotificationService notificationService,
            TokenService tokenService,
            EmailService emailService,
            CorsOriginResolver corsOriginResolver
    ) {
        this.userRepository = userRepository;
        this.passwordResetTokenRepository = passwordResetTokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.organizationService = organizationService;
        this.departmentService = departmentService;
        this.phoneNumberService = phoneNumberService;
        this.employeeAttendanceService = employeeAttendanceService;
        this.accessAuditService = accessAuditService;
        this.notificationService = notificationService;
        this.tokenService = tokenService;
        this.emailService = emailService;
        this.corsOriginResolver = corsOriginResolver;
    }

    public AdminUserResponse createAssistedRequest(WorkforceOnboardingRequest request, String securityGuardId) {
        User guard = currentUser(securityGuardId);
        if (guard.getRoles() == null || !guard.getRoles().contains(Role.SECURITY_GUARD)) {
            throw new BadRequestException("Only security guards can create assisted workforce onboarding requests.");
        }

        String organizationId = requiredOrganizationId(guard);
        Organization organization = organizationService.requireActive(organizationId);
        String fullName = requireText(request.fullName(), "Worker full name is required.");
        String username = resolveUsername(request.username(), fullName);
        String email = resolveEmail(request.email(), username);

        if (userRepository.existsByUsernameIgnoreCase(username)) {
            throw new ConflictException("An account with this username already exists.");
        }
        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw new ConflictException("An account with this email already exists.");
        }

        User worker = new User();
        worker.setFullName(fullName);
        worker.setUsername(username);
        worker.setEmail(email);
        worker.setPasswordHash(passwordEncoder.encode(randomPassword()));
        Role requestedRole = resolveRequestedRole(request.role(), false);
        worker.setRoles(Set.of(requestedRole));
        worker.setActive(false);
        worker.setAccountStatus(AccountStatus.PENDING_APPROVAL);
        applyOrganization(worker, organization);
        applyWorkerFields(worker, request);
        PhoneNumberService.NormalizedPhone phone = phoneNumberService.normalize(request.phoneCountryCode(), request.phone(), false);
        if (phone != null) {
            worker.setPhone(phone.e164());
            worker.setPhoneCountryCode(phone.countryCode());
        }
        Instant now = Instant.now();
        worker.setWorkforceOnboardingCreatedById(guard.getId());
        worker.setWorkforceOnboardingCreatedByName(guard.getFullName());
        worker.setWorkforceOnboardingCreatedAt(now);

        User saved = userRepository.save(worker);
        accessAuditService.recordWorkforceOnboarding(guard, saved, "WORKFORCE_ONBOARDING_CREATED", "PENDING",
                "Security-assisted worker onboarding request created. QR and badge access remain inactive pending admin approval.");
        notificationService.notifyOrganizationRoles(
                organizationId,
                Set.of(Role.ADMIN),
                null,
                NotificationType.WORKFORCE_ONBOARDING_REQUESTED,
                "Workforce approval required",
                "%s submitted a workforce onboarding request for %s.".formatted(guard.getFullName(), saved.getFullName()),
                null,
                "/pages/admin/#workforce-onboarding",
                guard.getFullName()
        );
        return toResponse(saved);
    }

    public List<AdminUserResponse> pendingRequests(String actorId) {
        User actor = currentUser(actorId);
        List<User> workers = actor.getRoles().contains(Role.SUPER_ADMIN)
                ? userRepository.findAllByRolesInAndAccountStatus(APPROVABLE_WORKFORCE_ROLES, AccountStatus.PENDING_APPROVAL)
                : userRepository.findAllByOrganizationIdAndRolesInAndAccountStatus(requiredOrganizationId(actor), APPROVABLE_WORKFORCE_ROLES, AccountStatus.PENDING_APPROVAL);
        return sortedResponses(workers);
    }

    public List<AdminUserResponse> requestsForSecurityGuard(String securityGuardId) {
        User guard = currentUser(securityGuardId);
        if (guard.getRoles() == null || !guard.getRoles().contains(Role.SECURITY_GUARD)) {
            throw new BadRequestException("Only security guards can view their submitted workforce requests.");
        }
        List<User> workers = userRepository.findAllByOrganizationIdAndWorkforceOnboardingCreatedById(
                requiredOrganizationId(guard),
                guard.getId()
        );
        return sortedResponses(workers);
    }

    private List<AdminUserResponse> sortedResponses(List<User> workers) {
        return workers.stream()
                .sorted((left, right) -> String.valueOf(right.getWorkforceOnboardingCreatedAt()).compareTo(String.valueOf(left.getWorkforceOnboardingCreatedAt())))
                .map(this::toResponse)
                .toList();
    }

    public AdminUserResponse updateWorker(String workerId, WorkforceApprovalRequest request, String adminId) {
        User admin = requireOrganizationAdmin(adminId);
        User worker = requireManagedWorker(workerId, admin);
        applyWorkerFields(worker, request);
        User saved = userRepository.save(worker);
        accessAuditService.recordWorkforceOnboarding(admin, saved, "WORKFORCE_ONBOARDING_UPDATED", "SUCCESS",
                "Admin updated workforce onboarding details before access activation.");
        return toResponse(saved);
    }

    public AdminUserResponse approve(String workerId, WorkforceApprovalRequest request, String adminId) {
        User admin = requireOrganizationAdmin(adminId);
        User worker = requireManagedWorker(workerId, admin);
        if (worker.getAccountStatus() != AccountStatus.PENDING_APPROVAL) {
            throw new BadRequestException("Only pending workforce onboarding requests can be approved.");
        }

        applyWorkerFields(worker, request);
        Role approvedRole = resolveRequestedRole(request == null ? null : request.role(), true);
        if (approvedRole != null && !worker.getRoles().contains(approvedRole)) {
            Set<Role> previousRoles = Set.copyOf(worker.getRoles());
            worker.setRoles(Set.of(approvedRole));
            accessAuditService.recordRoleChanged(admin, worker, previousRoles, worker.getRoles());
        }
        worker.setActive(true);
        worker.setAccountStatus(AccountStatus.ACTIVE);
        worker.setEmailVerified(Boolean.FALSE);
        worker.setWorkforceApprovedById(admin.getId());
        worker.setWorkforceApprovedByName(admin.getFullName());
        worker.setWorkforceApprovedAt(Instant.now());
        worker.setWorkforceRejectedById(null);
        worker.setWorkforceRejectedByName(null);
        worker.setWorkforceRejectedAt(null);
        worker.setWorkforceRejectionReason(null);
        employeeAttendanceService.activateEmployeeCredential(worker);

        User saved = userRepository.save(worker);
        issueActivationInvite(saved, admin, request == null ? null : request.note());
        accessAuditService.recordWorkforceOnboarding(admin, saved, "WORKFORCE_ONBOARDING_APPROVED", "SUCCESS",
                "Admin approved workforce onboarding and activated check-in/check-out access.");
        accessAuditService.recordWorkforceOnboarding(admin, saved, "WORKFORCE_QR_ACTIVATED", "SUCCESS",
                "Static workforce QR activated after admin approval.");
        notificationService.notifyUser(
                saved.getId(),
                NotificationType.WORKFORCE_ONBOARDING_APPROVED,
                "Workforce onboarding approved",
                "Your workforce access has been approved and your credential is now active.",
                null,
                "/pages/employee/#badge",
                admin.getFullName()
        );
        notifyRequester(saved, NotificationType.WORKFORCE_ONBOARDING_APPROVED, "Workforce request approved",
                "%s approved the workforce request for %s.".formatted(admin.getFullName(), saved.getFullName()),
                "/pages/security/#workforce-onboarding");
        return toResponse(saved);
    }

    public AdminUserResponse reject(String workerId, WorkforceRejectionRequest request, String adminId) {
        User admin = requireOrganizationAdmin(adminId);
        User worker = requireManagedWorker(workerId, admin);
        if (worker.getAccountStatus() != AccountStatus.PENDING_APPROVAL) {
            throw new BadRequestException("Only pending workforce onboarding requests can be rejected.");
        }

        worker.setActive(false);
        worker.setAccountStatus(AccountStatus.REJECTED);
        worker.setWorkforceRejectedById(admin.getId());
        worker.setWorkforceRejectedByName(admin.getFullName());
        worker.setWorkforceRejectedAt(Instant.now());
        worker.setWorkforceRejectionReason(requireText(request.reason(), "Rejection reason is required."));
        employeeAttendanceService.deactivateEmployeeCredential(worker);

        User saved = userRepository.save(worker);
        accessAuditService.recordWorkforceOnboarding(admin, saved, "WORKFORCE_ONBOARDING_REJECTED", "DENIED",
                "Admin rejected workforce onboarding: " + saved.getWorkforceRejectionReason());
        notificationService.notifyUser(
                saved.getId(),
                NotificationType.WORKFORCE_ONBOARDING_REJECTED,
                "Workforce onboarding rejected",
                "Your workforce onboarding request was rejected. Contact your administrator for next steps.",
                null,
                "/pages/employee/#notifications",
                admin.getFullName()
        );
        notifyRequester(saved, NotificationType.WORKFORCE_ONBOARDING_REJECTED, "Workforce request rejected",
                "%s rejected the workforce request for %s.".formatted(admin.getFullName(), saved.getFullName()),
                "/pages/security/#workforce-onboarding");
        return toResponse(saved);
    }

    public AdminUserResponse requestModification(String workerId, WorkforceRejectionRequest request, String adminId) {
        User admin = requireOrganizationAdmin(adminId);
        User worker = requireManagedWorker(workerId, admin);
        if (worker.getAccountStatus() != AccountStatus.PENDING_APPROVAL) {
            throw new BadRequestException("Only pending workforce onboarding requests can be returned for modification.");
        }
        worker.setActive(false);
        worker.setAccountStatus(AccountStatus.CHANGES_REQUESTED);
        worker.setWorkforceRejectedById(admin.getId());
        worker.setWorkforceRejectedByName(admin.getFullName());
        worker.setWorkforceRejectedAt(Instant.now());
        worker.setWorkforceRejectionReason(requireText(request.reason(), "Modification request details are required."));
        employeeAttendanceService.deactivateEmployeeCredential(worker);

        User saved = userRepository.save(worker);
        accessAuditService.recordWorkforceOnboarding(admin, saved, "WORKFORCE_ONBOARDING_CHANGES_REQUESTED", "ACTION_REQUIRED",
                "Admin requested workforce onboarding changes: " + saved.getWorkforceRejectionReason());
        notifyRequester(saved, NotificationType.WORKFORCE_ONBOARDING_MODIFICATION_REQUIRED, "Workforce request needs changes",
                "%s requested changes for %s: %s".formatted(admin.getFullName(), saved.getFullName(), saved.getWorkforceRejectionReason()),
                "/pages/security/#workforce-onboarding");
        return toResponse(saved);
    }

    private void applyWorkerFields(User worker, WorkforceOnboardingRequest request) {
        DepartmentService.DepartmentAssignment department = departmentService.resolveAssignment(worker.getOrganizationId(), request.department());
        worker.setDepartmentId(department != null ? department.departmentId() : null);
        worker.setDepartment(department != null ? department.departmentName() : null);
        worker.setDesignation(trimToNull(request.designation()));
        worker.setEmployeeType(resolveEmployeeType(request.employeeType()));
        worker.setEmployeePhotoUrl(trimToNull(request.employeePhotoUrl()));
        worker.setShiftName(trimToNull(request.shiftName()) == null ? null : trimToNull(request.shiftName()));
        worker.setShiftStartTime(validateShiftTime(request.shiftStartTime()));
        worker.setShiftEndTime(validateShiftTime(request.shiftEndTime()));
    }

    private void applyWorkerFields(User worker, WorkforceApprovalRequest request) {
        if (request == null) {
            return;
        }
        DepartmentService.DepartmentAssignment department = departmentService.resolveAssignment(worker.getOrganizationId(), request.department());
        if (department != null || request.department() != null) {
            worker.setDepartmentId(department != null ? department.departmentId() : null);
            worker.setDepartment(department != null ? department.departmentName() : null);
        }
        if (request.designation() != null) {
            worker.setDesignation(trimToNull(request.designation()));
        }
        if (request.employeeType() != null) {
            worker.setEmployeeType(resolveEmployeeType(request.employeeType()));
        }
        if (request.employeePhotoUrl() != null) {
            worker.setEmployeePhotoUrl(trimToNull(request.employeePhotoUrl()));
        }
        if (request.shiftName() != null) {
            worker.setShiftName(trimToNull(request.shiftName()));
        }
        if (request.shiftStartTime() != null) {
            worker.setShiftStartTime(validateShiftTime(request.shiftStartTime()));
        }
        if (request.shiftEndTime() != null) {
            worker.setShiftEndTime(validateShiftTime(request.shiftEndTime()));
        }
    }

    private User requireManagedWorker(String workerId, User admin) {
        User worker = userRepository.findById(workerId)
                .orElseThrow(() -> new ResourceNotFoundException("Workforce onboarding request was not found."));
        if (worker.getRoles() == null || worker.getRoles().stream().noneMatch(APPROVABLE_WORKFORCE_ROLES::contains)) {
            throw new ResourceNotFoundException("Workforce onboarding request was not found.");
        }
        if (!requiredOrganizationId(admin).equals(worker.getOrganizationId())) {
            throw new ResourceNotFoundException("Workforce onboarding request was not found.");
        }
        return worker;
    }

    private User requireOrganizationAdmin(String actorId) {
        User actor = currentUser(actorId);
        if (actor.getRoles() == null || !actor.getRoles().contains(Role.ADMIN)) {
            throw new BadRequestException("Only organization admins can approve or reject workforce onboarding.");
        }
        requiredOrganizationId(actor);
        return actor;
    }

    private void applyOrganization(User user, Organization organization) {
        user.setOrganizationId(organization.getId());
        user.setOrganizationName(organization.getCompanyName());
        user.setOrganizationCode(organization.getCompanyCode());
        user.setOrganizationTimezone(organization.getTimezone());
        user.setOrganizationRegionCountry(organization.getRegionCountry());
    }

    private String resolveUsername(String requestedUsername, String fullName) {
        String candidate = trimToNull(requestedUsername);
        if (candidate != null) {
            var errors = UsernamePolicy.validate(candidate);
            if (!errors.isEmpty()) {
                throw new BadRequestException(errors.values().iterator().next());
            }
            return UsernamePolicy.normalizeForLookup(candidate);
        }
        String base = fullName.toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "_")
                .replaceAll("^_+|_+$", "");
        if (base.length() < UsernamePolicy.MIN_LENGTH) {
            base = "worker";
        }
        if (base.length() > 20) {
            base = base.substring(0, 20).replaceAll("_+$", "");
        }
        String username;
        do {
            username = "%s_%04d".formatted(base, RANDOM.nextInt(10_000));
        } while (userRepository.existsByUsernameIgnoreCase(username));
        return username;
    }

    private String resolveEmail(String requestedEmail, String username) {
        String email = trimToNull(requestedEmail);
        return email == null ? username + "@accessflow.local" : email.toLowerCase(Locale.ROOT);
    }

    private String resolveEmployeeType(String value) {
        String employeeType = trimToNull(value);
        return employeeType == null ? "SUPPORT_STAFF" : employeeType.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9_]+", "_");
    }

    private String validateShiftTime(String value) {
        String candidate = trimToNull(value);
        if (candidate == null) {
            return null;
        }
        try {
            LocalTime.parse(candidate);
            return candidate;
        } catch (DateTimeParseException ex) {
            throw new BadRequestException("Shift times must use HH:mm format.");
        }
    }

    private String randomPassword() {
        byte[] bytes = new byte[18];
        RANDOM.nextBytes(bytes);
        return "Af!" + HexFormat.of().formatHex(bytes);
    }

    private Role resolveRequestedRole(Role requestedRole, boolean nullable) {
        if (requestedRole == null) {
            return nullable ? null : Role.EMPLOYEE;
        }
        if (!APPROVABLE_WORKFORCE_ROLES.contains(requestedRole)) {
            throw new BadRequestException("Only organization workforce roles can be requested or approved.");
        }
        return requestedRole;
    }

    private void issueActivationInvite(User user, User actor, String note) {
        try {
            expirePasswordResetTokens(user.getId());
            String resetToken = tokenService.generateOpaqueToken();
            Instant now = Instant.now();
            PasswordResetToken token = new PasswordResetToken();
            token.setUserId(user.getId());
            token.setTokenHash(tokenService.hash(tokenService.generateOpaqueToken()));
            token.setResetTokenHash(tokenService.hash(resetToken));
            token.setVerifiedAt(now);
            token.setExpiresAt(now.plus(WORKFORCE_ACTIVATION_EXPIRY));
            token.setResetTokenExpiresAt(now.plus(WORKFORCE_ACTIVATION_EXPIRY));
            token.setCreatedAt(now);
            passwordResetTokenRepository.save(token);

            emailService.sendWorkforceInvite(
                    user.getEmail(),
                    user.getFullName(),
                    user.getOrganizationName(),
                    renderSingleRole(user.getRoles() == null || user.getRoles().isEmpty() ? null : user.getRoles().iterator().next()),
                    workforceActivationUrl(resetToken, user.getEmail()),
                    WORKFORCE_ACTIVATION_EXPIRY.toDays(),
                    trimToNull(note),
                    actor != null ? actor.getFullName() : null,
                    false
            );
        } catch (RuntimeException ex) {
            accessAuditService.recordWorkforceOnboarding(actor, user, "WORKFORCE_ACTIVATION_INVITE_FAILED", "FAILED",
                    "Activation invite delivery failed: %s".formatted(ex.getMessage()));
        }
    }

    private void expirePasswordResetTokens(String userId) {
        passwordResetTokenRepository.findTopByUserIdAndUsedAtIsNullOrderByCreatedAtDesc(userId)
                .ifPresent(token -> {
                    token.setUsedAt(Instant.now());
                    passwordResetTokenRepository.save(token);
                });
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

    private void notifyRequester(User worker, NotificationType type, String title, String message, String actionUrl) {
        String requesterId = trimToNull(worker.getWorkforceOnboardingCreatedById());
        if (requesterId == null || requesterId.equals(worker.getId())) {
            return;
        }
        notificationService.notifyUser(
                requesterId,
                type,
                title,
                message,
                null,
                actionUrl,
                worker.getWorkforceApprovedByName() != null ? worker.getWorkforceApprovedByName() : worker.getWorkforceRejectedByName(),
                worker.getOrganizationId(),
                "workforce-request-%s-%s".formatted(worker.getId(), type.name().toLowerCase(Locale.ROOT)),
                "WORKFORCE_ONBOARDING",
                worker.getId()
        );
    }

    private String renderSingleRole(Role role) {
        if (role == null) {
            return "WORKFORCE";
        }
        return role.name().replace('_', ' ');
    }

    private User currentUser(String actorId) {
        return userRepository.findById(actorId)
                .orElseThrow(() -> new ResourceNotFoundException("User account was not found."));
    }

    private String requiredOrganizationId(User user) {
        String organizationId = trimToNull(user.getOrganizationId());
        if (organizationId == null) {
            throw new BadRequestException("Your account is not assigned to an organization.");
        }
        return organizationId;
    }

    private String requireText(String value, String message) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            throw new BadRequestException(message);
        }
        return normalized;
    }

    private String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
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
}
