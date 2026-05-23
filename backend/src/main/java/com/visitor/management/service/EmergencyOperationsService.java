package com.visitor.management.service;

import com.visitor.management.dto.EmergencyBroadcastRequest;
import com.visitor.management.dto.EmergencyEvacuationPersonResponse;
import com.visitor.management.dto.EmergencyEvacuationRegisterResponse;
import com.visitor.management.dto.EmergencyFlagRequest;
import com.visitor.management.dto.EmergencyIncidentResponse;
import com.visitor.management.dto.EmergencyLockdownRequest;
import com.visitor.management.dto.EmergencyPanicRequest;
import com.visitor.management.dto.EmergencyStateResponse;
import com.visitor.management.entity.EmployeeAttendanceLog;
import com.visitor.management.entity.EmployeeAttendanceState;
import com.visitor.management.entity.EmergencyIncident;
import com.visitor.management.entity.EmergencyIncidentSeverity;
import com.visitor.management.entity.EmergencyIncidentStatus;
import com.visitor.management.entity.EmergencyIncidentType;
import com.visitor.management.entity.EmergencyOperationalState;
import com.visitor.management.entity.NotificationType;
import com.visitor.management.entity.Role;
import com.visitor.management.entity.User;
import com.visitor.management.entity.Visitor;
import com.visitor.management.entity.VisitorStatus;
import com.visitor.management.entity.VisitorStatusHistoryEntry;
import com.visitor.management.exception.BadRequestException;
import com.visitor.management.exception.ResourceNotFoundException;
import com.visitor.management.exception.UnauthorizedException;
import com.visitor.management.repository.EmployeeAttendanceLogRepository;
import com.visitor.management.repository.EmergencyIncidentRepository;
import com.visitor.management.repository.EmergencyOperationalStateRepository;
import com.visitor.management.repository.UserRepository;
import com.visitor.management.repository.VisitorRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Stream;

@Service
public class EmergencyOperationsService {

    private static final Set<Role> EVERY_ORG_ROLE = Set.of(Role.ADMIN, Role.SECURITY_GUARD, Role.EMPLOYEE, Role.VISITOR);
    private static final Set<Role> OPERATIONS_ROLES = Set.of(Role.ADMIN, Role.SECURITY_GUARD);

    private final EmergencyOperationalStateRepository stateRepository;
    private final EmergencyIncidentRepository incidentRepository;
    private final UserRepository userRepository;
    private final VisitorRepository visitorRepository;
    private final EmployeeAttendanceLogRepository attendanceRepository;
    private final NotificationService notificationService;
    private final AccessAuditService accessAuditService;

    public EmergencyOperationsService(
            EmergencyOperationalStateRepository stateRepository,
            EmergencyIncidentRepository incidentRepository,
            UserRepository userRepository,
            VisitorRepository visitorRepository,
            EmployeeAttendanceLogRepository attendanceRepository,
            NotificationService notificationService,
            AccessAuditService accessAuditService
    ) {
        this.stateRepository = stateRepository;
        this.incidentRepository = incidentRepository;
        this.userRepository = userRepository;
        this.visitorRepository = visitorRepository;
        this.attendanceRepository = attendanceRepository;
        this.notificationService = notificationService;
        this.accessAuditService = accessAuditService;
    }

    public EmergencyStateResponse state(String actorId) {
        User actor = currentUser(actorId);
        EmergencyOperationalState state = findState(actor);
        return toStateResponse(state, actor);
    }

    public List<EmergencyIncidentResponse> feed(String actorId) {
        User actor = currentUser(actorId);
        List<EmergencyIncident> incidents = hasRole(actor, Role.SUPER_ADMIN)
                ? incidentRepository.findTop75ByOrderByCreatedAtDesc()
                : incidentRepository.findTop75ByOrganizationIdOrderByCreatedAtDesc(requiredOrganizationId(actor));
        return incidents.stream().map(this::toIncidentResponse).toList();
    }

