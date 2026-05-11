package com.visitor.management.service;

import com.visitor.management.dto.PageResponse;
import com.visitor.management.dto.ApprovalDecisionRequest;
import com.visitor.management.dto.EmployeeDirectoryEntryResponse;
import com.visitor.management.dto.PreApprovalRequest;
import com.visitor.management.dto.QrVerificationResponse;
import com.visitor.management.dto.SearchRequest;
import com.visitor.management.dto.SecurityMonitoringResponse;
import com.visitor.management.dto.VisitorCreateRequest;
import com.visitor.management.dto.VisitorHistorySummaryResponse;
import com.visitor.management.dto.VisitorPassResponse;
import com.visitor.management.dto.VisitorResponse;
import com.visitor.management.dto.VisitorStatusHistoryResponse;
import com.visitor.management.dto.VisitorUpdateRequest;
import com.visitor.management.dto.VisitorVisitRequest;
import com.visitor.management.config.AppProperties;
import com.visitor.management.entity.Organization;
import com.visitor.management.entity.Role;
import com.visitor.management.entity.VisitorAuditLog;
import com.visitor.management.entity.User;
import com.visitor.management.entity.Visitor;
import com.visitor.management.entity.VisitorStatus;
import com.visitor.management.entity.VisitorStatusHistoryEntry;
import com.visitor.management.exception.BadRequestException;
import com.visitor.management.exception.ConflictException;
import com.visitor.management.exception.ResourceNotFoundException;
import com.visitor.management.repository.VisitorAuditLogRepository;
import com.visitor.management.repository.UserRepository;
import com.visitor.management.repository.VisitorRepository;
import com.visitor.management.security.JwtService;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;

import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
public class VisitorService {

    private static final String QR_PAYLOAD_PREFIX = "AFVP:";
    private static final long PASS_VALID_HOURS = 12;
    private static final long MIN_VISIT_WINDOW_MINUTES = 15;
    private static final long MAX_VISIT_WINDOW_HOURS = 24;

    private static final Set<String> SORT_FIELDS = Set.of(
            "createdAt",
            "updatedAt",
            "fullName",
            "companyName",
            "hostEmployee",
            "checkInTime",
            "checkOutTime",
            "scheduledStartTime",
            "scheduledEndTime",
            "status"
    );

    private final VisitorRepository visitorRepository;
    private final UserRepository userRepository;
    private final VisitorAuditLogRepository visitorAuditLogRepository;
    private final MongoTemplate mongoTemplate;
    private final PaginationService paginationService;
    private final JwtService jwtService;
    private final QrCodeService qrCodeService;
    private final AppProperties appProperties;
    private final VisitorNotificationService visitorNotificationService;
    private final OrganizationService organizationService;

    public VisitorService(
            VisitorRepository visitorRepository,
            UserRepository userRepository,
            VisitorAuditLogRepository visitorAuditLogRepository,
            MongoTemplate mongoTemplate,
            PaginationService paginationService,
            JwtService jwtService,
            QrCodeService qrCodeService,
            AppProperties appProperties,
            VisitorNotificationService visitorNotificationService,
            OrganizationService organizationService
    ) {
        this.visitorRepository = visitorRepository;
        this.userRepository = userRepository;
        this.visitorAuditLogRepository = visitorAuditLogRepository;
        this.mongoTemplate = mongoTemplate;
        this.paginationService = paginationService;
        this.jwtService = jwtService;
        this.qrCodeService = qrCodeService;
        this.appProperties = appProperties;
        this.visitorNotificationService = visitorNotificationService;
        this.organizationService = organizationService;
    }

    public VisitorResponse create(VisitorCreateRequest request) {
        return create(request, null);
    }

    @CacheEvict(value = {"adminAnalytics", "statusSummary"}, allEntries = true)
    public VisitorResponse createForVisitorAccount(VisitorVisitRequest request, User account) {
        Instant now = Instant.now();
        Organization organization = account.getOrganizationId() != null
                ? organizationService.requireActive(account.getOrganizationId())
                : organizationService.resolveRequired(request.companyCode(), request.companyName());
        Visitor visitor = new Visitor();
        visitor.setFullName(requiredTrim(account.getFullName(), "Account name is required."));
        visitor.setPhone(requiredTrim(request.phone() != null ? request.phone() : account.getPhone(), "Phone is required."));
        visitor.setEmail(account.getEmail());
        applyOrganization(visitor, organization);
        visitor.setPurposeOfVisit(requiredTrim(request.purposeOfVisit(), "Purpose of visit is required."));
        visitor.setHostEmployeeId(resolveHostEmployeeId(request.hostEmployeeId(), request.hostEmployee(), null, visitor.getOrganizationId()));
        visitor.setHostEmployee(resolveHostEmployeeName(request.hostEmployee(), visitor.getHostEmployeeId()));
        visitor.setHostEmployeeDepartment(resolveHostDepartment(visitor.getHostEmployeeId()));
        visitor.setPhotoUrl(trimToNull(request.photoUrl()));
        visitor.setPhotoPublicId(trimToNull(request.photoPublicId()));
        visitor.setStatus(VisitorStatus.PENDING);
        visitor.setApprovalExpiresAt(now.plusSeconds(appProperties.getVisitors().getPendingApprovalTtlMinutes() * 60));
        visitor.setCreatedAt(now);
        visitor.setUpdatedAt(now);
        enforceActiveVisitorRules(visitor);
        addHistory(visitor, VisitorStatus.PENDING, "SELF_SERVICE_REQUEST", account.getId(), "Visitor submitted an access request.", now);
        Visitor saved = visitorRepository.save(visitor);
        audit(saved.getId(), null, VisitorStatus.PENDING, "SELF_SERVICE_REQUEST", account.getId(), "Visitor submitted an access request.", now);
        visitorNotificationService.visitorApprovalRequested(saved);
        return toResponse(saved);
    }

    public List<VisitorResponse> visitsForVisitorAccount(User account) {
        List<Visitor> visits = account.getOrganizationId() == null
                ? visitorRepository.findAllByEmailIgnoreCaseOrderByCreatedAtDesc(account.getEmail())
                : visitorRepository.findAllByEmailIgnoreCaseAndOrganizationIdOrderByCreatedAtDesc(account.getEmail(), account.getOrganizationId());
        return visits
                .stream()
                .map(this::toResponse)
                .toList();
    }

    public VisitorPassResponse passForVisitorAccount(String id, User account) {
        Visitor visitor = find(id);
        if (visitor.getEmail() == null || !visitor.getEmail().equalsIgnoreCase(account.getEmail())) {
            throw new ResourceNotFoundException("Visitor request was not found.");
        }
        if (account.getOrganizationId() != null && !account.getOrganizationId().equals(visitor.getOrganizationId())) {
            throw new ResourceNotFoundException("Visitor request was not found.");
        }
        requirePassReady(visitor);
        return toPassResponse(visitor);
    }

