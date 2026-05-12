package com.visitor.management.service;

import com.visitor.management.entity.AccessAuditLog;
import com.visitor.management.entity.Organization;
import com.visitor.management.entity.Role;
import com.visitor.management.entity.User;
import com.visitor.management.repository.AccessAuditLogRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class AccessAuditService {

    private final AccessAuditLogRepository accessAuditLogRepository;

    public AccessAuditService(AccessAuditLogRepository accessAuditLogRepository) {
        this.accessAuditLogRepository = accessAuditLogRepository;
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

    public void recordRoleChanged(User actor, User targetUser, Set<Role> previousRoles, Set<Role> currentRoles) {
        record(actor, targetUser.getOrganizationId(), targetUser.getOrganizationName(), targetUser.getOrganizationCode(),
                "ROLE_CHANGED", "USER_ACCOUNT", targetUser.getId(), targetUser.getFullName(), "SUCCESS",
                "Updated roles from %s to %s.".formatted(renderRoles(previousRoles), renderRoles(currentRoles)));
    }

    public void recordAccountStateChanged(User actor, User targetUser, String action, String detail) {
        record(actor, targetUser.getOrganizationId(), targetUser.getOrganizationName(), targetUser.getOrganizationCode(),
                action, "USER_ACCOUNT", targetUser.getId(), targetUser.getFullName(), "SUCCESS", detail);
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
                .map(log -> Map.of(
                        "title", "%s · %s".formatted(log.getAction(), normalize(log.getActorName(), normalize(log.getActorId(), "Unknown actor"))),
                        "status", normalize(log.getDetails(), normalize(log.getOutcome(), "Recorded"))
                ))
                .toList();
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