    public EmergencyStateResponse startLockdown(EmergencyLockdownRequest request, String actorId) {
        User actor = currentUser(actorId);
        requireCoordinator(actor);
        if (!request.confirmOperationalOnly()) {
            throw new BadRequestException("Confirm this is an operational coordination lockdown, not physical access-control automation.");
        }

        Instant now = Instant.now();
        EmergencyOperationalState state = mutableState(actor);
        state.setLockdownActive(true);
        state.setLockdownReason(requiredTrim(request.reason(), "Lockdown reason is required."));
        state.setLockdownScope(defaultText(request.scope(), "Organization-wide"));
        state.setLockdownInitiatedById(actor.getId());
        state.setLockdownInitiatedByName(actor.getFullName());
        state.setLockdownStartedAt(now);
        state.setLockdownClearedAt(null);
        state.setLockdownClearedById(null);
        state.setLockdownClearedByName(null);
        state.setUpdatedAt(now);
        EmergencyOperationalState saved = stateRepository.save(state);

        EmergencyIncident incident = incident(
                actor,
                EmergencyIncidentType.LOCKDOWN_STARTED,
                EmergencyIncidentSeverity.CRITICAL,
                EmergencyIncidentStatus.ACTIVE,
                "Emergency lockdown initiated",
                saved.getLockdownReason(),
                saved.getLockdownScope(),
                null,
                null,
                null,
                "Visitor approvals and new check-ins are suspended for operational coordination."
        );
        incidentRepository.save(incident);
        accessAuditService.recordEmergencyAction(actor, "EMERGENCY_LOCKDOWN_STARTED", incident.getId(), saved.getLockdownScope(), "SUCCESS", saved.getLockdownReason());
        notifyRoles(actor, EVERY_ORG_ROLE, NotificationType.EMERGENCY_LOCKDOWN, "Emergency lockdown initiated", saved.getLockdownReason(), null);
        return toStateResponse(saved, actor);
    }

    public EmergencyStateResponse clearLockdown(EmergencyLockdownRequest request, String actorId) {
        User actor = currentUser(actorId);
        requireCoordinator(actor);
        EmergencyOperationalState state = mutableState(actor);
        if (!state.isLockdownActive()) {
            return toStateResponse(state, actor);
        }

        Instant now = Instant.now();
        String reason = requiredTrim(request.reason(), "Clearance reason is required.");
        state.setLockdownActive(false);
        state.setLockdownClearedById(actor.getId());
        state.setLockdownClearedByName(actor.getFullName());
        state.setLockdownClearedAt(now);
        state.setUpdatedAt(now);
        EmergencyOperationalState saved = stateRepository.save(state);

        EmergencyIncident incident = incident(
                actor,
                EmergencyIncidentType.LOCKDOWN_CLEARED,
                EmergencyIncidentSeverity.HIGH,
                EmergencyIncidentStatus.RESOLVED,
                "Emergency lockdown cleared",
                reason,
                saved.getLockdownScope(),
                null,
                null,
                null,
                "Visitor approvals and check-ins may resume after local operational review."
        );
        incident.setResolvedAt(now);
        incident.setResolvedById(actor.getId());
        incident.setResolvedByName(actor.getFullName());
        incidentRepository.save(incident);
        accessAuditService.recordEmergencyAction(actor, "EMERGENCY_LOCKDOWN_CLEARED", incident.getId(), saved.getLockdownScope(), "SUCCESS", reason);
        notifyRoles(actor, EVERY_ORG_ROLE, NotificationType.EMERGENCY_LOCKDOWN, "Emergency lockdown cleared", reason, null);
        return toStateResponse(saved, actor);
    }

