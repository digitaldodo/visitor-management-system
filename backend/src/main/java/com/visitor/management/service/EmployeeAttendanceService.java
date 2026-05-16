package com.visitor.management.service;

import com.mongodb.client.MongoCollection;
import com.visitor.management.dto.EmployeeAttendanceResponse;
import com.visitor.management.dto.EmployeeAttendanceScanResponse;
import com.visitor.management.dto.EmployeeBadgeResponse;
import com.visitor.management.dto.EmployeeDirectoryResponse;
import com.visitor.management.entity.AccountStatus;
import com.visitor.management.entity.EmployeeAttendanceLog;
import com.visitor.management.entity.EmployeeAttendanceState;
import com.visitor.management.entity.EmployeeAttendanceStatus;
import com.visitor.management.entity.NotificationType;
import com.visitor.management.entity.Role;
import com.visitor.management.entity.User;
import com.visitor.management.exception.BadRequestException;
import com.visitor.management.exception.ResourceNotFoundException;
import com.visitor.management.repository.EmployeeAttendanceLogRepository;
import com.visitor.management.repository.UserRepository;
import org.bson.Document;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
public class EmployeeAttendanceService {

    private static final Logger log = LoggerFactory.getLogger(EmployeeAttendanceService.class);
    private static final String QR_PREFIX = "ACCESSFLOW_EMPLOYEE";
    private static final String ATTENDANCE_COLLECTION = "employee_attendance_logs";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final UserRepository userRepository;
    private final EmployeeAttendanceLogRepository attendanceRepository;
    private final MongoTemplate mongoTemplate;
    private final QrCodeService qrCodeService;
    private final TokenService tokenService;
    private final AccessAuditService accessAuditService;
    private final NotificationService notificationService;

    public EmployeeAttendanceService(
            UserRepository userRepository,
            EmployeeAttendanceLogRepository attendanceRepository,
            MongoTemplate mongoTemplate,
            QrCodeService qrCodeService,
            TokenService tokenService,
            AccessAuditService accessAuditService,
            NotificationService notificationService
    ) {
        this.userRepository = userRepository;
        this.attendanceRepository = attendanceRepository;
        this.mongoTemplate = mongoTemplate;
        this.qrCodeService = qrCodeService;
        this.tokenService = tokenService;
        this.accessAuditService = accessAuditService;
        this.notificationService = notificationService;
    }

    public void provisionEmployeeCredential(User user) {
        if (user == null || user.getRoles() == null || !user.getRoles().contains(Role.EMPLOYEE)) {
            return;
        }
        if (trimToNull(user.getEmployeeId()) == null) {
            user.setEmployeeId(generateEmployeeId(user));
        }
        if (trimToNull(user.getEmployeeQrToken()) == null) {
            user.setEmployeeQrToken(tokenService.generateOpaqueToken());
            user.setEmployeeQrIssuedAt(Instant.now());
            user.setEmployeeQrRevokedAt(null);
        }
        if (trimToNull(user.getShiftName()) == null) {
            user.setShiftName("General Shift");
        }
        if (trimToNull(user.getShiftStartTime()) == null) {
            user.setShiftStartTime("09:00");
        }
        if (trimToNull(user.getShiftEndTime()) == null) {
            user.setShiftEndTime("18:00");
        }
    }

    public void activateEmployeeCredential(User user) {
        provisionEmployeeCredential(user);
        if (trimToNull(user.getEmployeeQrToken()) == null) {
            user.setEmployeeQrToken(tokenService.generateOpaqueToken());
        }
        user.setEmployeeQrIssuedAt(Instant.now());
        user.setEmployeeQrRevokedAt(null);
    }

    public void deactivateEmployeeCredential(User user) {
        if (user == null || user.getRoles() == null || !user.getRoles().contains(Role.EMPLOYEE)) {
            return;
        }
        if (trimToNull(user.getEmployeeQrToken()) != null && user.getEmployeeQrRevokedAt() == null) {
            user.setEmployeeQrRevokedAt(Instant.now());
        }
    }

