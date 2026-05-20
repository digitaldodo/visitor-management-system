package com.visitor.management.service;

import com.visitor.management.dto.OperationalReportExportResponse;
import com.visitor.management.entity.AccessAuditLog;
import com.visitor.management.entity.EmployeeAttendanceLog;
import com.visitor.management.entity.EmergencyIncident;
import com.visitor.management.entity.Role;
import com.visitor.management.entity.User;
import com.visitor.management.entity.Visitor;
import com.visitor.management.exception.ResourceNotFoundException;
import com.visitor.management.repository.AccessAuditLogRepository;
import com.visitor.management.repository.EmployeeAttendanceLogRepository;
import com.visitor.management.repository.EmergencyIncidentRepository;
import com.visitor.management.repository.UserRepository;
import com.visitor.management.repository.VisitorRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Service
public class OperationalReportExportService {

    private final UserRepository userRepository;
    private final VisitorRepository visitorRepository;
    private final EmployeeAttendanceLogRepository employeeAttendanceLogRepository;
    private final EmergencyIncidentRepository emergencyIncidentRepository;
    private final AccessAuditLogRepository accessAuditLogRepository;
    private final AccessAuditService accessAuditService;

    public OperationalReportExportService(
            UserRepository userRepository,
            VisitorRepository visitorRepository,
            EmployeeAttendanceLogRepository employeeAttendanceLogRepository,
            EmergencyIncidentRepository emergencyIncidentRepository,
            AccessAuditLogRepository accessAuditLogRepository,
            AccessAuditService accessAuditService
    ) {
        this.userRepository = userRepository;
        this.visitorRepository = visitorRepository;
        this.employeeAttendanceLogRepository = employeeAttendanceLogRepository;
        this.emergencyIncidentRepository = emergencyIncidentRepository;
        this.accessAuditLogRepository = accessAuditLogRepository;
        this.accessAuditService = accessAuditService;
    }

    public OperationalReportExportResponse export(String actorId, String reportType, String format) {
        User actor = userRepository.findById(actorId)
                .orElseThrow(() -> new ResourceNotFoundException("User account was not found."));
        String normalizedType = normalizeType(reportType);
        String normalizedFormat = normalizeFormat(format);
        if (!canExport(actor, normalizedType)) {
            throw new ResourceNotFoundException("Report export is not available for this workspace.");
        }

        List<Map<String, Object>> rows = rows(actor, normalizedType);
        List<Map<String, String>> columns = columns(normalizedType);
        Instant generatedAt = Instant.now();
        accessAuditService.recordReportExport(
                actor,
                normalizedType,
                normalizedFormat,
                actor.getOrganizationId(),
                actor.getOrganizationName(),
                actor.getOrganizationCode(),
                rows.size()
        );
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("rowCount", rows.size());
        summary.put("format", normalizedFormat);
        summary.put("scope", actor.getRoles() != null && actor.getRoles().contains(Role.SUPER_ADMIN) ? "PLATFORM" : "ORGANIZATION");
        summary.put("auditSafe", true);

        return new OperationalReportExportResponse(
                UUID.randomUUID().toString(),
                normalizedType,
                normalizedFormat,
                title(normalizedType),
                actor.getOrganizationId(),
                actor.getOrganizationName(),
                actor.getFullName(),
                generatedAt,
                columns,
                rows,
                summary
        );
    }

    private boolean canExport(User actor, String reportType) {
        if (actor.getRoles() == null) {
            return false;
        }
        if (actor.getRoles().contains(Role.SUPER_ADMIN)) {
            return true;
        }
        if (actor.getRoles().contains(Role.ADMIN)) {
            return true;
        }
        if (actor.getRoles().contains(Role.SECURITY_GUARD)) {
            return List.of("incident-report", "checkpoint-activity", "operational-summary", "denied-entry-report").contains(reportType);
        }
        return false;
    }

    private List<Map<String, Object>> rows(User actor, String reportType) {
        return switch (reportType) {
            case "workforce-activity" -> attendanceRows(actor);
            case "incident-report", "security-incident-summary" -> incidentRows(actor);
            case "operational-audit-log", "operational-summary", "checkpoint-activity" -> auditRows(actor);
            case "denied-entry-report" -> visitorRows(actor).stream()
                    .filter(row -> String.valueOf(row.get("status")).toUpperCase(Locale.ROOT).contains("REJECT"))
                    .toList();
            default -> visitorRows(actor);
        };
    }

    private List<Map<String, Object>> visitorRows(User actor) {
        List<Visitor> visitors = isSuperAdmin(actor)
                ? visitorRepository.findTop200ByOrderByCreatedAtDesc()
                : visitorRepository.findTop200ByOrganizationIdOrderByCreatedAtDesc(actor.getOrganizationId());
        return visitors.stream().map(visitor -> row(
                "id", visitor.getId(),
                "name", visitor.getFullName(),
                "company", visitor.getCompanyName(),
                "host", visitor.getHostEmployee(),
                "status", visitor.getStatus(),
                "badge", visitor.getBadgeId(),
                "checkIn", visitor.getCheckInTime(),
                "checkOut", visitor.getCheckOutTime(),
                "createdAt", visitor.getCreatedAt()
        )).toList();
    }