    public EmergencyIncidentResponse triggerPanic(EmergencyPanicRequest request, String actorId) {
        User actor = currentUser(actorId);
        requireOperator(actor);
        if (!request.deliberate()) {
            throw new BadRequestException("Hold-to-confirm panic trigger was not completed.");
        }
        String checkpoint = defaultText(request.checkpoint(), "Unknown checkpoint");
        String note = defaultText(request.note(), "Immediate operator assistance requested.");
        EmergencyIncident incident = incident(
                actor,
                EmergencyIncidentType.PANIC_TRIGGERED,
                EmergencyIncidentSeverity.CRITICAL,
                EmergencyIncidentStatus.ACTIVE,
                "Panic alert triggered",
                "%s requested immediate assistance.".formatted(defaultText(actor.getFullName(), "Operator")),
                checkpoint,
                "USER",
                actor.getId(),
                actor.getFullName(),
                note
        );
        EmergencyIncident saved = incidentRepository.save(incident);
        accessAuditService.recordEmergencyAction(actor, "PANIC_TRIGGERED", saved.getId(), checkpoint, "SUCCESS", note);
        notifyRoles(actor, OPERATIONS_ROLES, NotificationType.EMERGENCY_PANIC, "Panic alert: " + checkpoint, note, null);
        return toIncidentResponse(saved);
    }

    public EmergencyIncidentResponse broadcast(EmergencyBroadcastRequest request, String actorId) {
        User actor = currentUser(actorId);
        requireCoordinator(actor);
        Instant now = Instant.now();
        EmergencyIncidentSeverity severity = request.severity() == null ? EmergencyIncidentSeverity.HIGH : request.severity();
        EmergencyIncidentType type = request.evacuation() ? EmergencyIncidentType.EVACUATION_STARTED : EmergencyIncidentType.EMERGENCY_BROADCAST;
        NotificationType notificationType = request.evacuation() ? NotificationType.EMERGENCY_EVACUATION : NotificationType.EMERGENCY_BROADCAST;
        String scope = defaultText(request.scope(), "Organization-wide");

        EmergencyOperationalState state = mutableState(actor);
        state.setLatestBroadcastTitle(requiredTrim(request.title(), "Broadcast title is required."));
        state.setLatestBroadcastMessage(requiredTrim(request.message(), "Broadcast message is required."));
        state.setLatestBroadcastSeverity(severity);
        state.setLatestBroadcastAt(now);
        if (request.evacuation()) {
            state.setEvacuationActive(true);
            state.setEvacuationScope(scope);
            state.setEvacuationStartedAt(now);
        }
        stateRepository.save(state);

        EmergencyIncident incident = incident(
                actor,
                type,
                severity,
                EmergencyIncidentStatus.ACTIVE,
                request.title(),
                request.message(),
                scope,
                null,
                null,
                null,
                request.evacuation() ? "Evacuation register should be monitored until all personnel are accounted for." : "Operational broadcast delivered in app and push channels."
        );
        EmergencyIncident saved = incidentRepository.save(incident);
        accessAuditService.recordEmergencyAction(actor, type.name(), saved.getId(), scope, "SUCCESS", request.message());
        notifyRoles(actor, EVERY_ORG_ROLE, notificationType, request.title(), request.message(), null);
        return toIncidentResponse(saved);
    }

    public EmergencyIncidentResponse flagVisitor(String visitorId, EmergencyFlagRequest request, String actorId) {
        User actor = currentUser(actorId);
        requireOperator(actor);
        Visitor visitor = visitorRepository.findById(visitorId)
                .orElseThrow(() -> new ResourceNotFoundException("Visitor was not found."));
        requireOrganizationAccess(actor, visitor.getOrganizationId());
        String note = requiredTrim(request.note(), "Security note is required.");
        int repeatCount = (int) Math.min(Integer.MAX_VALUE, incidentRepository.countByOrganizationIdAndSubjectTypeAndSubjectId(
                visitor.getOrganizationId(), "VISITOR", visitor.getId()) + 1);

        appendVisitorHistory(visitor, actor, "SUSPICIOUS_VISITOR_FLAGGED", note);
        visitor.setUpdatedAt(Instant.now());
        visitorRepository.save(visitor);

        EmergencyIncident incident = incident(
                actor,
                EmergencyIncidentType.SUSPICIOUS_VISITOR,
                EmergencyIncidentSeverity.HIGH,
                EmergencyIncidentStatus.ACTIVE,
                "Suspicious visitor flagged",
                "%s was flagged for security review.".formatted(visitor.getFullName()),
                defaultText(request.checkpoint(), "Visitor operation"),
                "VISITOR",
                visitor.getId(),
                visitor.getFullName(),
                note
        );
        incident.setRepeatCount(repeatCount);
        EmergencyIncident saved = incidentRepository.save(incident);
        accessAuditService.recordEmergencyAction(actor, "SUSPICIOUS_VISITOR_FLAGGED", saved.getId(), visitor.getFullName(), "FLAGGED", note);
        notifyRoles(actor, OPERATIONS_ROLES, NotificationType.SECURITY_SUSPICIOUS_ACTIVITY, "Suspicious visitor flagged", "%s: %s".formatted(visitor.getFullName(), note), visitor);
        return toIncidentResponse(saved);
    }