    public List<EmployeeDirectoryResponse> searchEmployees(String query, String actorId) {
        User actor = currentUser(actorId);
        String normalizedQuery = trimToNull(query);
        List<User> employees = actor.getRoles().contains(Role.SUPER_ADMIN)
                ? userRepository.findAllByRolesContaining(Role.EMPLOYEE)
                : userRepository.findAllByOrganizationIdAndRolesContaining(requiredOrganizationId(actor), Role.EMPLOYEE);
        return employees.stream()
                .filter(employee -> normalizedQuery == null || employeeMatches(employee, normalizedQuery))
                .sorted(Comparator.comparing(user -> String.valueOf(user.getFullName()), String.CASE_INSENSITIVE_ORDER))
                .limit(50)
                .map(this::toDirectoryResponse)
                .toList();
    }

    public EmployeeBadgeResponse badgeForEmployee(String employeeUserId, String actorId) {
        User actor = currentUser(actorId);
        User employee = requireEmployee(employeeUserId);
        requireSameOrganizationOrSuperAdmin(actor, employee);
        validateEmployeeAccess(employee);
        provisionAndPersistIfNeeded(employee);
        return toBadgeResponse(employee);
    }

    public EmployeeBadgeResponse ownBadge(String actorId) {
        User employee = currentUser(actorId);
        if (!employee.getRoles().contains(Role.EMPLOYEE)) {
            throw new BadRequestException("Only employee accounts have workforce badges.");
        }
        validateEmployeeAccess(employee);
        provisionAndPersistIfNeeded(employee);
        return toBadgeResponse(employee);
    }

    public List<EmployeeAttendanceResponse> logs(String actorId) {
        User actor = currentUser(actorId);
        List<EmployeeAttendanceLog> logs = actor.getRoles().contains(Role.SUPER_ADMIN)
                ? attendanceRepository.findTop100ByOrderByCreatedAtDesc()
                : attendanceRepository.findTop100ByOrganizationIdOrderByCreatedAtDesc(requiredOrganizationId(actor));
        return logs.stream().map(this::toAttendanceResponse).toList();
    }

    public List<EmployeeAttendanceResponse> ownLogs(String actorId) {
        return attendanceRepository.findTop60ByEmployeeUserIdOrderByCreatedAtDesc(actorId)
                .stream()
                .map(this::toAttendanceResponse)
                .toList();
    }

    public EmployeeAttendanceScanResponse scan(String qrPayload, String securityGuardId) {
        User guard = currentUser(securityGuardId);
        try {
            User employee = resolveEmployeeQr(qrPayload);
            requireSameOrganizationOrSuperAdmin(guard, employee);
            validateEmployeeAccess(employee);
            EmployeeAttendanceLog log = currentlyIn(employee)
                    ? checkOut(employee.getId(), securityGuardId, false, null)
                    : checkIn(employee.getId(), securityGuardId, false, null);
            String action = log.getState() == EmployeeAttendanceState.IN ? "CHECKED_IN" : "CHECKED_OUT";
            return new EmployeeAttendanceScanResponse(
                    true,
                    action,
                    action.equals("CHECKED_IN") ? "Employee checked in" : "Employee checked out",
                    "%s was %s using the static employee QR.".formatted(employee.getFullName(), action.equals("CHECKED_IN") ? "checked in" : "checked out"),
                    "Presence updated for access operations.",
                    true,
                    log.getState() == EmployeeAttendanceState.IN,
                    toDirectoryResponse(employee),
                    toAttendanceResponse(log)
            );
        } catch (BadRequestException ex) {
            notifyCredentialIssue(guard, ex.getMessage());
            throw ex;
        }
    }

