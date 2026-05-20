package com.visitor.management.service;

import com.visitor.management.dto.OperationalEventBatchResponse;
import com.visitor.management.dto.OperationalEventResponse;
import com.visitor.management.entity.AccessAuditLog;
import com.visitor.management.entity.Role;
import com.visitor.management.entity.User;
import com.visitor.management.exception.ResourceNotFoundException;
import com.visitor.management.repository.AccessAuditLogRepository;
import com.visitor.management.repository.UserRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class OperationalEventStreamService {

    private final AccessAuditLogRepository accessAuditLogRepository;
    private final UserRepository userRepository;

    public OperationalEventStreamService(AccessAuditLogRepository accessAuditLogRepository, UserRepository userRepository) {
        this.accessAuditLogRepository = accessAuditLogRepository;
        this.userRepository = userRepository;
    }

    public OperationalEventBatchResponse events(String actorId, String cursor, int requestedLimit) {
        User actor = userRepository.findById(actorId)
                .orElseThrow(() -> new ResourceNotFoundException("User account was not found."));
        int limit = Math.max(1, Math.min(requestedLimit <= 0 ? 80 : requestedLimit, 100));
        Instant since = parseCursor(cursor);
        List<AccessAuditLog> logs = scopedLogs(actor, since).stream()
                .sorted(Comparator.comparing(AccessAuditLog::getCreatedAt, Comparator.nullsLast(Comparator.naturalOrder())))
                .limit(limit)
                .toList();
        List<OperationalEventResponse> events = logs.stream().map(this::toEvent).toList();
        String nextCursor = events.isEmpty()
                ? (cursor == null || cursor.isBlank() ? Instant.now().toString() : cursor)
                : events.getLast().occurredAt().toString();
        return new OperationalEventBatchResponse(nextCursor, Instant.now(), events.isEmpty(), events);
    }

    private List<AccessAuditLog> scopedLogs(User actor, Instant since) {
        boolean superAdmin = actor.getRoles() != null && actor.getRoles().contains(Role.SUPER_ADMIN);
        if (since == null) {
            List<AccessAuditLog> latest = superAdmin
                    ? accessAuditLogRepository.findTop100ByOrderByCreatedAtDesc()
                    : accessAuditLogRepository.findTop100ByOrganizationIdOrderByCreatedAtDesc(actor.getOrganizationId());
            return latest.stream()
                    .sorted(Comparator.comparing(AccessAuditLog::getCreatedAt, Comparator.nullsLast(Comparator.naturalOrder())))
                    .toList();
        }
        return superAdmin
                ? accessAuditLogRepository.findTop100ByCreatedAtAfterOrderByCreatedAtAsc(since)
                : accessAuditLogRepository.findTop100ByOrganizationIdAndCreatedAtAfterOrderByCreatedAtAsc(actor.getOrganizationId(), since);
    }

    private OperationalEventResponse toEvent(AccessAuditLog log) {
        String action = normalize(log.getAction(), "OPERATIONAL_EVENT");
        String category = category(action, log.getTargetType());
        String severity = severity(action, log.getOutcome());
        Instant occurredAt = log.getCreatedAt() == null ? Instant.now() : log.getCreatedAt();
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("outcome", log.getOutcome());
        metadata.put("organizationCode", log.getOrganizationCode());
        metadata.put("source", "access-audit");
        return new OperationalEventResponse(
                normalize(log.getId(), "%s:%s".formatted(action, occurredAt)),
                action,
                category,
                severity,
                log.getOrganizationId(),
                log.getOrganizationName(),
                log.getActorId(),
                log.getActorName(),
                log.getTargetType(),
                log.getTargetId(),
                log.getTargetName(),
                title(action, log),
                log.getDetails(),
                occurredAt,
                metadata
        );
    }

    private Instant parseCursor(String cursor) {
        if (cursor == null || cursor.isBlank()) {
            return null;
        }
        try {
            return Instant.parse(cursor.trim());
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private String category(String action, String targetType) {
        String normalized = "%s %s".formatted(action, normalize(targetType, "")).toUpperCase(Locale.ROOT);
        if (normalized.contains("EMERGENCY") || normalized.contains("INCIDENT") || normalized.contains("ESCALAT")) {
            return "incident";
        }
        if (normalized.contains("WORKFORCE") || normalized.contains("EMPLOYEE")) {
            return "workforce";
        }
        if (normalized.contains("APPROV") || normalized.contains("REJECT")) {
            return "approval";
        }
        if (normalized.contains("VISITOR") || normalized.contains("BADGE") || normalized.contains("CHECK")) {
            return "visitor";
        }
        if (normalized.contains("REPORT_EXPORT")) {
            return "audit";
        }
        return "audit";
    }

    private String severity(String action, String outcome) {
        String normalized = "%s %s".formatted(action, normalize(outcome, "")).toUpperCase(Locale.ROOT);
        if (normalized.contains("PANIC") || normalized.contains("LOCKDOWN") || normalized.contains("CRITICAL")) {
            return "emergency";
        }
        if (normalized.contains("DENIED") || normalized.contains("REJECT") || normalized.contains("SUSPEND") || normalized.contains("REVOK")) {
            return "security";
        }
        if (normalized.contains("APPROV")) {
            return "approval";
        }
        return "info";
    }

    private String title(String action, AccessAuditLog log) {
        String target = normalize(log.getTargetName(), normalize(log.getTargetId(), "operational record"));
        return "%s · %s".formatted(action.replace('_', ' '), target);
    }

    private String normalize(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}