    public EmergencyIncidentResponse flagWorkforce(String userId, EmergencyFlagRequest request, String actorId) {
        User actor = currentUser(actorId);
        requireOperator(actor);
        User worker = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Workforce account was not found."));
        requireOrganizationAccess(actor, worker.getOrganizationId());
        String note = requiredTrim(request.note(), "Security note is required.");
        int repeatCount = (int) Math.min(Integer.MAX_VALUE, incidentRepository.countByOrganizationIdAndSubjectTypeAndSubjectId(
                worker.getOrganizationId(), "WORKFORCE", worker.getId()) + 1);

        EmergencyIncident incident = incident(
                actor,
                EmergencyIncidentType.SUSPICIOUS_WORKFORCE,
                EmergencyIncidentSeverity.HIGH,
                EmergencyIncidentStatus.ACTIVE,
                "Suspicious workforce activity",
                "%s was flagged for security review.".formatted(worker.getFullName()),
                defaultText(request.checkpoint(), "Workforce operation"),
                "WORKFORCE",
                worker.getId(),
                worker.getFullName(),
                note
        );
        incident.setRepeatCount(repeatCount);
        EmergencyIncident saved = incidentRepository.save(incident);
        accessAuditService.recordEmergencyAction(actor, "SUSPICIOUS_WORKFORCE_FLAGGED", saved.getId(), worker.getFullName(), "FLAGGED", note);
        notifyRoles(actor, OPERATIONS_ROLES, NotificationType.SECURITY_SUSPICIOUS_ACTIVITY, "Suspicious workforce activity", "%s: %s".formatted(worker.getFullName(), note), null);
        return toIncidentResponse(saved);
    }