    public EmployeeAttendanceLog checkIn(String employeeUserId, String securityGuardId, boolean manual, String reason) {
        User guard = currentUser(securityGuardId);
        User employee = requireEmployee(employeeUserId);
        requireSameOrganizationOrSuperAdmin(guard, employee);
        validateEmployeeAccess(employee);
        if (manual) {
            requireReason(reason);
        }
        if (currentlyIn(employee)) {
            throw new BadRequestException("Employee is already checked in.");
        }

        Instant now = Instant.now();
        ZoneId zoneId = resolveZoneId(employee);
        LocalDate date = LocalDateTime.ofInstant(now, zoneId).toLocalDate();
        EmployeeAttendanceLog log = attendanceRepository
                .findTopByEmployeeUserIdAndAttendanceDateOrderByCreatedAtDesc(employee.getId(), date)
                .filter(existing -> existing.getState() == EmployeeAttendanceState.OUT && existing.getCheckOutTime() == null)
                .orElseGet(EmployeeAttendanceLog::new);
        populateEmployeeSnapshot(log, employee, date, zoneId);
        log.setState(EmployeeAttendanceState.IN);
        log.setCheckInTime(now);
        log.setManualCheckIn(manual);
        log.setOverrideReason(manual ? reason.trim() : log.getOverrideReason());
        log.setSecurityGuardId(guard.getId());
        log.setSecurityGuardName(guard.getFullName());
        log.setLastAction(manual ? "MANUAL_CHECK_IN" : "QR_CHECK_IN");
        markCheckInPresence(log, employee, now, zoneId);
        EmployeeAttendanceLog saved = attendanceRepository.save(log);
        accessAuditService.recordEmployeeAttendance(guard, employee, saved.getLastAction(),
                manual ? "Manual employee check-in override: " + reason.trim() : "Static employee QR check-in recorded.");
        return saved;
    }

    public EmployeeAttendanceLog checkOut(String employeeUserId, String securityGuardId, boolean manual, String reason) {
        User guard = currentUser(securityGuardId);
        User employee = requireEmployee(employeeUserId);
        requireSameOrganizationOrSuperAdmin(guard, employee);
        validateEmployeeAccess(employee);
        if (manual) {
            requireReason(reason);
        }
        EmployeeAttendanceLog log = attendanceRepository
                .findTopByEmployeeUserIdAndStateOrderByCheckInTimeDesc(employee.getId(), EmployeeAttendanceState.IN)
                .orElseThrow(() -> new BadRequestException("Employee is not currently checked in."));

        Instant now = Instant.now();
        ZoneId zoneId = resolveZoneId(employee);
        log.setState(EmployeeAttendanceState.OUT);
        log.setCheckOutTime(now);
        log.setManualCheckOut(manual);
        log.setOverrideReason(manual ? reason.trim() : log.getOverrideReason());
        log.setSecurityGuardId(guard.getId());
        log.setSecurityGuardName(guard.getFullName());
        log.setLastAction(manual ? "MANUAL_CHECK_OUT" : "QR_CHECK_OUT");
        markCheckOutPresence(log);
        EmployeeAttendanceLog saved = attendanceRepository.save(log);
        accessAuditService.recordEmployeeAttendance(guard, employee, saved.getLastAction(),
                manual ? "Manual employee check-out override: " + reason.trim() : "Static employee QR check-out recorded.");
        return saved;
    }

    public Map<String, Object> analytics(String actorId) {
        try {
            User actor = currentUser(actorId);
            String organizationId = hasRole(actor, Role.SUPER_ADMIN) ? null : requiredOrganizationId(actor);
            ZoneId zoneId = resolveZoneId(actor);
            return attendanceAnalyticsFromRawDocuments(organizationId, zoneId);
        } catch (RuntimeException ex) {
            log.warn("Workforce attendance analytics failed; returning safe fallback. actorPresent={} cause={}: {}",
                    actorId != null, ex.getClass().getSimpleName(), safeMessage(ex));
            return workforceAnalyticsFallback(ZoneOffset.UTC);
        }
    }

    private Map<String, Object> attendanceAnalyticsFromRawDocuments(String organizationId, ZoneId zoneId) {
        LocalDate today = LocalDate.now(zoneId);
        Instant todayStart = today.atStartOfDay(zoneId).toInstant();
        Instant todayEnd = today.plusDays(1).atStartOfDay(zoneId).toInstant();
        List<Document> todayLogs = new ArrayList<>();
        for (Document document : attendanceCollection()
                .find(attendanceTodayFilter(organizationId, today, todayStart, todayEnd))
                .sort(new Document("createdAt", -1))
                .limit(100)) {
            if (document != null) {
                todayLogs.add(document);
            }
        }

        long checkedIn = todayLogs.stream().filter(log -> "IN".equals(normalizedAttendanceState(log))).count();
        long todayCheckIns = todayLogs.stream().filter(log -> valuePresent(log.get("checkInTime"))).count();
        long late = todayLogs.stream().filter(this::isLate).count();

        return Map.of(
                "timezone", zoneId.getId(),
                "widgets", workforceWidgets(checkedIn, todayCheckIns, late, todayLogs.size()),
                "recentLogs", todayLogs.stream()
                        .limit(20)
                        .map(this::toAttendanceAnalyticsRow)
                        .toList()
        );
    }