    @CacheEvict(value = {"adminAnalytics", "statusSummary"}, allEntries = true)
    public VisitorResponse create(VisitorCreateRequest request, String actorId) {
        User actor = actorId == null ? null : currentUser(actorId);
        String forcedHostEmployeeId = actor != null && hasRole(actor, Role.EMPLOYEE) ? actor.getId() : null;
        Organization organization = organizationFor(actor, request.companyCode(), request.companyName());
        Instant now = Instant.now();
        Visitor visitor = new Visitor();
        visitor.setFullName(requiredTrim(request.fullName(), "Full name is required."));
        visitor.setPhone(requiredTrim(request.phone(), "Phone is required."));
        visitor.setEmail(trimToNull(request.email()));
        applyOrganization(visitor, organization);
        visitor.setPurposeOfVisit(requiredTrim(request.purposeOfVisit(), "Purpose of visit is required."));
        visitor.setHostEmployeeId(resolveHostEmployeeId(request.hostEmployeeId(), request.hostEmployee(), forcedHostEmployeeId, visitor.getOrganizationId()));
        visitor.setHostEmployee(resolveHostEmployeeName(request.hostEmployee(), visitor.getHostEmployeeId()));
        visitor.setHostEmployeeDepartment(resolveHostDepartment(visitor.getHostEmployeeId()));
        visitor.setPhotoUrl(requiredTrim(request.photoUrl(), "Visitor photo is required."));
        visitor.setPhotoPublicId(requiredTrim(request.photoPublicId(), "Visitor photo is required."));
        visitor.setStatus(VisitorStatus.PENDING);
        visitor.setApprovalExpiresAt(now.plusSeconds(appProperties.getVisitors().getPendingApprovalTtlMinutes() * 60));
        visitor.setCreatedAt(now);
        visitor.setUpdatedAt(now);
        enforceActiveVisitorRules(visitor);
        addHistory(visitor, VisitorStatus.PENDING, "REGISTERED", visitor.getHostEmployeeId(), "Approval requested.", now);
        Visitor saved = visitorRepository.save(visitor);
        audit(saved.getId(), null, VisitorStatus.PENDING, "REGISTERED", visitor.getHostEmployeeId(), "Approval requested.", now);
        visitorNotificationService.visitorApprovalRequested(saved);
        return toResponse(saved);
    }

    @CacheEvict(value = {"adminAnalytics", "statusSummary"}, allEntries = true)
    public VisitorResponse preApprove(PreApprovalRequest request, String hostEmployeeId) {
        User actor = currentUser(hostEmployeeId);
        Organization organization = organizationFor(actor, request.companyCode(), request.companyName());
        Instant now = Instant.now();
        Instant start = request.scheduledStartTime();
        Instant end = request.scheduledEndTime();
        String timezone = resolveTimezone(request.timezone());
        validateScheduleWindow(start, end, now);

        Visitor visitor = new Visitor();
        visitor.setFullName(requiredTrim(request.fullName(), "Full name is required."));
        visitor.setPhone(requiredTrim(request.phone(), "Phone is required."));
        visitor.setEmail(trimToNull(request.email()));
        applyOrganization(visitor, organization);
        visitor.setPurposeOfVisit(requiredTrim(request.purposeOfVisit(), "Purpose of visit is required."));
        visitor.setHostEmployeeId(requiredTrim(hostEmployeeId, "Host employee is required."));
        visitor.setHostEmployee(resolveHostEmployeeName(null, hostEmployeeId));
        visitor.setHostEmployeeDepartment(resolveHostDepartment(hostEmployeeId));
        visitor.setScheduledStartTime(start);
        visitor.setScheduledEndTime(end);
        visitor.setScheduledTimezone(timezone);
        visitor.setPreApproved(true);
        visitor.setStatus(VisitorStatus.APPROVED);
        visitor.setApprovedAt(now);
        visitor.setApprovedBy(hostEmployeeId);
        visitor.setQrCode(generatePassCode());
        visitor.setBadgeId(generateBadgeId());
        visitor.setQrIssuedAt(now);
        visitor.setQrExpiresAt(end);
        visitor.setCreatedAt(now);
        visitor.setUpdatedAt(now);
        enforceActiveVisitorRules(visitor);

        String note = trimToNull(request.note());
        addHistory(visitor, VisitorStatus.APPROVED, "PRE_APPROVED", hostEmployeeId, note, now);
        Visitor saved = visitorRepository.save(visitor);
        audit(saved.getId(), null, VisitorStatus.APPROVED, "PRE_APPROVED", hostEmployeeId, note, now);
        visitorNotificationService.visitorPreApproved(saved);
        return toResponse(saved);
    }

    public VisitorResponse get(String id) {
        return toResponse(find(id));
    }

    public VisitorResponse get(String id, String actorId) {
        Visitor visitor = find(id);
        requireOrganizationAccess(visitor, currentUser(actorId));
        return toResponse(visitor);
    }

    public VisitorResponse getForHost(String id, String hostEmployeeId) {
        Visitor visitor = find(id);
        requireHostAccess(visitor, hostEmployeeId);
        return toResponse(visitor);
    }

    public PageResponse<VisitorResponse> search(SearchRequest request) {
        return search(request, null);
    }

    public PageResponse<VisitorResponse> search(SearchRequest request, String actorId) {
        User actor = actorId == null ? null : currentUser(actorId);
        Pageable pageable = pageable(request);
        Query query = queryFor(request, actor).with(pageable);
        Query countQuery = queryFor(request, actor);
        long total = mongoTemplate.count(countQuery, Visitor.class);
        List<VisitorResponse> items = mongoTemplate.find(query, Visitor.class)
                .stream()
                .map(this::toResponse)
                .toList();
        Page<VisitorResponse> page = new PageImpl<>(items, pageable, total);
        return paginationService.toResponse(page);
    }

    public PageResponse<VisitorResponse> pendingApprovals(String hostEmployeeId) {
        SearchRequest request = new SearchRequest(null, 0, 50, "createdAt", "desc", VisitorStatus.PENDING, null, null, null);
        return search(request, hostEmployeeId);
    }