    public EmergencyEvacuationRegisterResponse evacuationRegister(String actorId) {
        User actor = currentUser(actorId);
        List<Visitor> visitors = hasRole(actor, Role.SUPER_ADMIN)
                ? visitorRepository.findAllByStatusOrderByCheckInTimeDesc(VisitorStatus.CHECKED_IN)
                : visitorRepository.findAllByOrganizationIdAndStatusOrderByCheckInTimeDesc(requiredOrganizationId(actor), VisitorStatus.CHECKED_IN);
        List<EmployeeAttendanceLog> logs = hasRole(actor, Role.SUPER_ADMIN)
                ? attendanceRepository.findTop100ByOrderByCreatedAtDesc()
                : attendanceRepository.findTop100ByOrganizationIdOrderByCreatedAtDesc(requiredOrganizationId(actor));
        List<EmployeeAttendanceLog> workforce = logs.stream()
                .filter(log -> log.getState() == EmployeeAttendanceState.IN)
                .filter(this::hasNoCheckout)
                .toList();

        List<EmergencyEvacuationPersonResponse> visitorRows = visitors.stream()
                .map(visitor -> new EmergencyEvacuationPersonResponse(
                        visitor.getId(),
                        "VISITOR",
                        visitor.getFullName(),
                        visitor.getOrganizationName(),
                        visitor.getHostEmployeeDepartment(),
                        defaultText(visitor.getBadgeId(), "Visitor checkpoint"),
                        "UNACCOUNTED",
                        visitor.getCheckInTime()
                ))
                .toList();
        List<EmergencyEvacuationPersonResponse> workforceRows = workforce.stream()
                .map(log -> new EmergencyEvacuationPersonResponse(
                        log.getEmployeeUserId(),
                        "WORKFORCE",
                        log.getEmployeeName(),
                        log.getOrganizationName(),
                        log.getDepartment(),
                        defaultText(log.getSecurityGuardName(), "Workforce checkpoint"),
                        "UNACCOUNTED",
                        log.getCheckInTime()
                ))
                .toList();
        List<EmergencyEvacuationPersonResponse> unaccounted = Stream.concat(visitorRows.stream(), workforceRows.stream())
                .sorted(Comparator.comparing(EmergencyEvacuationPersonResponse::lastActivityAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();
        Map<String, Integer> counts = new LinkedHashMap<>();
        counts.put("visitorsInside", visitorRows.size());
        counts.put("workforceInside", workforceRows.size());
        counts.put("unaccounted", unaccounted.size());
        return new EmergencyEvacuationRegisterResponse(Instant.now(), counts, visitorRows, workforceRows, unaccounted);
    }

    public boolean isLockdownActiveForOrganization(String organizationId) {
        String normalized = trimToNull(organizationId);
        return normalized != null && stateRepository.findByOrganizationId(normalized)
                .map(EmergencyOperationalState::isLockdownActive)
                .orElse(false);
    }

    private EmergencyIncident incident(
            User actor,
            EmergencyIncidentType type,
            EmergencyIncidentSeverity severity,
            EmergencyIncidentStatus status,
            String title,
            String message,
            String checkpoint,
            String subjectType,
            String subjectId,
            String subjectName,
            String notes
    ) {
        EmergencyIncident incident = new EmergencyIncident();
        incident.setOrganizationId(actor.getOrganizationId());
        incident.setOrganizationName(actor.getOrganizationName());
        incident.setOrganizationCode(actor.getOrganizationCode());
        incident.setType(type);
        incident.setSeverity(severity);
        incident.setStatus(status);
        incident.setTitle(title);
        incident.setMessage(message);
        incident.setCheckpoint(checkpoint);
        incident.setSubjectType(subjectType);
        incident.setSubjectId(subjectId);
        incident.setSubjectName(subjectName);
        incident.setActorId(actor.getId());
        incident.setActorName(actor.getFullName());
        incident.setNotes(notes);
        incident.setRepeatCount(1);
        Instant now = Instant.now();
        incident.setCreatedAt(now);
        incident.setUpdatedAt(now);
        return incident;
    }

    private EmergencyOperationalState mutableState(User actor) {
        String organizationId = requiredOrganizationId(actor);
        EmergencyOperationalState state = stateRepository.findByOrganizationId(organizationId).orElseGet(EmergencyOperationalState::new);
        state.setOrganizationId(organizationId);
        state.setOrganizationName(actor.getOrganizationName());
        state.setOrganizationCode(actor.getOrganizationCode());
        if (state.getCreatedAt() == null) {
            state.setCreatedAt(Instant.now());
        }
        return state;
    }

    private EmergencyOperationalState findState(User actor) {
        String organizationId = trimToNull(actor.getOrganizationId());
        if (organizationId == null) {
            return new EmergencyOperationalState();
        }
        return stateRepository.findByOrganizationId(organizationId).orElseGet(() -> {
            EmergencyOperationalState state = new EmergencyOperationalState();
            state.setOrganizationId(actor.getOrganizationId());
            state.setOrganizationName(actor.getOrganizationName());
            state.setOrganizationCode(actor.getOrganizationCode());
            return state;
        });
    }

    private EmergencyStateResponse toStateResponse(EmergencyOperationalState state, User actor) {
        boolean lockdown = state != null && state.isLockdownActive();
        return new EmergencyStateResponse(
                lockdown,
                state == null ? null : state.getLockdownReason(),
                state == null ? null : state.getLockdownScope(),
                state == null ? null : state.getLockdownInitiatedByName(),
                state == null ? null : state.getLockdownStartedAt(),
                lockdown,
                lockdown,
                state != null && state.isEvacuationActive(),
                state == null ? null : state.getEvacuationScope(),
                state == null ? null : state.getEvacuationStartedAt(),
                state == null ? null : state.getLatestBroadcastTitle(),
                state == null ? null : state.getLatestBroadcastMessage(),
                state == null ? null : state.getLatestBroadcastSeverity(),
                state == null ? null : state.getLatestBroadcastAt(),
                state == null || state.getOrganizationId() == null ? actor.getOrganizationId() : state.getOrganizationId(),
                state == null || state.getOrganizationName() == null ? actor.getOrganizationName() : state.getOrganizationName(),
                state == null ? null : state.getUpdatedAt()
        );
    }

    private EmergencyIncidentResponse toIncidentResponse(EmergencyIncident incident) {
        return new EmergencyIncidentResponse(
                incident.getId(),
                incident.getType(),
                incident.getSeverity(),
                incident.getStatus(),
                incident.getTitle(),
                incident.getMessage(),
                incident.getCheckpoint(),
                incident.getSubjectType(),
                incident.getSubjectId(),
                incident.getSubjectName(),
                incident.getActorName(),
                incident.getNotes(),
                incident.getRepeatCount(),
                incident.getCreatedAt(),
                incident.getResolvedAt()
        );
    }

    private void appendVisitorHistory(Visitor visitor, User actor, String action, String note) {
        VisitorStatusHistoryEntry entry = new VisitorStatusHistoryEntry();
        entry.setAction(action);
        entry.setStatus(visitor.getStatus());
        entry.setActorId(actor.getId());
        entry.setNote(note);
        entry.setTimestamp(Instant.now());
        visitor.getStatusHistory().add(entry);
    }

    private void notifyRoles(User actor, Set<Role> roles, NotificationType type, String title, String message, Visitor visitor) {
        notificationService.notifyOrganizationRoles(
                actor.getOrganizationId(),
                roles,
                null,
                type,
                title,
                message,
                visitor,
                null,
                actor.getFullName()
        );
    }

    private boolean hasNoCheckout(EmployeeAttendanceLog log) {
        return log.getCheckOutTime() == null || (log.getCheckInTime() != null && log.getCheckInTime().isAfter(log.getCheckOutTime()));
    }

    private User currentUser(String actorId) {
        return userRepository.findById(actorId)
                .orElseThrow(() -> new ResourceNotFoundException("User account was not found."));
    }

    private String requiredOrganizationId(User actor) {
        String organizationId = trimToNull(actor.getOrganizationId());
        if (organizationId == null) {
            throw new UnauthorizedException("Emergency operations require an organization-scoped account.");
        }
        return organizationId;
    }

    private void requireOrganizationAccess(User actor, String organizationId) {
        if (hasRole(actor, Role.SUPER_ADMIN)) {
            return;
        }
        if (!Objects.equals(requiredOrganizationId(actor), trimToNull(organizationId))) {
            throw new UnauthorizedException("Record is outside the active organization.");
        }
    }

    private void requireCoordinator(User actor) {
        if (hasRole(actor, Role.ADMIN) || hasRole(actor, Role.SUPER_ADMIN)) {
            return;
        }
        throw new UnauthorizedException("Emergency coordination controls require an admin role.");
    }

    private void requireOperator(User actor) {
        if (hasRole(actor, Role.ADMIN) || hasRole(actor, Role.SUPER_ADMIN) || hasRole(actor, Role.SECURITY_GUARD)) {
            return;
        }
        throw new UnauthorizedException("Emergency incident operations require admin or security access.");
    }

    private boolean hasRole(User user, Role role) {
        return user.getRoles() != null && user.getRoles().contains(role);
    }

    private String requiredTrim(String value, String message) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            throw new BadRequestException(message);
        }
        return normalized;
    }

    private String defaultText(String value, String fallback) {
        String normalized = trimToNull(value);
        return normalized == null ? fallback : normalized;
    }

    private String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