    private List<Map<String, Object>> workforceWidgets(long checkedIn, long todayCheckIns, long late, long activityLogs) {
        return List.of(
                Map.of("label", "Currently inside", "value", checkedIn, "note", "Employees physically present"),
                Map.of("label", "Today check-ins", "value", todayCheckIns, "note", "Badge scans and assisted entries"),
                Map.of("label", "Late arrivals", "value", late, "note", "Optional shift-start signal"),
                Map.of("label", "Activity logs", "value", activityLogs, "note", "Presence events recorded today")
        );
    }

    private Map<String, Object> workforceAnalyticsFallback(ZoneId zoneId) {
        return Map.of(
                "timezone", zoneId.getId(),
                "widgets", workforceWidgets(0, 0, 0, 0),
                "recentLogs", List.of()
        );
    }

    private MongoCollection<Document> attendanceCollection() {
        return mongoTemplate.getCollection(ATTENDANCE_COLLECTION);
    }

    private Document attendanceTodayFilter(String organizationId, LocalDate today, Instant todayStart, Instant todayEnd) {
        List<Document> dateMatches = List.of(
                new Document("attendanceDate", today.toString()),
                new Document("attendanceDate", Date.from(today.atStartOfDay(ZoneOffset.UTC).toInstant())),
                dateRangeFilter("checkInTime", todayStart, todayEnd),
                dateRangeFilter("createdAt", todayStart, todayEnd)
        );
        Document filter = new Document("$or", dateMatches);
        if (trimToNull(organizationId) != null) {
            filter.append("organizationId", organizationId);
        }
        return filter;
    }

    private Document dateRangeFilter(String field, Instant start, Instant end) {
        return new Document(field, new Document("$type", "date")
                .append("$gte", Date.from(start))
                .append("$lt", Date.from(end)));
    }

