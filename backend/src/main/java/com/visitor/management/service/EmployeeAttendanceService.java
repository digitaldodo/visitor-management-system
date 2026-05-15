package com.visitor.management.service;

import com.visitor.management.dto.EmployeeAttendanceResponse;
import com.visitor.management.dto.EmployeeAttendanceScanResponse;
import com.visitor.management.dto.EmployeeBadgeResponse;
import com.visitor.management.dto.EmployeeDirectoryResponse;
import com.visitor.management.entity.AccountStatus;
import com.visitor.management.entity.EmployeeAttendanceLog;
import com.visitor.management.entity.EmployeeAttendanceState;
import com.visitor.management.entity.EmployeeAttendanceStatus;
import com.visitor.management.entity.Role;
import com.visitor.management.entity.User;
import com.visitor.management.exception.BadRequestException;
import com.visitor.management.exception.ResourceNotFoundException;
import com.visitor.management.repository.EmployeeAttendanceLogRepository;
import com.visitor.management.repository.UserRepository;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
public class EmployeeAttendanceService {

    private static final String QR_PREFIX = "ACCESSFLOW_EMPLOYEE";
    private static final Set<String> DEFAULT_WORKING_DAYS = Set.of("MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY");
    private static final SecureRandom RANDOM = new SecureRandom();

    private final UserRepository userRepository;
    private final EmployeeAttendanceLogRepository attendanceRepository;
    private final QrCodeService qrCodeService;
    private final TokenService tokenService;
    private final AccessAuditService accessAuditService;

