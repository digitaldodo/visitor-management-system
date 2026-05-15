package com.visitor.management.service;

import com.visitor.management.entity.AccessAuditLog;
import com.visitor.management.entity.Organization;
import com.visitor.management.entity.Role;
import com.visitor.management.entity.User;
import com.visitor.management.repository.AccessAuditLogRepository;
import com.visitor.management.repository.UserRepository;
import com.visitor.management.exception.ResourceNotFoundException;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class AccessAuditService {

    private final AccessAuditLogRepository accessAuditLogRepository;
    private final UserRepository userRepository;

    public AccessAuditService(AccessAuditLogRepository accessAuditLogRepository, UserRepository userRepository) {
        this.accessAuditLogRepository = accessAuditLogRepository;
        this.userRepository = userRepository;
    }

    public void recordLoginSuccess(User user, String audience) {
        record(user, "LOGIN_SUCCESS", "AUTH_SESSION", user.getId(), user.getFullName(), "SUCCESS",
                "Portal audience: %s".formatted(normalize(audience, "default")));
    }

    public void recordLoginFailure(String identifier, String companyCode, String audience, String reason) {
        AccessAuditLog log = new AccessAuditLog();
        log.setActorName(normalize(identifier, "unknown"));
        log.setOrganizationCode(normalize(companyCode, ""));
        log.setAction("LOGIN_FAILURE");
        log.setTargetType("AUTH_SESSION");
        log.setOutcome("DENIED");
        log.setDetails("%s (portal audience: %s)".formatted(
                normalize(reason, "Login rejected."),
                normalize(audience, "default")
        ));
        accessAuditLogRepository.save(log);
    }

    public void recordVisitorAccountRegistered(User user) {
        record(user, "VISITOR_ACCOUNT_REGISTERED", "USER_ACCOUNT", user.getId(), user.getFullName(), "SUCCESS",
                "Public visitor registration completed.");
    }

    public void recordAccountCreated(User actor, User createdUser) {
        record(actor, createdUser.getOrganizationId(), createdUser.getOrganizationName(), createdUser.getOrganizationCode(),
                "ACCOUNT_CREATED", "USER_ACCOUNT", createdUser.getId(), createdUser.getFullName(), "SUCCESS",
                "Created %s account for %s.".formatted(renderRoles(createdUser.getRoles()), normalize(createdUser.getEmail(), createdUser.getId())));
    }

    public void recordSuperAdminCreated(User actor, User createdUser) {
        record(actor, "SUPER_ADMIN_CREATED", "USER_ACCOUNT", createdUser.getId(), createdUser.getFullName(), "SUCCESS",
                "Created SUPER_ADMIN account for %s through the OTP-confirmed flow.".formatted(normalize(createdUser.getEmail(), createdUser.getId())));
    }

    public void recordSuperAdminCreationAttempt(User actor, String targetEmail, String outcome, String detail) {
        record(actor, "SUPER_ADMIN_CREATION_ATTEMPT", "USER_ACCOUNT", null, normalize(targetEmail, "pending SUPER_ADMIN"), outcome, detail);
    }

    public void recordSuperAdminOtpGeneration(User actor, String outcome, String detail) {
        record(actor, "SUPER_ADMIN_OTP_GENERATION", "SUPER_ADMIN_CREATION_OTP", actor != null ? actor.getId() : null,
                actor != null ? actor.getFullName() : null, outcome, detail);
    }

    public void recordSuperAdminOtpVerification(User actor, String outcome, String detail) {
        record(actor, "SUPER_ADMIN_OTP_VERIFICATION", "SUPER_ADMIN_CREATION_OTP", actor != null ? actor.getId() : null,
                actor != null ? actor.getFullName() : null, outcome, detail);
    }

    public void recordPrivilegeEscalationAttempt(User actor, Role attemptedRole, String detail) {
        record(actor, "PRIVILEGE_ESCALATION_ATTEMPT", "USER_ACCOUNT", null, attemptedRole != null ? attemptedRole.name() : "UNKNOWN_ROLE", "DENIED", detail);
    }

    public void recordRoleChanged(User actor, User targetUser, Set<Role> previousRoles, Set<Role> currentRoles) {
        record(actor, targetUser.getOrganizationId(), targetUser.getOrganizationName(), targetUser.getOrganizationCode(),
                "ROLE_CHANGED", "USER_ACCOUNT", targetUser.getId(), targetUser.getFullName(), "SUCCESS",
                "Updated roles from %s to %s.".formatted(renderRoles(previousRoles), renderRoles(currentRoles)));
    }

    public void recordAccountStateChanged(User actor, User targetUser, String action, String detail) {
        record(actor, targetUser.getOrganizationId(), targetUser.getOrganizationName(), targetUser.getOrganizationCode(),
                action, "USER_ACCOUNT", targetUser.getId(), targetUser.getFullName(), "SUCCESS", detail);
    }

    public void recordEmployeeAttendance(User actor, User employee, String action, String detail) {
        record(actor, employee.getOrganizationId(), employee.getOrganizationName(), employee.getOrganizationCode(),
                action, "EMPLOYEE_ATTENDANCE", employee.getId(), employee.getFullName(), "SUCCESS", detail);
    }

    public void recordWorkforceOnboarding(User actor, User worker, String action, String outcome, String detail) {
        record(actor, worker.getOrganizationId(), worker.getOrganizationName(), worker.getOrganizationCode(),
                action, "WORKFORCE_ONBOARDING", worker.getId(), worker.getFullName(), outcome, detail);
    }

    public void recordOrganizationChanged(User actor, Organization organization, String action, String detail) {
        if (organization == null) {
            return;
        }
        record(actor, organization.getId(), organization.getCompanyName(), organization.getCompanyCode(),
                action, "ORGANIZATION", organization.getId(), organization.getCompanyName(), "SUCCESS", detail);
    }

    public List<Map<String, String>> latestSecurityOversight() {
        return accessAuditLogRepository.findTop50ByOrderByCreatedAtDesc()
                .stream()
                .map(this::toReportItem)
                .toList();
    }

    public List<Map<String, String>> latestSecurityOversight(String actorId) {
        User actor = userRepository.findById(actorId)
                .orElseThrow(() -> new ResourceNotFoundException("User account was not found."));
        if (actor.getRoles() != null && actor.getRoles().contains(Role.SUPER_ADMIN)) {
            return latestSecurityOversight();
        }
        String organizationId = normalize(actor.getOrganizationId(), null);
        if (organizationId == null) {
            return List.of();
        }
        return accessAuditLogRepository.findTop50ByOrganizationIdOrderByCreatedAtDesc(organizationId)
                .stream()
                .map(this::toReportItem)
                .toList();
    }

    private Map<String, String> toReportItem(AccessAuditLog log) {
        return Map.of(
                "title", "%s · %s".formatted(log.getAction(), normalize(log.getActorName(), normalize(log.getActorId(), "Unknown actor"))),
                "status", normalize(log.getDetails(), normalize(log.getOutcome(), "Recorded"))
        );
    }

    private void record(User actor, String action, String targetType, String targetId, String targetName, String outcome, String details) {
        record(actor, null, null, null, action, targetType, targetId, targetName, outcome, details);
    }

    private void record(
            User actor,
            String organizationId,
            String organizationName,
            String organizationCode,
            String action,
            String targetType,
            String targetId,
            String targetName,
            String outcome,
            String details
    ) {
        AccessAuditLog log = new AccessAuditLog();
        if (actor != null) {
            log.setActorId(actor.getId());
            log.setActorName(actor.getFullName());
            log.setActorRoles(actor.getRoles());
        }
        log.setOrganizationId(normalize(organizationId, actor != null ? actor.getOrganizationId() : null));
        log.setOrganizationName(normalize(organizationName, actor != null ? actor.getOrganizationName() : null));
        log.setOrganizationCode(normalize(organizationCode, actor != null ? actor.getOrganizationCode() : null));
        log.setAction(action);
        log.setTargetType(targetType);
        log.setTargetId(targetId);
        log.setTargetName(targetName);
        log.setOutcome(outcome);
        log.setDetails(details);
        accessAuditLogRepository.save(log);
    }

    private String renderRoles(Set<Role> roles) {
        if (roles == null || roles.isEmpty()) {
            return "no roles";
        }
        return roles.stream().map(Role::name).sorted().collect(Collectors.joining(", "));
    }

    private String normalize(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}