    public List<VisitorResponse> upcomingPreApprovals(String hostEmployeeId) {
        Instant now = Instant.now();
        Query query = new Query()
                .addCriteria(Criteria.where("hostEmployeeId").is(hostEmployeeId))
                .addCriteria(Criteria.where("preApproved").is(true))
                .addCriteria(Criteria.where("status").in(VisitorStatus.APPROVED, VisitorStatus.CHECKED_IN))
                .addCriteria(Criteria.where("scheduledEndTime").gte(now))
                .with(Sort.by(Sort.Direction.ASC, "scheduledStartTime"))
                .limit(25);

        return mongoTemplate.find(query, Visitor.class)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @CacheEvict(value = {"adminAnalytics", "statusSummary"}, allEntries = true)
    public VisitorResponse approve(String id, ApprovalDecisionRequest request, String actorId) {
        Visitor visitor = find(id);
        requireHostAccess(visitor, actorId);
        if (visitor.getStatus() != VisitorStatus.PENDING) {
            throw new BadRequestException("Only pending visitors can be approved.");
        }

        Instant now = Instant.now();
        VisitorStatus from = visitor.getStatus();
        visitor.setStatus(VisitorStatus.APPROVED);
        visitor.setApprovedAt(now);
        visitor.setApprovedBy(actorId);
        visitor.setRejectedAt(null);
        visitor.setRejectedBy(null);
        visitor.setRejectionReason(null);
        visitor.setQrCode(generatePassCode());
        if (visitor.getBadgeId() == null) {
            visitor.setBadgeId(generateBadgeId());
        }
        visitor.setQrIssuedAt(now);
        visitor.setQrExpiresAt(resolveQrExpiry(visitor, now));
        visitor.setUpdatedAt(now);
        String note = trimToNull(request == null ? null : request.note());
        addHistory(visitor, VisitorStatus.APPROVED, "APPROVED", actorId, note, now);
        Visitor saved = visitorRepository.save(visitor);
        audit(saved.getId(), from, VisitorStatus.APPROVED, "APPROVED", actorId, note, now);
        visitorNotificationService.visitorApproved(saved);
        return toResponse(saved);
    }

    @CacheEvict(value = {"adminAnalytics", "statusSummary"}, allEntries = true)
    public VisitorResponse reject(String id, ApprovalDecisionRequest request, String actorId) {
        Visitor visitor = find(id);
        requireHostAccess(visitor, actorId);
        if (visitor.getStatus() != VisitorStatus.PENDING) {
            throw new BadRequestException("Only pending visitors can be rejected.");
        }

        Instant now = Instant.now();
        VisitorStatus from = visitor.getStatus();
        String note = trimToNull(request == null ? null : request.note());
        visitor.setStatus(VisitorStatus.REJECTED);
        visitor.setRejectedAt(now);
        visitor.setRejectedBy(actorId);
        visitor.setRejectionReason(note);
        visitor.setQrCode(null);
        visitor.setQrIssuedAt(null);
        visitor.setQrExpiresAt(null);
        visitor.setBadgePrintedAt(null);
        visitor.setUpdatedAt(now);
        addHistory(visitor, VisitorStatus.REJECTED, "REJECTED", actorId, note, now);
        Visitor saved = visitorRepository.save(visitor);
        audit(saved.getId(), from, VisitorStatus.REJECTED, "REJECTED", actorId, note, now);
        visitorNotificationService.visitorRejected(saved);
        return toResponse(saved);
    }

    @CacheEvict(value = {"adminAnalytics", "statusSummary"}, allEntries = true)
    public VisitorResponse update(String id, VisitorUpdateRequest request) {
        Visitor visitor = find(id);
        applyUpdate(visitor, request);
        return toResponse(visitorRepository.save(visitor));
    }

    @CacheEvict(value = {"adminAnalytics", "statusSummary"}, allEntries = true)
    public VisitorResponse update(String id, VisitorUpdateRequest request, String actorId) {
        Visitor visitor = find(id);
        requireOrganizationAccess(visitor, currentUser(actorId));
        applyUpdate(visitor, request);
        return toResponse(visitorRepository.save(visitor));
    }

    @CacheEvict(value = {"adminAnalytics", "statusSummary"}, allEntries = true)
    public VisitorResponse updateForHost(String id, VisitorUpdateRequest request, String hostEmployeeId) {
        Visitor visitor = find(id);
        requireHostAccess(visitor, hostEmployeeId);
        applyUpdate(visitor, request);
        visitor.setHostEmployeeId(hostEmployeeId);
        visitor.setHostEmployee(resolveHostEmployeeName(null, hostEmployeeId));
        visitor.setHostEmployeeDepartment(resolveHostDepartment(hostEmployeeId));
        return toResponse(visitorRepository.save(visitor));
    }

    @CacheEvict(value = {"adminAnalytics", "statusSummary"}, allEntries = true)
    public void delete(String id) {
        Visitor visitor = find(id);
        visitorRepository.delete(visitor);
    }

    @CacheEvict(value = {"adminAnalytics", "statusSummary"}, allEntries = true)
    public void delete(String id, String actorId) {
        Visitor visitor = find(id);
        requireOrganizationAccess(visitor, currentUser(actorId));
        visitorRepository.delete(visitor);
    }

    public VisitorPassResponse pass(String id) {
        Visitor visitor = find(id);
        requirePassReady(visitor);
        return toPassResponse(visitor);
    }

    public VisitorPassResponse pass(String id, String actorId) {
        Visitor visitor = find(id);
        requireOrganizationAccess(visitor, currentUser(actorId));
        requirePassReady(visitor);
        return toPassResponse(visitor);
    }

    public VisitorPassResponse markBadgePrinted(String id) {
        Visitor visitor = find(id);
        requirePassReady(visitor);
        Instant now = Instant.now();
        visitor.setBadgePrintedAt(now);
        addHistory(visitor, visitor.getStatus(), "BADGE_PRINTED", null, "Badge printed.", now);
        Visitor saved = visitorRepository.save(visitor);
        audit(saved.getId(), visitor.getStatus(), visitor.getStatus(), "BADGE_PRINTED", null, "Badge printed.", now);
        return toPassResponse(saved);
    }

    public VisitorPassResponse markBadgePrinted(String id, String actorId) {
        Visitor visitor = find(id);
        requireOrganizationAccess(visitor, currentUser(actorId));
        requirePassReady(visitor);
        Instant now = Instant.now();
        visitor.setBadgePrintedAt(now);
        addHistory(visitor, visitor.getStatus(), "BADGE_PRINTED", actorId, "Badge printed.", now);
        Visitor saved = visitorRepository.save(visitor);
        audit(saved.getId(), visitor.getStatus(), visitor.getStatus(), "BADGE_PRINTED", actorId, "Badge printed.", now);
        return toPassResponse(saved);
    }

    public QrVerificationResponse verifyQrPayload(String scannedPayload) {
        return verifyQrPayload(scannedPayload, null);
    }

    public QrVerificationResponse verifyQrPayload(String scannedPayload, String actorId) {
        User actor = actorId == null ? null : currentUser(actorId);
        Instant now = Instant.now();
        String token = normalizeQrPayload(scannedPayload);
        Claims claims;
        try {
            claims = jwtService.parseClaims(token);
        } catch (JwtException | IllegalArgumentException ex) {
            return invalidVerification("QR pass is invalid or expired.");
        }

        if (!"visitor-pass".equals(claims.get("type", String.class))) {
            return invalidVerification("QR pass type is invalid.");
        }

        String visitorId = claims.getSubject();
        String passCode = claims.get("passCode", String.class);
        Visitor visitor = visitorRepository.findById(visitorId).orElse(null);
        if (visitor == null || visitor.getQrCode() == null || !visitor.getQrCode().equals(passCode)) {
            return invalidVerification("QR pass does not match an active visitor pass.");
        }
        if (actor != null && !hasOrganizationAccess(visitor, actor)) {
            return invalidVerification("QR pass belongs to another organization.");
        }

        if (visitor.getQrExpiresAt() == null || visitor.getQrExpiresAt().isBefore(now)) {
            return invalidVerification("QR pass has expired.");
        }
        if (visitor.getScheduledStartTime() != null && now.isBefore(visitor.getScheduledStartTime())) {
            return invalidVerification("QR pass is not active until the scheduled start time.");
        }

        boolean overdue = isOverdue(visitor, now);
        String validityStatus = passValidityStatus(visitor, now);

        if (visitor.getStatus() == VisitorStatus.REJECTED
                || visitor.getStatus() == VisitorStatus.CHECKED_OUT
                || visitor.getStatus() == VisitorStatus.PENDING
                || visitor.getStatus() == VisitorStatus.EXPIRED) {
            return new QrVerificationResponse(
                    false,
                    "Visitor pass is not valid for entry in the current status.",
                    visitor.getId(),
                    visitor.getFullName(),
                    visitor.getCompanyName(),
                    visitor.getOrganizationName(),
                    visitor.getOrganizationCode(),
                    visitor.getHostEmployee(),
                    hostDepartmentFor(visitor),
                    visitor.getPhotoUrl(),
                    visitor.getStatus(),
                    visitor.getQrCode(),
                    visitor.getQrExpiresAt(),
                    visitor.getScheduledEndTime(),
                    visitor.getCheckInTime(),
                    visitor.getCheckOutTime(),
                    overdue,
                    validityStatus
            );
        }

        return new QrVerificationResponse(
                true,
                visitor.getStatus() == VisitorStatus.CHECKED_IN
                        ? (overdue ? "Visitor is checked in and has exceeded the approved visit window." : "Visitor pass is valid. Visitor is already checked in.")
                        : "Visitor pass is valid for check-in.",
                visitor.getId(),
                visitor.getFullName(),
                visitor.getCompanyName(),
                visitor.getOrganizationName(),
                visitor.getOrganizationCode(),
                visitor.getHostEmployee(),
                hostDepartmentFor(visitor),
                visitor.getPhotoUrl(),
                visitor.getStatus(),
                visitor.getQrCode(),
                visitor.getQrExpiresAt(),
                visitor.getScheduledEndTime(),
                visitor.getCheckInTime(),
                visitor.getCheckOutTime(),
                overdue,
                validityStatus
        );
    }

    @CacheEvict(value = {"adminAnalytics", "statusSummary"}, allEntries = true)
    public VisitorResponse checkIn(String id) {
        Visitor visitor = find(id);
        return checkIn(visitor, null);
    }

    @CacheEvict(value = {"adminAnalytics", "statusSummary"}, allEntries = true)
    public VisitorResponse checkIn(String id, String actorId) {
        Visitor visitor = find(id);
        requireOrganizationAccess(visitor, currentUser(actorId));
        return checkIn(visitor, actorId);
    }

    private VisitorResponse checkIn(Visitor visitor, String actorId) {
        Instant now = Instant.now();
        if (visitor.getStatus() == VisitorStatus.CHECKED_IN) {
            throw new BadRequestException("Visitor is already checked in.");
        }
        if (visitor.getStatus() == VisitorStatus.CHECKED_OUT) {
            throw new BadRequestException("Checked-out visitors cannot be checked in again.");
        }
        if (visitor.getStatus() != VisitorStatus.APPROVED) {
            throw new BadRequestException("Only approved visitors can be checked in.");
        }
        requireVisitorWithinAllowedWindow(visitor, now);

        VisitorStatus from = visitor.getStatus();
        visitor.setCheckInTime(now);
        visitor.setCheckOutTime(null);
        visitor.setStatus(VisitorStatus.CHECKED_IN);
        visitor.setUpdatedAt(now);
        addHistory(visitor, VisitorStatus.CHECKED_IN, "CHECKED_IN", actorId, "Visitor checked in.", now);
        Visitor saved = visitorRepository.save(visitor);
        audit(saved.getId(), from, VisitorStatus.CHECKED_IN, "CHECKED_IN", actorId, "Visitor checked in.", now);
        visitorNotificationService.visitorCheckedIn(saved);
        return toResponse(saved);
    }

    @CacheEvict(value = {"adminAnalytics", "statusSummary"}, allEntries = true)
    public VisitorResponse checkOut(String id) {
        Visitor visitor = find(id);
        return checkOut(visitor, null);
    }

    @CacheEvict(value = {"adminAnalytics", "statusSummary"}, allEntries = true)
    public VisitorResponse checkOut(String id, String actorId) {
        Visitor visitor = find(id);
        requireOrganizationAccess(visitor, currentUser(actorId));
        return checkOut(visitor, actorId);
    }

    private VisitorResponse checkOut(Visitor visitor, String actorId) {
        if (visitor.getStatus() != VisitorStatus.CHECKED_IN) {
            throw new BadRequestException("Only checked-in visitors can be checked out.");
        }

        Instant now = Instant.now();
        VisitorStatus from = visitor.getStatus();
        visitor.setCheckOutTime(now);
        visitor.setStatus(VisitorStatus.CHECKED_OUT);
        visitor.setUpdatedAt(now);
        addHistory(visitor, VisitorStatus.CHECKED_OUT, "CHECKED_OUT", actorId, "Visitor checked out.", now);
        Visitor saved = visitorRepository.save(visitor);
        audit(saved.getId(), from, VisitorStatus.CHECKED_OUT, "CHECKED_OUT", actorId, "Visitor checked out.", now);
        return toResponse(saved);
    }

    public List<Map<String, Object>> metrics() {
        return metrics(null);
    }

    public List<Map<String, Object>> metrics(String actorId) {
        User actor = actorId == null ? null : currentUser(actorId);
        Instant start = LocalDate.now(ZoneOffset.UTC).atStartOfDay().toInstant(ZoneOffset.UTC);
        Instant end = start.plusSeconds(24 * 60 * 60);
        String organizationId = scopeOrganizationId(actor);
        return List.of(
                Map.of("label", "Visitors today", "value", countCheckIns(organizationId, start, end), "note", "Checked in"),
                Map.of("label", "Pending", "value", countStatus(organizationId, VisitorStatus.PENDING), "note", "Awaiting approval"),
                Map.of("label", "Approved", "value", countStatus(organizationId, VisitorStatus.APPROVED), "note", "Passes generated"),
                Map.of("label", "On site", "value", countStatus(organizationId, VisitorStatus.CHECKED_IN), "note", "Currently checked in"),
                Map.of("label", "Expired", "value", countStatus(organizationId, VisitorStatus.EXPIRED), "note", "Window elapsed")
        );
    }

    public List<EmployeeDirectoryEntryResponse> searchHosts(String query, String companyCode, String actorId) {
        User actor = actorId == null ? null : currentUser(actorId);
        Organization organization = resolveSearchOrganization(actor, companyCode);
        Query employeeQuery = new Query()
                .addCriteria(Criteria.where("roles").in(Role.EMPLOYEE))
                .addCriteria(Criteria.where("active").is(true))
                .addCriteria(Criteria.where("organizationId").is(organization.getId()))
                .with(Sort.by(Sort.Direction.ASC, "fullName"))
                .limit(8);

        Criteria textCriteria = textSearchCriteria(query);
        if (textCriteria != null) {
            employeeQuery.addCriteria(textCriteria);
        }

        return mongoTemplate.find(employeeQuery, User.class)
                .stream()
                .map(user -> new EmployeeDirectoryEntryResponse(
                        user.getId(),
                        user.getFullName(),
                        user.getEmail(),
                        user.getUsername(),
                        user.getDepartment(),
                        user.getOrganizationName()
                ))
                .toList();
    }

    public SecurityMonitoringResponse securityMonitoring(String actorId, String query) {
        User actor = currentUser(actorId);
        String organizationId = scopeOrganizationId(actor);
        Instant now = Instant.now();
        return new SecurityMonitoringResponse(
                Map.of(
                        "currentlyInside", countForMonitoring(organizationId, query, Criteria.where("status").is(VisitorStatus.CHECKED_IN)),
                        "overdueVisitors", countForMonitoring(organizationId, query, overdueCriteria(now)),
                        "checkedOutVisitors", countForMonitoring(organizationId, query, Criteria.where("status").is(VisitorStatus.CHECKED_OUT)),
                        "rejectedVisitors", countForMonitoring(organizationId, query, Criteria.where("status").is(VisitorStatus.REJECTED)),
                        "approvedVisitors", countForMonitoring(organizationId, query, Criteria.where("status").is(VisitorStatus.APPROVED))
                ),
                monitorVisitors(organizationId, query, Criteria.where("status").is(VisitorStatus.CHECKED_IN), Sort.by(Sort.Direction.DESC, "checkInTime")),
                monitorVisitors(organizationId, query, overdueCriteria(now), Sort.by(Sort.Direction.ASC, "scheduledEndTime").and(Sort.by(Sort.Direction.ASC, "qrExpiresAt"))),
                monitorVisitors(organizationId, query, Criteria.where("status").is(VisitorStatus.CHECKED_OUT), Sort.by(Sort.Direction.DESC, "checkOutTime")),
                monitorVisitors(organizationId, query, Criteria.where("status").is(VisitorStatus.REJECTED), Sort.by(Sort.Direction.DESC, "rejectedAt")),
                monitorVisitors(organizationId, query, Criteria.where("status").is(VisitorStatus.APPROVED), Sort.by(Sort.Direction.ASC, "scheduledStartTime").and(Sort.by(Sort.Direction.DESC, "createdAt")))
        );
    }

    public VisitorHistorySummaryResponse visitorHistoryForVisitorAccount(User account) {
        List<Visitor> records = mongoTemplate.find(
                historyQuery(account.getOrganizationId(), account.getEmail(), account.getPhone(), account.getFullName(), null),
                Visitor.class
        );
        return toHistorySummary(records);
    }

    public VisitorHistorySummaryResponse visitorHistory(String id, String actorId) {
        Visitor visitor = find(id);
        requireOrganizationAccess(visitor, currentUser(actorId));
        List<Visitor> records = mongoTemplate.find(
                historyQuery(visitor.getOrganizationId(), visitor.getEmail(), visitor.getPhone(), visitor.getFullName(), null),
                Visitor.class
        );
        return toHistorySummary(records);
    }

    @Cacheable("statusSummary")
    public Map<String, Object> statusSummary() {
        return statusSummary(null);
    }

    public Map<String, Object> statusSummary(String actorId) {
        User actor = actorId == null ? null : currentUser(actorId);
        String organizationId = scopeOrganizationId(actor);
        return Map.of(
                "pending", countStatus(organizationId, VisitorStatus.PENDING),
                "approved", countStatus(organizationId, VisitorStatus.APPROVED),
                "rejected", countStatus(organizationId, VisitorStatus.REJECTED),
                "checkedIn", countStatus(organizationId, VisitorStatus.CHECKED_IN),
                "checkedOut", countStatus(organizationId, VisitorStatus.CHECKED_OUT),
                "expired", countStatus(organizationId, VisitorStatus.EXPIRED)
        );
    }

    @CacheEvict(value = {"adminAnalytics", "statusSummary"}, allEntries = true)
    public int expireDueVisitors() {
        Instant now = Instant.now();
        Query query = new Query(new Criteria().orOperator(
                Criteria.where("status").is(VisitorStatus.PENDING).and("approvalExpiresAt").lte(now),
                Criteria.where("status").is(VisitorStatus.APPROVED).and("scheduledEndTime").lte(now),
                Criteria.where("status").is(VisitorStatus.APPROVED).and("qrExpiresAt").lte(now)
        ));

        List<Visitor> dueVisitors = mongoTemplate.find(query, Visitor.class);
        dueVisitors.forEach(visitor -> expireVisitor(visitor, now));
        return dueVisitors.size();
    }

    private Query queryFor(SearchRequest request, User actor) {
        List<Criteria> criteria = new ArrayList<>();
        String query = trimToNull(request.query());
        if (query != null) {
            Pattern pattern = Pattern.compile(Pattern.quote(query), Pattern.CASE_INSENSITIVE);
            criteria.add(new Criteria().orOperator(
                    Criteria.where("fullName").regex(pattern),
                    Criteria.where("phone").regex(pattern),
                    Criteria.where("email").regex(pattern),
                    Criteria.where("companyName").regex(pattern),
                    Criteria.where("purposeOfVisit").regex(pattern),
                    Criteria.where("hostEmployee").regex(pattern),
                    Criteria.where("qrCode").regex(pattern)
            ));
        }

        if (request.status() != null) {
            criteria.add(Criteria.where("status").is(request.status()));
        }

        String hostEmployeeId = actor != null && hasRole(actor, Role.EMPLOYEE) ? actor.getId() : trimToNull(request.hostEmployeeId());
        if (hostEmployeeId != null) {
            criteria.add(Criteria.where("hostEmployeeId").is(hostEmployeeId));
        }

        String organizationId = scopeOrganizationId(actor);
        if (organizationId != null) {
            criteria.add(Criteria.where("organizationId").is(organizationId));
        }

        if (request.from() != null || request.to() != null) {
            Criteria createdAt = Criteria.where("createdAt");
            if (request.from() != null) {
                createdAt = createdAt.gte(request.from());
            }
            if (request.to() != null) {
                createdAt = createdAt.lte(request.to());
            }
            criteria.add(createdAt);
        }

        Query mongoQuery = new Query();
        if (!criteria.isEmpty()) {
            mongoQuery.addCriteria(new Criteria().andOperator(criteria.toArray(Criteria[]::new)));
        }
        return mongoQuery;
    }

    private Pageable pageable(SearchRequest request) {
        String sortBy = request.sortBy() != null && SORT_FIELDS.contains(request.sortBy()) ? request.sortBy() : "createdAt";
        Sort.Direction direction = "asc".equalsIgnoreCase(request.direction()) ? Sort.Direction.ASC : Sort.Direction.DESC;
        return PageRequest.of(request.page(), request.size(), Sort.by(direction, sortBy));
    }

    private void applyUpdate(Visitor visitor, VisitorUpdateRequest request) {
        setIfPresent(request.fullName(), value -> visitor.setFullName(requiredTrim(value, "Full name is required.")));
        setIfPresent(request.phone(), value -> visitor.setPhone(requiredTrim(value, "Phone is required.")));
        setIfPresent(request.email(), value -> visitor.setEmail(trimToNull(value)));
        setIfPresent(request.companyName(), value -> {
            Organization organization = organizationService.resolve(request.companyCode(), value);
            if (organization != null) {
                applyOrganization(visitor, organization);
            } else {
                visitor.setCompanyName(trimToNull(value));
            }
        });
        setIfPresent(request.purposeOfVisit(), value -> visitor.setPurposeOfVisit(requiredTrim(value, "Purpose of visit is required.")));
        if (request.hostEmployeeId() != null || request.hostEmployee() != null) {
            String hostEmployeeId = resolveHostEmployeeId(request.hostEmployeeId(), request.hostEmployee(), null, visitor.getOrganizationId());
            visitor.setHostEmployeeId(hostEmployeeId);
            visitor.setHostEmployee(resolveHostEmployeeName(request.hostEmployee(), hostEmployeeId));
            visitor.setHostEmployeeDepartment(resolveHostDepartment(hostEmployeeId));
        }
        setIfPresent(request.photoUrl(), value -> visitor.setPhotoUrl(trimToNull(value)));
        setIfPresent(request.photoPublicId(), value -> visitor.setPhotoPublicId(trimToNull(value)));
        if (request.status() != null) {
            applyDirectStatusUpdate(visitor, request.status());
        }
        visitor.setUpdatedAt(Instant.now());
    }

    private void applyDirectStatusUpdate(Visitor visitor, VisitorStatus status) {
        throw new BadRequestException("Use approval, check-in, and check-out endpoints to change visitor status.");
    }

    private Visitor find(String id) {
        return visitorRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Visitor was not found."));
    }

    private void requireHostAccess(Visitor visitor, String hostEmployeeId) {
        if (hostEmployeeId == null || !hostEmployeeId.equals(visitor.getHostEmployeeId())) {
            throw new ResourceNotFoundException("Visitor was not found.");
        }
        requireOrganizationAccess(visitor, currentUser(hostEmployeeId));
    }

    private String resolveHostEmployeeId(String requestHostEmployeeId, String requestHostEmployee, String forcedHostEmployeeId, String organizationId) {
        String resolved = forcedHostEmployeeId != null ? forcedHostEmployeeId : trimToNull(requestHostEmployeeId);
        User user = findHost(resolved, organizationId);
        if (user == null) {
            user = findHost(requestHostEmployee, organizationId);
        }
        if (user != null) {
            return user.getId();
        }
        if (resolved == null) {
            resolved = trimToNull(requestHostEmployee);
        }
        if (resolved == null) {
            throw new BadRequestException("Host employee is required.");
        }
        return resolved;
    }

    private String resolveHostEmployeeName(String requestHostEmployee, String hostEmployeeId) {
        String hostEmployee = trimToNull(requestHostEmployee);
        if (hostEmployee != null) {
            return hostEmployee;
        }
        return userRepository.findById(hostEmployeeId)
                .map(User::getFullName)
                .filter(name -> !name.isBlank())
                .orElse(hostEmployeeId);
    }

    private String resolveHostDepartment(String hostEmployeeId) {
        return userRepository.findById(hostEmployeeId)
                .map(User::getDepartment)
                .filter(value -> !value.isBlank())
                .orElse(null);
    }

    private String generatePassCode() {
        String qrCode;
        do {
            qrCode = "VST-" + UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
        } while (visitorRepository.findByQrCode(qrCode).isPresent());
        return qrCode;
    }

    private String generateBadgeId() {
        return "BDG-" + UUID.randomUUID().toString().replace("-", "").substring(0, 12).toUpperCase();
    }

    private VisitorResponse toResponse(Visitor visitor) {
        return new VisitorResponse(
                visitor.getId(),
                visitor.getFullName(),
                visitor.getPhone(),
                visitor.getEmail(),
                visitor.getCompanyName(),
                visitor.getOrganizationId(),
                visitor.getOrganizationName(),
                visitor.getOrganizationCode(),
                visitor.getPurposeOfVisit(),
                visitor.getHostEmployee(),
                hostDepartmentFor(visitor),
                visitor.getPhotoUrl(),
                visitor.getHostEmployeeId(),
                resolveBadgeId(visitor),
                visitor.getCheckInTime(),
                visitor.getCheckOutTime(),
                visitor.getScheduledStartTime(),
                visitor.getScheduledEndTime(),
                visitor.getScheduledTimezone(),
                visitor.getApprovalExpiresAt(),
                visitor.isPreApproved(),
                visitor.getStatus(),
                visitor.getQrCode(),
                visitor.getQrIssuedAt(),
                visitor.getQrExpiresAt(),
                visitor.getBadgePrintedAt(),
                visitor.getApprovedAt(),
                visitor.getRejectedAt(),
                visitor.getApprovedBy(),
                visitor.getRejectedBy(),
                visitor.getRejectionReason(),
                visitor.getStatusHistory() == null ? List.of() : visitor.getStatusHistory()
                        .stream()
                        .map(entry -> new VisitorStatusHistoryResponse(
                                entry.getStatus(),
                                entry.getAction(),
                                entry.getActorId(),
                                entry.getNote(),
                                entry.getTimestamp()
                        ))
                        .toList(),
                visitor.getCreatedAt(),
                visitor.getUpdatedAt()
        );
    }

    private VisitorPassResponse toPassResponse(Visitor visitor) {
        String payload = QR_PAYLOAD_PREFIX + jwtService.generateVisitorPassToken(visitor.getId(), visitor.getQrCode(), visitor.getQrExpiresAt());
        Instant now = Instant.now();
        return new VisitorPassResponse(
                visitor.getId(),
                resolveBadgeId(visitor),
                visitor.getFullName(),
                visitor.getCompanyName(),
                visitor.getOrganizationName(),
                visitor.getOrganizationCode(),
                visitor.getPurposeOfVisit(),
                visitor.getHostEmployee(),
                hostDepartmentFor(visitor),
                visitor.getPhotoUrl(),
                visitor.getStatus(),
                isPassValid(visitor, now),
                passValidityStatus(visitor, now),
                visitor.getQrCode(),
                payload,
                qrCodeService.dataUri(payload),
                visitor.getQrIssuedAt(),
                visitor.getQrExpiresAt(),
                visitor.getApprovedAt(),
                visitor.getScheduledStartTime(),
                visitor.getScheduledEndTime(),
                visitor.getCheckInTime(),
                visitor.getCheckOutTime()
        );
    }

    private String requiredTrim(String value, String message) {
        String trimmed = trimToNull(value);
        if (trimmed == null) {
            throw new BadRequestException(message);
        }
        return trimmed;
    }

    private User currentUser(String userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User account was not found."));
    }

    private boolean hasRole(User user, Role role) {
        return user != null && user.getRoles() != null && user.getRoles().contains(role);
    }

    private Organization organizationFor(User actor, String companyCode, String companyName) {
        if (actor != null && actor.getOrganizationId() != null && !hasRole(actor, Role.SUPER_ADMIN)) {
            return organizationService.requireActive(actor.getOrganizationId());
        }
        return organizationService.resolveRequired(companyCode, companyName);
    }

    private void applyOrganization(Visitor visitor, Organization organization) {
        visitor.setOrganizationId(organization.getId());
        visitor.setOrganizationCode(organization.getCompanyCode());
        visitor.setOrganizationName(organization.getCompanyName());
        visitor.setCompanyName(organization.getCompanyName());
    }

    private String scopeOrganizationId(User actor) {
        if (actor == null || hasRole(actor, Role.SUPER_ADMIN)) {
            return null;
        }
        return actor.getOrganizationId();
    }

    private void requireOrganizationAccess(Visitor visitor, User actor) {
        if (!hasOrganizationAccess(visitor, actor)) {
            throw new ResourceNotFoundException("Visitor was not found.");
        }
    }

    private boolean hasOrganizationAccess(Visitor visitor, User actor) {
        String organizationId = scopeOrganizationId(actor);
        return organizationId == null || organizationId.equals(visitor.getOrganizationId());
    }

    private User findHost(String candidate, String organizationId) {
        String value = trimToNull(candidate);
        if (value == null) {
            return null;
        }
        User user = userRepository.findById(value)
                .or(() -> userRepository.findByUsernameIgnoreCase(value))
                .or(() -> userRepository.findByEmailIgnoreCase(value))
                .or(() -> userRepository.findByFullNameIgnoreCase(value))
                .orElse(null);
        if (user == null || !hasRole(user, Role.EMPLOYEE)) {
            return null;
        }
        return organizationId == null || organizationId.equals(user.getOrganizationId()) ? user : null;
    }

    private long countStatus(String organizationId, VisitorStatus status) {
        return organizationId == null ? visitorRepository.countByStatus(status) : visitorRepository.countByOrganizationIdAndStatus(organizationId, status);
    }

    private long countCheckIns(String organizationId, Instant start, Instant end) {
        return organizationId == null
                ? visitorRepository.countByCheckInTimeBetween(start, end)
                : visitorRepository.countByOrganizationIdAndCheckInTimeBetween(organizationId, start, end);
    }

    private String trimToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private void setIfPresent(String value, java.util.function.Consumer<String> consumer) {
        if (value != null) {
            consumer.accept(value);
        }
    }

    private void addHistory(Visitor visitor, VisitorStatus status, String action, String actorId, String note, Instant timestamp) {
        VisitorStatusHistoryEntry entry = new VisitorStatusHistoryEntry();
        entry.setStatus(status);
        entry.setAction(action);
        entry.setActorId(actorId);
        entry.setNote(note);
        entry.setTimestamp(timestamp);
        if (visitor.getStatusHistory() == null) {
            visitor.setStatusHistory(new ArrayList<>());
        }
        visitor.getStatusHistory().add(entry);
    }

    private void audit(String visitorId, VisitorStatus from, VisitorStatus to, String action, String actorId, String note, Instant timestamp) {
        VisitorAuditLog log = new VisitorAuditLog();
        log.setVisitorId(visitorId);
        log.setFromStatus(from);
        log.setToStatus(to);
        log.setAction(action);
        log.setActorId(actorId);
        log.setNote(note);
        log.setCreatedAt(timestamp);
        visitorAuditLogRepository.save(log);
    }

    private void requirePassReady(Visitor visitor) {
        if (visitor.getStatus() != VisitorStatus.APPROVED && visitor.getStatus() != VisitorStatus.CHECKED_IN) {
            throw new BadRequestException("A visitor pass is available only after approval.");
        }
        if (visitor.getQrCode() == null || visitor.getQrExpiresAt() == null || visitor.getQrExpiresAt().isBefore(Instant.now())) {
            throw new BadRequestException("Visitor pass is missing or expired.");
        }
        requireVisitorWithinAllowedWindow(visitor, Instant.now());
    }

    private String normalizeQrPayload(String scannedPayload) {
        String value = requiredTrim(scannedPayload, "QR payload is required.");
        if (value.startsWith(QR_PAYLOAD_PREFIX)) {
            return value.substring(QR_PAYLOAD_PREFIX.length());
        }
        return value;
    }

    private QrVerificationResponse invalidVerification(String message) {
        return new QrVerificationResponse(false, message, null, null, null, null, null, null, null, null, null, null, null, null, null, null, false, "Invalid");
    }

    private void validateScheduleWindow(Instant start, Instant end, Instant now) {
        if (!start.isAfter(now)) {
            throw new BadRequestException("Scheduled start time must be in the future.");
        }
        if (!end.isAfter(start)) {
            throw new BadRequestException("Scheduled end time must be after the start time.");
        }
        long windowSeconds = end.getEpochSecond() - start.getEpochSecond();
        if (windowSeconds < MIN_VISIT_WINDOW_MINUTES * 60) {
            throw new BadRequestException("Scheduled visits must be at least 15 minutes long.");
        }
        if (windowSeconds > MAX_VISIT_WINDOW_HOURS * 60 * 60) {
            throw new BadRequestException("Scheduled visits cannot exceed 24 hours.");
        }
    }

    private String resolveTimezone(String timezone) {
        String value = trimToNull(timezone);
        if (value == null) {
            return ZoneOffset.UTC.getId();
        }
        try {
            return ZoneId.of(value).getId();
        } catch (DateTimeException ex) {
            throw new BadRequestException("Timezone is invalid.");
        }
    }

    private Instant resolveQrExpiry(Visitor visitor, Instant now) {
        if (visitor.getScheduledEndTime() != null) {
            return visitor.getScheduledEndTime();
        }
        return now.plusSeconds(PASS_VALID_HOURS * 60 * 60);
    }

    private void requireVisitorWithinAllowedWindow(Visitor visitor, Instant now) {
        if (visitor.getScheduledStartTime() != null && now.isBefore(visitor.getScheduledStartTime())) {
            throw new BadRequestException("Visitor pass is not active until the scheduled start time.");
        }
        if (visitor.getScheduledEndTime() != null && !now.isBefore(visitor.getScheduledEndTime())) {
            throw new BadRequestException("Visitor pass has expired for the scheduled visit window.");
        }
    }

    private void enforceActiveVisitorRules(Visitor candidate) {
        if (candidate.getHostEmployeeId() == null) {
            return;
        }

        List<VisitorStatus> activeStatuses = List.of(VisitorStatus.PENDING, VisitorStatus.APPROVED, VisitorStatus.CHECKED_IN);
        Query activeForHost = new Query()
                .addCriteria(Criteria.where("hostEmployeeId").is(candidate.getHostEmployeeId()))
                .addCriteria(Criteria.where("status").in(activeStatuses));
        if (candidate.getOrganizationId() != null) {
            activeForHost.addCriteria(Criteria.where("organizationId").is(candidate.getOrganizationId()));
        }
        long activeCount = mongoTemplate.count(activeForHost, Visitor.class);
        if (activeCount >= appProperties.getVisitors().getMaxActivePerEmployee()) {
            throw new ConflictException("Host employee has reached the active visitor limit.");
        }

        List<Criteria> identities = new ArrayList<>();
        if (candidate.getPhone() != null) {
            identities.add(Criteria.where("phone").is(candidate.getPhone()));
        }
        if (candidate.getEmail() != null) {
            identities.add(Criteria.where("email").is(candidate.getEmail()));
        }
        if (identities.isEmpty()) {
            return;
        }

        Query duplicate = new Query()
                .addCriteria(Criteria.where("hostEmployeeId").is(candidate.getHostEmployeeId()))
                .addCriteria(Criteria.where("status").in(activeStatuses))
                .addCriteria(new Criteria().orOperator(identities.toArray(Criteria[]::new)));
        if (candidate.getOrganizationId() != null) {
            duplicate.addCriteria(Criteria.where("organizationId").is(candidate.getOrganizationId()));
        }
        if (mongoTemplate.exists(duplicate, Visitor.class)) {
            throw new ConflictException("This visitor already has an active visit with the host employee.");
        }
    }

    private Query historyQuery(String organizationId, String email, String phone, String fullName, String excludeVisitorId) {
        List<Criteria> criteria = new ArrayList<>();
        List<Criteria> identities = new ArrayList<>();
        if (email != null) {
            identities.add(Criteria.where("email").is(email));
        }
        if (phone != null) {
            identities.add(Criteria.where("phone").is(phone));
        }
        if (identities.isEmpty() && fullName != null) {
            identities.add(Criteria.where("fullName").is(fullName));
        }
        if (!identities.isEmpty()) {
            criteria.add(new Criteria().orOperator(identities.toArray(Criteria[]::new)));
        }
        if (organizationId != null) {
            criteria.add(Criteria.where("organizationId").is(organizationId));
        }
        if (excludeVisitorId != null) {
            criteria.add(Criteria.where("id").ne(excludeVisitorId));
        }

        Query query = new Query().with(Sort.by(Sort.Direction.DESC, "createdAt"));
        if (!criteria.isEmpty()) {
            query.addCriteria(new Criteria().andOperator(criteria.toArray(Criteria[]::new)));
        }
        return query;
    }

    private VisitorHistorySummaryResponse toHistorySummary(List<Visitor> records) {
        List<VisitorResponse> items = records.stream().map(this::toResponse).toList();
        LinkedHashSet<String> previousHosts = new LinkedHashSet<>();
        long approvedVisits = 0;
        long checkedInVisits = 0;
        long checkedOutVisits = 0;
        long rejectedVisits = 0;
        long expiredVisits = 0;
        Instant firstVisitAt = null;
        Instant lastVisitAt = null;

        for (Visitor visitor : records) {
            if (visitor.getHostEmployee() != null && !visitor.getHostEmployee().isBlank()) {
                previousHosts.add(visitor.getHostEmployee());
            }
            if (isApprovedLifecycle(visitor.getStatus())) {
                approvedVisits++;
            }
            if (visitor.getStatus() == VisitorStatus.CHECKED_IN) {
                checkedInVisits++;
            }
            if (visitor.getStatus() == VisitorStatus.CHECKED_OUT) {
                checkedOutVisits++;
            }
            if (visitor.getStatus() == VisitorStatus.REJECTED) {
                rejectedVisits++;
            }
            if (visitor.getStatus() == VisitorStatus.EXPIRED) {
                expiredVisits++;
            }
            Instant timestamp = visitor.getCreatedAt();
            if (timestamp != null) {
                if (firstVisitAt == null || timestamp.isBefore(firstVisitAt)) {
                    firstVisitAt = timestamp;
                }
                if (lastVisitAt == null || timestamp.isAfter(lastVisitAt)) {
                    lastVisitAt = timestamp;
                }
            }
        }

        Visitor current = records.isEmpty() ? null : records.get(0);
        return new VisitorHistorySummaryResponse(
                current == null ? null : current.getFullName(),
                current == null ? null : current.getCompanyName(),
                current == null ? null : current.getOrganizationName(),
                items.size(),
                Math.max(items.size() - 1, 0),
                approvedVisits,
                checkedInVisits,
                checkedOutVisits,
                rejectedVisits,
                expiredVisits,
                firstVisitAt,
                lastVisitAt,
                previousHosts.stream().toList(),
                items
        );
    }

    private boolean isApprovedLifecycle(VisitorStatus status) {
        return status == VisitorStatus.APPROVED || status == VisitorStatus.CHECKED_IN || status == VisitorStatus.CHECKED_OUT;
    }

    private Organization resolveSearchOrganization(User actor, String companyCode) {
        if (actor != null && actor.getOrganizationId() != null && !hasRole(actor, Role.SUPER_ADMIN)) {
            return organizationService.requireActive(actor.getOrganizationId());
        }
        return organizationService.resolveRequired(companyCode, null);
    }

    private Criteria textSearchCriteria(String query) {
        String value = trimToNull(query);
        if (value == null) {
            return null;
        }
        Pattern pattern = Pattern.compile(Pattern.quote(value), Pattern.CASE_INSENSITIVE);
        return new Criteria().orOperator(
                Criteria.where("fullName").regex(pattern),
                Criteria.where("phone").regex(pattern),
                Criteria.where("email").regex(pattern),
                Criteria.where("companyName").regex(pattern),
                Criteria.where("purposeOfVisit").regex(pattern),
                Criteria.where("hostEmployee").regex(pattern),
                Criteria.where("hostEmployeeDepartment").regex(pattern),
                Criteria.where("qrCode").regex(pattern),
                Criteria.where("username").regex(pattern),
                Criteria.where("department").regex(pattern)
        );
    }

    private Query monitoringQuery(String organizationId, String query, Criteria statusCriteria, Sort sort) {
        Query monitoringQuery = new Query().with(sort).limit(10);
        List<Criteria> criteria = new ArrayList<>();
        if (organizationId != null) {
            criteria.add(Criteria.where("organizationId").is(organizationId));
        }
        Criteria textCriteria = textSearchCriteria(query);
        if (textCriteria != null) {
            criteria.add(textCriteria);
        }
        if (statusCriteria != null) {
            criteria.add(statusCriteria);
        }
        if (!criteria.isEmpty()) {
            monitoringQuery.addCriteria(new Criteria().andOperator(criteria.toArray(Criteria[]::new)));
        }
        return monitoringQuery;
    }

    private long countForMonitoring(String organizationId, String query, Criteria statusCriteria) {
        Query countQuery = new Query();
        List<Criteria> criteria = new ArrayList<>();
        if (organizationId != null) {
            criteria.add(Criteria.where("organizationId").is(organizationId));
        }
        Criteria textCriteria = textSearchCriteria(query);
        if (textCriteria != null) {
            criteria.add(textCriteria);
        }
        if (statusCriteria != null) {
            criteria.add(statusCriteria);
        }
        if (!criteria.isEmpty()) {
            countQuery.addCriteria(new Criteria().andOperator(criteria.toArray(Criteria[]::new)));
        }
        return mongoTemplate.count(countQuery, Visitor.class);
    }

    private List<VisitorResponse> monitorVisitors(String organizationId, String query, Criteria statusCriteria, Sort sort) {
        return mongoTemplate.find(monitoringQuery(organizationId, query, statusCriteria, sort), Visitor.class)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    private Criteria overdueCriteria(Instant now) {
        return new Criteria().andOperator(
                Criteria.where("status").is(VisitorStatus.CHECKED_IN),
                new Criteria().orOperator(
                        Criteria.where("scheduledEndTime").lte(now),
                        Criteria.where("qrExpiresAt").lte(now)
                )
        );
    }

    private boolean isPassValid(Visitor visitor, Instant now) {
        return visitor.getQrCode() != null
                && visitor.getQrExpiresAt() != null
                && visitor.getQrExpiresAt().isAfter(now)
                && (visitor.getStatus() == VisitorStatus.APPROVED || visitor.getStatus() == VisitorStatus.CHECKED_IN)
                && (visitor.getScheduledStartTime() == null || !now.isBefore(visitor.getScheduledStartTime()))
                && (visitor.getScheduledEndTime() == null || now.isBefore(visitor.getScheduledEndTime()));
    }

    private boolean isOverdue(Visitor visitor, Instant now) {
        return visitor.getStatus() == VisitorStatus.CHECKED_IN
                && ((visitor.getScheduledEndTime() != null && !now.isBefore(visitor.getScheduledEndTime()))
                || (visitor.getQrExpiresAt() != null && !now.isBefore(visitor.getQrExpiresAt())));
    }

    private String passValidityStatus(Visitor visitor, Instant now) {
        if (visitor.getStatus() == VisitorStatus.CHECKED_OUT) {
            return "Checked out";
        }
        if (visitor.getStatus() == VisitorStatus.REJECTED) {
            return "Rejected";
        }
        if (visitor.getStatus() == VisitorStatus.EXPIRED) {
            return "Expired";
        }
        if (visitor.getStatus() == VisitorStatus.PENDING) {
            return "Awaiting approval";
        }
        if (visitor.getScheduledStartTime() != null && now.isBefore(visitor.getScheduledStartTime())) {
            return "Scheduled";
        }
        if (visitor.getQrExpiresAt() == null || !visitor.getQrExpiresAt().isAfter(now)) {
            return "Expired";
        }
        if (isOverdue(visitor, now)) {
            return "Overdue";
        }
        if (visitor.getStatus() == VisitorStatus.CHECKED_IN) {
            return "Checked in";
        }
        return "Valid";
    }

    private String resolveBadgeId(Visitor visitor) {
        return visitor.getBadgeId() != null ? visitor.getBadgeId() : "BDG-" + visitor.getQrCode();
    }

    private String hostDepartmentFor(Visitor visitor) {
        String department = trimToNull(visitor.getHostEmployeeDepartment());
        return department != null ? department : resolveHostDepartment(visitor.getHostEmployeeId());
    }

    private void expireVisitor(Visitor visitor, Instant now) {
        VisitorStatus from = visitor.getStatus();
        visitor.setStatus(VisitorStatus.EXPIRED);
        visitor.setQrCode(null);
        visitor.setQrIssuedAt(null);
        visitor.setQrExpiresAt(null);
        visitor.setUpdatedAt(now);
        String note = from == VisitorStatus.PENDING
                ? "Pending approval expired automatically."
                : "Scheduled visitor pass expired automatically.";
        addHistory(visitor, VisitorStatus.EXPIRED, "AUTO_EXPIRED", null, note, now);
        Visitor saved = visitorRepository.save(visitor);
        audit(saved.getId(), from, VisitorStatus.EXPIRED, "AUTO_EXPIRED", null, note, now);
        visitorNotificationService.visitorExpired(saved, note);
    }
}