    private List<Map<String, Object>> attendanceRows(User actor) {
        List<EmployeeAttendanceLog> logs = isSuperAdmin(actor)
                ? employeeAttendanceLogRepository.findTop100ByOrderByCreatedAtDesc()
                : employeeAttendanceLogRepository.findTop100ByOrganizationIdOrderByCreatedAtDesc(actor.getOrganizationId());
        return logs.stream().map(log -> row(
                "id", log.getId(),
                "employee", log.getEmployeeName(),
                "employeeId", log.getEmployeeId(),
                "department", log.getDepartment(),
                "status", log.getStatus(),
                "lastAction", log.getLastAction(),
                "checkIn", log.getCheckInTime(),
                "checkOut", log.getCheckOutTime(),
                "guard", log.getSecurityGuardName()
        )).toList();
    }

    private List<Map<String, Object>> incidentRows(User actor) {
        List<EmergencyIncident> incidents = isSuperAdmin(actor)
                ? emergencyIncidentRepository.findTop75ByOrderByCreatedAtDesc()
                : emergencyIncidentRepository.findTop75ByOrganizationIdOrderByCreatedAtDesc(actor.getOrganizationId());
        return incidents.stream().map(incident -> row(
                "id", incident.getId(),
                "type", incident.getType(),
                "severity", incident.getSeverity(),
                "status", incident.getStatus(),
                "title", incident.getTitle(),
                "subject", incident.getSubjectName(),
                "checkpoint", incident.getCheckpoint(),
                "actor", incident.getActorName(),
                "createdAt", incident.getCreatedAt()
        )).toList();
    }

    private List<Map<String, Object>> auditRows(User actor) {
        List<AccessAuditLog> logs = isSuperAdmin(actor)
                ? accessAuditLogRepository.findTop100ByOrderByCreatedAtDesc()
                : accessAuditLogRepository.findTop100ByOrganizationIdOrderByCreatedAtDesc(actor.getOrganizationId());
        return logs.stream().map(log -> row(
                "id", log.getId(),
                "action", log.getAction(),
                "actor", log.getActorName(),
                "targetType", log.getTargetType(),
                "target", log.getTargetName(),
                "outcome", log.getOutcome(),
                "details", log.getDetails(),
                "createdAt", log.getCreatedAt()
        )).toList();
    }

    private List<Map<String, String>> columns(String reportType) {
        List<String> keys = switch (reportType) {
            case "workforce-activity" -> List.of("employee", "employeeId", "department", "status", "lastAction", "checkIn", "checkOut", "guard");
            case "incident-report", "security-incident-summary" -> List.of("type", "severity", "status", "title", "subject", "checkpoint", "actor", "createdAt");
            case "operational-audit-log", "operational-summary", "checkpoint-activity" -> List.of("action", "actor", "targetType", "target", "outcome", "details", "createdAt");
            default -> List.of("name", "company", "host", "status", "badge", "checkIn", "checkOut", "createdAt");
        };
        return keys.stream().map(key -> Map.of("key", key, "label", label(key))).toList();
    }

    private Map<String, Object> row(Object... values) {
        Map<String, Object> row = new LinkedHashMap<>();
        for (int index = 0; index + 1 < values.length; index += 2) {
            row.put(String.valueOf(values[index]), values[index + 1]);
        }
        return row;
    }

    private boolean isSuperAdmin(User actor) {
        return actor.getRoles() != null && actor.getRoles().contains(Role.SUPER_ADMIN);
    }

    private String normalizeType(String value) {
        String normalized = String.valueOf(value == null ? "" : value).trim().toLowerCase(Locale.ROOT).replace('_', '-');
        if (normalized.isBlank()) {
            return "visitor-register";
        }
        return normalized;
    }

    private String normalizeFormat(String value) {
        String normalized = String.valueOf(value == null ? "" : value).trim().toUpperCase(Locale.ROOT);
        return "PDF".equals(normalized) ? "PDF" : "CSV";
    }

    private String title(String reportType) {
        return switch (reportType) {
            case "workforce-activity" -> "Workforce Activity Report";
            case "incident-report" -> "Security Incident Report";
            case "security-incident-summary" -> "Security Incident Summary";
            case "operational-audit-log" -> "Operational Audit Log";
            case "operational-summary" -> "Operational Summary";
            case "checkpoint-activity" -> "Checkpoint Activity Report";
            case "denied-entry-report" -> "Denied Entry Report";
            default -> "Visitor Register";
        };
    }

    private String label(String key) {
        if (key == null || key.isBlank()) {
            return "Field";
        }
        String spaced = key.replaceAll("([a-z])([A-Z])", "$1 $2").replace('-', ' ');
        return spaced.substring(0, 1).toUpperCase(Locale.ROOT) + spaced.substring(1);
    }
}