    public EmployeeAttendanceService(
            UserRepository userRepository,
            EmployeeAttendanceLogRepository attendanceRepository,
            QrCodeService qrCodeService,
            TokenService tokenService,
            AccessAuditService accessAuditService
    ) {
        this.userRepository = userRepository;
        this.attendanceRepository = attendanceRepository;
        this.qrCodeService = qrCodeService;
        this.tokenService = tokenService;
        this.accessAuditService = accessAuditService;
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
        if (user.getWorkingDays() == null || user.getWorkingDays().isEmpty()) {
            user.setWorkingDays(new HashSet<>(DEFAULT_WORKING_DAYS));
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
        if (user.getGracePeriodMinutes() == null) {
            user.setGracePeriodMinutes(10);
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
        provisionAndPersistIfNeeded(employee);
        return toBadgeResponse(employee);
    }

    public EmployeeBadgeResponse ownBadge(String actorId) {
        User employee = currentUser(actorId);
        if (!employee.getRoles().contains(Role.EMPLOYEE)) {
            throw new BadRequestException("Only employee accounts have workforce badges.");
        }
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
        User employee = resolveEmployeeQr(qrPayload);
        requireSameOrganizationOrSuperAdmin(guard, employee);
        validateEmployeeAccess(employee);
        boolean eligible = isShiftEligible(employee, Instant.now());
        EmployeeAttendanceLog log = currentlyIn(employee)
                ? checkOut(employee.getId(), securityGuardId, false, null)
                : checkIn(employee.getId(), securityGuardId, false, null);
        String action = log.getState() == EmployeeAttendanceState.IN ? "CHECKED_IN" : "CHECKED_OUT";
        return new EmployeeAttendanceScanResponse(
                true,
                action,
                action.equals("CHECKED_IN") ? "Employee checked in" : "Employee checked out",
                "%s was %s using the static employee QR.".formatted(employee.getFullName(), action.equals("CHECKED_IN") ? "checked in" : "checked out"),
                eligible ? "Shift timing accepted." : "Shift exception recorded for workforce review.",
                eligible,
                log.getState() == EmployeeAttendanceState.IN,
                toDirectoryResponse(employee),
                toAttendanceResponse(log)
        );
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
        evaluateCheckIn(log, employee, now, zoneId);
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
        evaluateCheckOut(log, employee, now, zoneId);
        EmployeeAttendanceLog saved = attendanceRepository.save(log);
        accessAuditService.recordEmployeeAttendance(guard, employee, saved.getLastAction(),
                manual ? "Manual employee check-out override: " + reason.trim() : "Static employee QR check-out recorded.");
        return saved;
    }

    public Map<String, Object> analytics(String actorId) {
        User actor = currentUser(actorId);
        String organizationId = actor.getRoles().contains(Role.SUPER_ADMIN) ? null : requiredOrganizationId(actor);
        ZoneId zoneId = resolveZoneId(actor);
        LocalDate today = LocalDate.now(zoneId);
        List<User> employees = organizationId == null
                ? userRepository.findAllByRolesContaining(Role.EMPLOYEE)
                : userRepository.findAllByOrganizationIdAndRolesContaining(organizationId, Role.EMPLOYEE);
        List<EmployeeAttendanceLog> todayLogs = organizationId == null
                ? attendanceRepository.findAll().stream().filter(log -> today.equals(log.getAttendanceDate())).toList()
                : attendanceRepository.findAllByOrganizationIdAndAttendanceDate(organizationId, today);

        long activeEmployees = employees.stream().filter(this::employeeEnabled).count();
        long checkedIn = todayLogs.stream().filter(log -> log.getState() == EmployeeAttendanceState.IN).count();
        long late = todayLogs.stream().filter(log -> hasFlag(log, EmployeeAttendanceStatus.LATE_ENTRY)).count();
        long overtime = todayLogs.stream().filter(log -> hasFlag(log, EmployeeAttendanceStatus.OVERTIME)).count();
        long violations = todayLogs.stream().filter(log -> hasFlag(log, EmployeeAttendanceStatus.SHIFT_VIOLATION) || hasFlag(log, EmployeeAttendanceStatus.EARLY_EXIT)).count();
        long expectedToday = employees.stream().filter(this::employeeEnabled).filter(employee -> isWorkingDay(employee, today)).count();
        long absent = Math.max(0, expectedToday - todayLogs.stream().map(EmployeeAttendanceLog::getEmployeeUserId).distinct().count());

        return Map.of(
                "timezone", zoneId.getId(),
                "widgets", List.of(
                        Map.of("label", "Active employees", "value", activeEmployees, "note", "Workforce identities with reusable badges"),
                        Map.of("label", "Checked in now", "value", checkedIn, "note", "Employees currently inside"),
                        Map.of("label", "Late today", "value", late, "note", "Arrivals after grace period"),
                        Map.of("label", "Overtime today", "value", overtime, "note", "Employees beyond shift end"),
                        Map.of("label", "Absent today", "value", absent, "note", "Expected employees without attendance")
                ),
                "departmentTrends", departmentTrends(todayLogs),
                "shiftCompliance", Map.of(
                        "present", todayLogs.size(),
                        "late", late,
                        "overtime", overtime,
                        "violations", violations,
                        "absent", absent
                ),
                "recentLogs", todayLogs.stream()
                        .sorted(Comparator.comparing(EmployeeAttendanceLog::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                        .limit(20)
                        .map(this::toAttendanceResponse)
                        .toList()
        );
    }

    private void evaluateCheckIn(EmployeeAttendanceLog log, User employee, Instant at, ZoneId zoneId) {
        Set<EmployeeAttendanceStatus> flags = new HashSet<>();
        LocalDateTime local = LocalDateTime.ofInstant(at, zoneId);
        if (!isWorkingDay(employee, local.toLocalDate())) {
            flags.add(EmployeeAttendanceStatus.SHIFT_VIOLATION);
        }
        LocalTime shiftStart = parseTime(employee.getShiftStartTime(), LocalTime.of(9, 0));
        int grace = employee.getGracePeriodMinutes() == null ? 0 : Math.max(0, employee.getGracePeriodMinutes());
        if (local.toLocalTime().isAfter(shiftStart.plusMinutes(grace))) {
            flags.add(EmployeeAttendanceStatus.LATE_ENTRY);
        }
        if (flags.isEmpty()) {
            flags.add(EmployeeAttendanceStatus.PRESENT);
        }
        log.setFlags(flags);
        log.setStatus(primaryStatus(flags));
    }

    private void evaluateCheckOut(EmployeeAttendanceLog log, User employee, Instant at, ZoneId zoneId) {
        Set<EmployeeAttendanceStatus> flags = new HashSet<>(log.getFlags() == null ? Set.of() : log.getFlags());
        LocalDateTime local = LocalDateTime.ofInstant(at, zoneId);
        LocalTime shiftEnd = parseTime(employee.getShiftEndTime(), LocalTime.of(18, 0));
        if (local.toLocalTime().isBefore(shiftEnd)) {
            flags.add(EmployeeAttendanceStatus.EARLY_EXIT);
        }
        if (local.toLocalTime().isAfter(shiftEnd)) {
            flags.add(EmployeeAttendanceStatus.OVERTIME);
            LocalDateTime shiftEndDateTime = LocalDateTime.of(local.toLocalDate(), shiftEnd);
            log.setOvertimeMinutes(Math.max(0, Duration.between(shiftEndDateTime, local).toMinutes()));
        }
        if (log.getCheckInTime() != null) {
            log.setWorkedMinutes(Math.max(0, Duration.between(log.getCheckInTime(), at).toMinutes()));
        }
        if (flags.isEmpty()) {
            flags.add(EmployeeAttendanceStatus.PRESENT);
        }
        log.setFlags(flags);
        log.setStatus(primaryStatus(flags));
    }

    private EmployeeAttendanceStatus primaryStatus(Set<EmployeeAttendanceStatus> flags) {
        if (flags.contains(EmployeeAttendanceStatus.SHIFT_VIOLATION)) {
            return EmployeeAttendanceStatus.SHIFT_VIOLATION;
        }
        if (flags.contains(EmployeeAttendanceStatus.LATE_ENTRY)) {
            return EmployeeAttendanceStatus.LATE_ENTRY;
        }
        if (flags.contains(EmployeeAttendanceStatus.EARLY_EXIT)) {
            return EmployeeAttendanceStatus.EARLY_EXIT;
        }
        if (flags.contains(EmployeeAttendanceStatus.OVERTIME)) {
            return EmployeeAttendanceStatus.OVERTIME;
        }
        return EmployeeAttendanceStatus.PRESENT;
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
        log.setGracePeriodMinutes(employee.getGracePeriodMinutes());
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
                employee.getWorkingDays(),
                employee.getGracePeriodMinutes(),
                employee.getOvertimePolicy(),
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
                employee.getWorkingDays(),
                employee.getGracePeriodMinutes(),
                employee.getOvertimePolicy(),
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
                log.getGracePeriodMinutes(),
                log.getState(),
                log.getStatus(),
                log.getFlags(),
                log.getCheckInTime(),
                log.getCheckOutTime(),
                log.getWorkedMinutes(),
                log.getOvertimeMinutes(),
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

    private boolean isShiftEligible(User employee, Instant instant) {
        ZoneId zoneId = resolveZoneId(employee);
        LocalDateTime local = LocalDateTime.ofInstant(instant, zoneId);
        if (!isWorkingDay(employee, local.toLocalDate())) {
            return false;
        }
        LocalTime shiftStart = parseTime(employee.getShiftStartTime(), LocalTime.of(9, 0));
        LocalTime shiftEnd = parseTime(employee.getShiftEndTime(), LocalTime.of(18, 0));
        LocalTime lowerBound = shiftStart.minusHours(4);
        LocalTime upperBound = shiftEnd.plusHours(6);
        LocalTime current = local.toLocalTime();
        return !current.isBefore(lowerBound) && !current.isAfter(upperBound);
    }

    private boolean isWorkingDay(User employee, LocalDate date) {
        Set<String> days = employee.getWorkingDays() == null || employee.getWorkingDays().isEmpty()
                ? DEFAULT_WORKING_DAYS
                : employee.getWorkingDays();
        return days.contains(date.getDayOfWeek().name());
    }

    private Map<String, Long> departmentTrends(List<EmployeeAttendanceLog> logs) {
        Map<String, Long> trends = new LinkedHashMap<>();
        for (EmployeeAttendanceLog log : logs) {
            String key = trimToNull(log.getDepartment()) == null ? "Unassigned" : log.getDepartment();
            trends.put(key, trends.getOrDefault(key, 0L) + 1L);
        }
        return trends;
    }

    private boolean hasFlag(EmployeeAttendanceLog log, EmployeeAttendanceStatus status) {
        return log.getFlags() != null && log.getFlags().contains(status);
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
            throw new BadRequestException("A reason is required for manual attendance overrides.");
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