    private Map<String, Object> toAttendanceAnalyticsRow(Document document) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", stringValue(document.get("_id"), "attendance-log"));
        row.put("employeeUserId", stringValue(document.get("employeeUserId"), ""));
        row.put("employeeId", stringValue(document.get("employeeId"), ""));
        row.put("employeeName", stringValue(document.get("employeeName"), "Unknown employee"));
        row.put("department", stringValue(document.get("department"), ""));
        row.put("designation", stringValue(document.get("designation"), ""));
        row.put("employeeType", stringValue(document.get("employeeType"), ""));
        row.put("organizationId", stringValue(document.get("organizationId"), ""));
        row.put("organizationName", stringValue(document.get("organizationName"), ""));
        row.put("organizationCode", stringValue(document.get("organizationCode"), ""));
        row.put("timezone", stringValue(document.get("timezone"), ""));
        row.put("attendanceDate", stringValue(document.get("attendanceDate"), ""));
        row.put("shiftName", stringValue(document.get("shiftName"), "Shift pending"));
        row.put("shiftStartTime", stringValue(document.get("shiftStartTime"), ""));
        row.put("shiftEndTime", stringValue(document.get("shiftEndTime"), ""));
        row.put("state", normalizedAttendanceState(document));
        row.put("status", normalizedAttendanceStatus(document));
        row.put("late", isLate(document));
        row.put("checkInTime", document.get("checkInTime"));
        row.put("checkOutTime", document.get("checkOutTime"));
        row.put("securityGuardId", stringValue(document.get("securityGuardId"), ""));
        row.put("securityGuardName", stringValue(document.get("securityGuardName"), "System"));
        row.put("lastAction", stringValue(document.get("lastAction"), ""));
        row.put("createdAt", document.get("createdAt"));
        row.put("updatedAt", document.get("updatedAt"));
        return row;
    }

    private void markCheckInPresence(EmployeeAttendanceLog log, User employee, Instant at, ZoneId zoneId) {
        LocalDateTime local = LocalDateTime.ofInstant(at, zoneId);
        LocalTime shiftStart = parseTime(employee.getShiftStartTime(), LocalTime.of(9, 0));
        boolean late = local.toLocalTime().isAfter(shiftStart);
        log.setFlags(late ? Set.of(EmployeeAttendanceStatus.LATE) : Set.of());
        log.setStatus(late ? EmployeeAttendanceStatus.LATE : EmployeeAttendanceStatus.INSIDE);
    }

    private void markCheckOutPresence(EmployeeAttendanceLog log) {
        log.setStatus(EmployeeAttendanceStatus.OUTSIDE);
    }

    private void populateEmployeeSnapshot(EmployeeAttendanceLog log, User employee, LocalDate date, ZoneId zoneId) {
        log.setEmployeeUserId(employee.getId());
        log.setEmployeeId(employee.getEmployeeId());
        log.setEmployeeName(employee.getFullName());
        log.setDepartment(employee.getDepartment());
        log.setDesignation(employee.getDesignation());
        log.setEmployeeType(employee.getEmployeeType());
        log.setOrganizationId(employee.getOrganizationId());
        log.setOrganizationName(employee.getOrganizationName());
        log.setOrganizationCode(employee.getOrganizationCode());
        log.setTimezone(zoneId.getId());
        log.setAttendanceDate(date);
        log.setShiftName(employee.getShiftName());
        log.setShiftStartTime(employee.getShiftStartTime());
        log.setShiftEndTime(employee.getShiftEndTime());
    }

    private EmployeeBadgeResponse toBadgeResponse(User employee) {
        String payload = qrPayload(employee);
        return new EmployeeBadgeResponse(
                employee.getId(),
                employee.getEmployeeId(),
                employee.getFullName(),
                employee.getEmail(),
                employee.getDepartment(),
                employee.getDesignation(),
                employee.getEmployeeType(),
                employee.getEmployeePhotoUrl(),
                employee.getOrganizationName(),
                employee.getOrganizationCode(),
                employee.getOrganizationTimezone(),
                employee.getShiftName(),
                employee.getShiftStartTime(),
                employee.getShiftEndTime(),
                payload,
                qrCodeService.dataUri(payload),
                employee.getEmployeeQrIssuedAt(),
                employeeEnabled(employee)
        );
    }

    private EmployeeDirectoryResponse toDirectoryResponse(User employee) {
        return new EmployeeDirectoryResponse(
                employee.getId(),
                employee.getEmployeeId(),
                employee.getFullName(),
                employee.getEmail(),
                employee.getDepartment(),
                employee.getDesignation(),
                employee.getEmployeeType(),
                employee.getOrganizationId(),
                employee.getOrganizationName(),
                employee.getOrganizationCode(),
                employee.getShiftName(),
                employee.getShiftStartTime(),
                employee.getShiftEndTime(),
                employee.isActive(),
                employee.getAccountStatus(),
                currentlyIn(employee)
        );
    }

    public EmployeeAttendanceResponse toResponse(EmployeeAttendanceLog log) {
        return toAttendanceResponse(log);
    }

    private EmployeeAttendanceResponse toAttendanceResponse(EmployeeAttendanceLog log) {
        return new EmployeeAttendanceResponse(
                log.getId(),
                log.getEmployeeUserId(),
                log.getEmployeeId(),
                log.getEmployeeName(),
                log.getDepartment(),
                log.getDesignation(),
                log.getEmployeeType(),
                log.getOrganizationId(),
                log.getOrganizationName(),
                log.getOrganizationCode(),
                log.getTimezone(),
                log.getAttendanceDate(),
                log.getShiftName(),
                log.getShiftStartTime(),
                log.getShiftEndTime(),
                log.getState(),
                presenceStatus(log),
                isLate(log),
                log.getCheckInTime(),
                log.getCheckOutTime(),
                log.isManualCheckIn(),
                log.isManualCheckOut(),
                log.getOverrideReason(),
                log.getSecurityGuardId(),
                log.getSecurityGuardName(),
                log.getLastAction(),
                log.getCreatedAt(),
                log.getUpdatedAt()
        );
    }

    private User resolveEmployeeQr(String payload) {
        String token = parseQrToken(payload);
        User employee = userRepository.findByEmployeeQrToken(token)
                .orElseThrow(() -> new BadRequestException("Employee QR credential was not recognized."));
        if (employee.getEmployeeQrRevokedAt() != null) {
            throw new BadRequestException("Employee QR credential has been revoked.");
        }
        return employee;
    }

    private String parseQrToken(String payload) {
        String value = trimToNull(payload);
        if (value == null) {
            throw new BadRequestException("Employee QR payload is required.");
        }
        if (value.startsWith(QR_PREFIX + ":")) {
            String[] parts = value.split(":", 4);
            if (parts.length == 4) {
                return parts[3];
            }
        }
        int tokenIndex = value.indexOf("employeeToken=");
        if (tokenIndex >= 0) {
            String token = value.substring(tokenIndex + "employeeToken=".length()).split("[&#?]", 2)[0];
            return trimToNull(token);
        }
        throw new BadRequestException("This is not an employee attendance QR.");
    }

    private String qrPayload(User employee) {
        return "%s:%s:%s:%s".formatted(
                QR_PREFIX,
                employee.getOrganizationId(),
                employee.getEmployeeId(),
                employee.getEmployeeQrToken()
        );
    }

    private void provisionAndPersistIfNeeded(User employee) {
        String previousQr = employee.getEmployeeQrToken();
        String previousEmployeeId = employee.getEmployeeId();
        provisionEmployeeCredential(employee);
        if (previousQr == null || previousEmployeeId == null) {
            userRepository.save(employee);
        }
    }

    private boolean currentlyIn(User employee) {
        return employee.getId() != null
                && attendanceRepository.findTopByEmployeeUserIdAndStateOrderByCheckInTimeDesc(employee.getId(), EmployeeAttendanceState.IN).isPresent();
    }

    private void validateEmployeeAccess(User employee) {
        if (!employee.getRoles().contains(Role.EMPLOYEE)) {
            throw new BadRequestException("QR credential does not belong to an employee account.");
        }
        if (!employeeEnabled(employee)) {
            throw new BadRequestException("Employee account is disabled or suspended.");
        }
    }

    private boolean employeeEnabled(User employee) {
        return employee.isActive()
                && employee.getAccountStatus() == AccountStatus.ACTIVE
                && employee.getEmployeeQrRevokedAt() == null;
    }

    private void notifyCredentialIssue(User guard, String detail) {
        String organizationId = trimToNull(guard.getOrganizationId());
        if (organizationId == null) {
            return;
        }
        notificationService.notifyOrganizationRoles(
                organizationId,
                Set.of(Role.SECURITY_GUARD, Role.ADMIN),
                null,
                NotificationType.WORKFORCE_CREDENTIAL_DISABLED,
                "Invalid workforce credential",
                detail == null || detail.isBlank() ? "A workforce QR credential could not be validated." : detail,
                null,
                "/pages/security/#alerts",
                guard.getFullName()
        );
    }

    private EmployeeAttendanceStatus presenceStatus(EmployeeAttendanceLog log) {
        if (log.getState() == EmployeeAttendanceState.IN) {
            return isLate(log) ? EmployeeAttendanceStatus.LATE : EmployeeAttendanceStatus.INSIDE;
        }
        return EmployeeAttendanceStatus.OUTSIDE;
    }

    private boolean isLate(EmployeeAttendanceLog log) {
        return log.getStatus() == EmployeeAttendanceStatus.LATE
                || log.getStatus() == EmployeeAttendanceStatus.LATE_ENTRY
                || (log.getFlags() != null && (log.getFlags().contains(EmployeeAttendanceStatus.LATE) || log.getFlags().contains(EmployeeAttendanceStatus.LATE_ENTRY)));
    }

    private boolean isLate(Document log) {
        String status = normalizeEnumValue(log.get("status"));
        if ("LATE".equals(status) || "LATE_ENTRY".equals(status)) {
            return true;
        }
        Object flags = log.get("flags");
        if (flags instanceof Iterable<?> iterable) {
            for (Object flag : iterable) {
                String value = normalizeEnumValue(flag);
                if ("LATE".equals(value) || "LATE_ENTRY".equals(value)) {
                    return true;
                }
            }
        }
        return false;
    }

    private String normalizedAttendanceState(Document log) {
        String state = normalizeEnumValue(log.get("state"));
        return switch (state) {
            case "IN", "INSIDE", "CHECKED_IN" -> "IN";
            case "OUT", "OUTSIDE", "CHECKED_OUT" -> "OUT";
            default -> valuePresent(log.get("checkInTime")) && !valuePresent(log.get("checkOutTime")) ? "IN" : "OUT";
        };
    }

    private String normalizedAttendanceStatus(Document log) {
        String status = normalizeEnumValue(log.get("status"));
        if ("LATE".equals(status) || "LATE_ENTRY".equals(status)) {
            return "LATE";
        }
        if ("INSIDE".equals(status) || "IN".equals(status) || "CHECKED_IN".equals(status)) {
            return "INSIDE";
        }
        if ("OUTSIDE".equals(status) || "OUT".equals(status) || "CHECKED_OUT".equals(status)) {
            return "OUTSIDE";
        }
        return "IN".equals(normalizedAttendanceState(log)) ? "INSIDE" : "OUTSIDE";
    }

    private String normalizeEnumValue(Object value) {
        return String.valueOf(value == null ? "" : value)
                .trim()
                .replace('-', '_')
                .replace(' ', '_')
                .toUpperCase(Locale.ROOT);
    }

    private boolean valuePresent(Object value) {
        return value != null && (!(value instanceof String text) || !text.isBlank());
    }

    private boolean hasRole(User user, Role role) {
        return user != null && user.getRoles() != null && user.getRoles().contains(role);
    }

    private String stringValue(Object value, String fallback) {
        if (value == null) {
            return fallback;
        }
        String text = String.valueOf(value).trim();
        return text.isBlank() ? fallback : text;
    }

    private String safeMessage(RuntimeException ex) {
        String message = ex.getMessage();
        return message == null || message.isBlank() ? "no detail" : message;
    }

    private boolean employeeMatches(User employee, String query) {
        String value = query.toLowerCase(Locale.ROOT);
        List<String> fields = new ArrayList<>();
        fields.add(employee.getFullName());
        fields.add(employee.getEmail());
        fields.add(employee.getEmployeeId());
        fields.add(employee.getDepartment());
        fields.add(employee.getDesignation());
        fields.add(employee.getEmployeeType());
        return fields.stream().anyMatch(field -> field != null && field.toLowerCase(Locale.ROOT).contains(value));
    }

    private User requireEmployee(String employeeUserId) {
        User employee = userRepository.findById(employeeUserId)
                .orElseThrow(() -> new ResourceNotFoundException("Employee account was not found."));
        if (employee.getRoles() == null || !employee.getRoles().contains(Role.EMPLOYEE)) {
            throw new ResourceNotFoundException("Employee account was not found.");
        }
        return employee;
    }

    private User currentUser(String actorId) {
        return userRepository.findById(actorId)
                .orElseThrow(() -> new ResourceNotFoundException("User account was not found."));
    }

    private void requireSameOrganizationOrSuperAdmin(User actor, User employee) {
        if (actor.getRoles().contains(Role.SUPER_ADMIN)) {
            return;
        }
        if (!requiredOrganizationId(actor).equals(employee.getOrganizationId())) {
            throw new ResourceNotFoundException("Employee account was not found.");
        }
    }

    private String requiredOrganizationId(User user) {
        String organizationId = trimToNull(user.getOrganizationId());
        if (organizationId == null) {
            throw new BadRequestException("Your account is not assigned to an organization.");
        }
        return organizationId;
    }

    private void requireReason(String reason) {
        if (trimToNull(reason) == null || reason.trim().length() < 4) {
            throw new BadRequestException("A reason is required for manual workforce presence overrides.");
        }
    }

    private LocalTime parseTime(String value, LocalTime fallback) {
        try {
            return value == null || value.isBlank() ? fallback : LocalTime.parse(value);
        } catch (DateTimeParseException ex) {
            return fallback;
        }
    }

    private ZoneId resolveZoneId(User user) {
        String timezone = trimToNull(user.getOrganizationTimezone());
        try {
            return timezone == null ? ZoneOffset.UTC : ZoneId.of(timezone);
        } catch (RuntimeException ex) {
            return ZoneOffset.UTC;
        }
    }

    private String generateEmployeeId(User user) {
        String prefix = trimToNull(user.getOrganizationCode()) == null ? "EMP" : user.getOrganizationCode().replaceAll("[^A-Za-z0-9]", "").toUpperCase(Locale.ROOT);
        return "%s-%06d".formatted(prefix.length() > 8 ? prefix.substring(0, 8) : prefix, RANDOM.nextInt(1_000_000));
    }

    private String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
