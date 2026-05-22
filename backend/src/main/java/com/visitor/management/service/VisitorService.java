package com.visitor.management.service;

import com.visitor.management.dto.PageResponse;
import com.visitor.management.dto.ApprovalDecisionRequest;
import com.visitor.management.dto.EmployeeDirectoryEntryResponse;
import com.visitor.management.dto.ManualOverrideCheckInRequest;
import com.visitor.management.dto.PreApprovalRequest;
import com.visitor.management.dto.QrVerificationResponse;
import com.visitor.management.dto.RescheduleDecisionRequest;
import com.visitor.management.dto.RescheduleRequest;
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
import com.visitor.management.config.CorsOriginResolver;
import com.visitor.management.entity.NotificationType;
import com.visitor.management.entity.Organization;
import com.visitor.management.entity.Role;
import com.visitor.management.entity.VisitorAuditLog;
import com.visitor.management.entity.User;
import com.visitor.management.entity.Visitor;
import com.visitor.management.entity.VisitorStatus;
import com.visitor.management.entity.VisitorStatusHistoryEntry;
import com.visitor.management.entity.VisitorType;
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
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.time.DateTimeException;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
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
    private static final long DEFAULT_EXPECTED_DURATION_MINUTES = 60;
    private static final long EARLY_ENTRY_BUFFER_MINUTES = 60;
    private static final long POST_MEETING_GRACE_MINUTES = 60;
    private static final long ACCESS_WINDOW_EXPIRY_NOTICE_MINUTES = 15;
    private static final String RESCHEDULE_PENDING = "PENDING";
    private static final String RESCHEDULE_APPROVED = "APPROVED";
    private static final String RESCHEDULE_REJECTED = "REJECTED";

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
            "validityEndDate",
            "visitorType",
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
    private final CorsOriginResolver corsOriginResolver;
    private final VisitorNotificationService visitorNotificationService;
    private final NotificationService notificationService;
    private final OrganizationService organizationService;
    private final PhoneNumberService phoneNumberService;
    private final AccessAuditService accessAuditService;
    private final EmergencyOperationsService emergencyOperationsService;

    public VisitorService(
            VisitorRepository visitorRepository,
            UserRepository userRepository,
            VisitorAuditLogRepository visitorAuditLogRepository,
            MongoTemplate mongoTemplate,
            PaginationService paginationService,
            JwtService jwtService,
            QrCodeService qrCodeService,
            AppProperties appProperties,
            CorsOriginResolver corsOriginResolver,
            VisitorNotificationService visitorNotificationService,
            NotificationService notificationService,
            OrganizationService organizationService,
            PhoneNumberService phoneNumberService,
            AccessAuditService accessAuditService,
            EmergencyOperationsService emergencyOperationsService
    ) {
        this.visitorRepository = visitorRepository;
        this.userRepository = userRepository;
        this.visitorAuditLogRepository = visitorAuditLogRepository;
        this.mongoTemplate = mongoTemplate;
        this.paginationService = paginationService;
        this.jwtService = jwtService;
        this.qrCodeService = qrCodeService;
        this.appProperties = appProperties;
        this.corsOriginResolver = corsOriginResolver;
        this.visitorNotificationService = visitorNotificationService;
        this.notificationService = notificationService;
        this.organizationService = organizationService;
        this.phoneNumberService = phoneNumberService;
        this.accessAuditService = accessAuditService;
        this.emergencyOperationsService = emergencyOperationsService;
    }

    public VisitorResponse create(VisitorCreateRequest request) {
        return create(request, null);
    }

    @CacheEvict(value = {"adminAnalytics", "statusSummary"}, allEntries = true)
    public VisitorResponse createForVisitorAccount(VisitorVisitRequest request, User account, String idempotencyKey) {
        Instant now = Instant.now();
        Organization organization = account.getOrganizationId() != null
                ? organizationService.requireActive(account.getOrganizationId())
                : organizationService.resolveRequired(request.companyCode(), request.companyName());
        String clientRequestId = normalizeClientRequestId(idempotencyKey == null ? request.clientRequestId() : idempotencyKey);
        if (clientRequestId != null) {
            Visitor existing = visitorRepository.findByClientRequestIdAndEmailIgnoreCase(clientRequestId, account.getEmail()).orElse(null);
            if (existing != null) {
                return toResponse(existing);
            }
        }
        Visitor visitor = new Visitor();
        visitor.setClientRequestId(clientRequestId);
        visitor.setFullName(requiredTrim(account.getFullName(), "Account name is required."));
        applyPhone(visitor, request.phoneCountryCode() != null ? request.phoneCountryCode() : account.getPhoneCountryCode(), request.phone() != null ? request.phone() : account.getPhone(), true);
        visitor.setEmail(account.getEmail());
        applyOrganization(visitor, organization);
        visitor.setPurposeOfVisit(requiredTrim(request.purposeOfVisit(), "Purpose of visit is required."));
        visitor.setHostEmployeeId(resolveHostEmployeeId(request.hostEmployeeId(), request.hostEmployee(), null, visitor.getOrganizationId()));
        visitor.setHostEmployee(resolveHostEmployeeName(request.hostEmployee(), visitor.getHostEmployeeId()));
        visitor.setHostEmployeeDepartment(resolveHostDepartment(visitor.getHostEmployeeId()));
        applyOneTimeSchedule(
                visitor,
                request.scheduledStartTime(),
                request.scheduledEndTime(),
                request.expectedDurationMinutes(),
                request.timezone(),
                now,
                false
        );
        visitor.setPhotoUrl(requiredTrim(request.photoUrl(), "Visitor photo is required."));
        visitor.setPhotoPublicId(requiredTrim(request.photoPublicId(), "Visitor photo is required."));
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
        visitor = ensurePassSecurityState(visitor);
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
        applyPhone(visitor, request.phoneCountryCode(), request.phone(), true);
        visitor.setEmail(trimToNull(request.email()));
        applyOrganization(visitor, organization);
        visitor.setPurposeOfVisit(requiredTrim(request.purposeOfVisit(), "Purpose of visit is required."));
        visitor.setHostEmployeeId(resolveHostEmployeeId(request.hostEmployeeId(), request.hostEmployee(), forcedHostEmployeeId, visitor.getOrganizationId()));
        visitor.setHostEmployee(resolveHostEmployeeName(request.hostEmployee(), visitor.getHostEmployeeId()));
        visitor.setHostEmployeeDepartment(resolveHostDepartment(visitor.getHostEmployeeId()));
        applyVisitorTypeProfile(visitor, request, actor);
        boolean preApprovedInvite = Boolean.TRUE.equals(request.preApprovedInvite()) && actor != null;
        if (isRecurringVisitor(visitor) || isImmediateAccessVisitor(visitor) || preApprovedInvite) {
            requireNoEmergencyLockdown(organization.getId(), "Visitor approvals are suspended during emergency lockdown.");
        }
        applyOneTimeSchedule(
                visitor,
                request.scheduledStartTime(),
                request.scheduledEndTime(),
                request.expectedDurationMinutes(),
                request.timezone(),
                now,
                shouldRequireSchedule(visitor, actor)
        );
        visitor.setPhotoUrl(requiredTrim(request.photoUrl(), "Visitor photo is required."));
        visitor.setPhotoPublicId(requiredTrim(request.photoPublicId(), "Visitor photo is required."));
        if (isRecurringVisitor(visitor)) {
            visitor.setPreApproved(true);
            visitor.setStatus(VisitorStatus.APPROVED);
            visitor.setApprovedAt(now);
            visitor.setApprovedBy(actorId);
            issuePassCredentials(visitor, now);
        } else if (isImmediateAccessVisitor(visitor) || preApprovedInvite) {
            visitor.setPreApproved(preApprovedInvite);
            visitor.setStatus(VisitorStatus.APPROVED);
            visitor.setApprovedAt(now);
            visitor.setApprovedBy(actorId);
            issuePassCredentials(visitor, now);
        } else {
            visitor.setStatus(VisitorStatus.PENDING);
            visitor.setApprovalExpiresAt(now.plusSeconds(appProperties.getVisitors().getPendingApprovalTtlMinutes() * 60));
        }
        visitor.setCreatedAt(now);
        visitor.setUpdatedAt(now);
        enforceActiveVisitorRules(visitor);
        String action = isRecurringVisitor(visitor) ? "RECURRING_PROFILE_CREATED" : preApprovedInvite ? "INVITE_PRE_REGISTERED" : isImmediateAccessVisitor(visitor) ? "IMMEDIATE_ACCESS_REGISTERED" : "REGISTERED";
        String note = isRecurringVisitor(visitor) ? "Recurring visitor profile approved and reusable badge issued." : preApprovedInvite ? "Visitor completed a pre-registration invite and a temporary pass was issued." : isImmediateAccessVisitor(visitor) ? "Walk-in or emergency access approved at registration." : "Approval requested.";
        addHistory(visitor, visitor.getStatus(), action, actorId != null ? actorId : visitor.getHostEmployeeId(), note, now);
        Visitor saved = visitorRepository.save(visitor);
        audit(saved.getId(), null, saved.getStatus(), action, actorId != null ? actorId : visitor.getHostEmployeeId(), note, now);
        if (isRecurringVisitor(saved) || preApprovedInvite) {
            visitorNotificationService.visitorApproved(saved);
        } else {
            visitorNotificationService.visitorApprovalRequested(saved);
        }
        return toResponse(saved);
    }

    @CacheEvict(value = {"adminAnalytics", "statusSummary"}, allEntries = true)
    public VisitorResponse preApprove(PreApprovalRequest request, String hostEmployeeId) {
        User actor = currentUser(hostEmployeeId);
        Organization organization = organizationFor(actor, request.companyCode(), request.companyName());
        requireNoEmergencyLockdown(organization.getId(), "Visitor pre-approvals are suspended during emergency lockdown.");
        Instant now = Instant.now();
        Instant start = request.scheduledStartTime();
        Instant end = request.scheduledEndTime();
        String timezone = resolveTimezone(request.timezone(), organization.getTimezone());
        validateScheduleWindow(start, end, now);

        Visitor visitor = new Visitor();
        visitor.setFullName(requiredTrim(request.fullName(), "Full name is required."));
        applyPhone(visitor, request.phoneCountryCode(), request.phone(), true);
        visitor.setEmail(trimToNull(request.email()));
        applyOrganization(visitor, organization);
        visitor.setPurposeOfVisit(requiredTrim(request.purposeOfVisit(), "Purpose of visit is required."));
        visitor.setHostEmployeeId(requiredTrim(hostEmployeeId, "Host employee is required."));
        visitor.setHostEmployee(resolveHostEmployeeName(null, hostEmployeeId));
        visitor.setHostEmployeeDepartment(resolveHostDepartment(hostEmployeeId));
        visitor.setScheduledStartTime(start);
        visitor.setScheduledEndTime(end);
        visitor.setScheduledTimezone(timezone);
        visitor.setExpectedDurationMinutes(Duration.between(start, end).toMinutes());
        applyControlledAccessWindow(visitor);
        visitor.setPreApproved(true);
        visitor.setStatus(VisitorStatus.APPROVED);
        visitor.setApprovedAt(now);
        visitor.setApprovedBy(hostEmployeeId);
        issuePassCredentials(visitor, now);
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
        requireNoEmergencyLockdown(visitor.getOrganizationId(), "Visitor approvals are suspended during emergency lockdown.");
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
        issuePassCredentials(visitor, now);
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
        clearPassCredentials(visitor);
        visitor.setUpdatedAt(now);
        addHistory(visitor, VisitorStatus.REJECTED, "REJECTED", actorId, note, now);
        Visitor saved = visitorRepository.save(visitor);
        audit(saved.getId(), from, VisitorStatus.REJECTED, "REJECTED", actorId, note, now);
        visitorNotificationService.visitorRejected(saved);
        return toResponse(saved);
    }

    @CacheEvict(value = {"adminAnalytics", "statusSummary"}, allEntries = true)
    public VisitorResponse denyEntry(String id, String reason, String actorId) {
        Visitor visitor = find(id);
        User actor = currentUser(actorId);
        requireOrganizationAccess(visitor, actor);
        if (visitor.getStatus() != VisitorStatus.PENDING && visitor.getStatus() != VisitorStatus.APPROVED) {
            throw new BadRequestException("Only pending or approved visitors can be denied at the gate.");
        }

        Instant now = Instant.now();
        VisitorStatus from = visitor.getStatus();
        String note = requiredTrim(reason, "A denial reason is required.");
        visitor.setStatus(VisitorStatus.REJECTED);
        visitor.setRejectedAt(now);
        visitor.setRejectedBy(actorId);
        visitor.setRejectionReason(note);
        clearPassCredentials(visitor);
        visitor.setUpdatedAt(now);
        addHistory(visitor, VisitorStatus.REJECTED, "DENIED_AT_GATE", actorId, note, now);
        Visitor saved = visitorRepository.save(visitor);
        audit(saved.getId(), from, VisitorStatus.REJECTED, "DENIED_AT_GATE", actorId, note, now);
        accessAuditService.recordVisitorAccess(actor, saved, "DENIED_AT_GATE", "DENIED", note);
        visitorNotificationService.visitorRejected(saved);
        notifySecurityTeams(actor, NotificationType.SECURITY_DENIED_ENTRY, "Denied entry recorded",
                "%s was denied at the checkpoint. Review the denial context if follow-up is needed.".formatted(saved.getFullName()), saved);
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
    public VisitorResponse requestReschedule(String id, RescheduleRequest request, String actorId) {
        Visitor visitor = find(id);
        User actor = currentUser(actorId);
        if (visitor.getEmail() == null || actor.getEmail() == null || !visitor.getEmail().equalsIgnoreCase(actor.getEmail())) {
            throw new ResourceNotFoundException("Visitor request was not found.");
        }
        if (actor.getOrganizationId() != null && !actor.getOrganizationId().equals(visitor.getOrganizationId())) {
            throw new ResourceNotFoundException("Visitor request was not found.");
        }
        if (isRecurringVisitor(visitor)) {
            throw new BadRequestException("Recurring visitor profiles use validity windows instead of meeting reschedules.");
        }
        Instant now = Instant.now();
        ScheduleCandidate candidate = scheduleCandidate(request.scheduledStartTime(), request.scheduledEndTime(), request.expectedDurationMinutes(), request.timezone(), visitor.getOrganizationTimezone(), now);
        visitor.setPendingScheduledStartTime(candidate.start());
        visitor.setPendingScheduledEndTime(candidate.end());
        visitor.setPendingScheduledTimezone(candidate.timezone());
        visitor.setRescheduleRequestedBy(actorId);
        visitor.setRescheduleRequestedAt(now);
        visitor.setRescheduleRequestNote(trimToNull(request.note()));
        visitor.setRescheduleStatus(RESCHEDULE_PENDING);
        visitor.setRescheduleRejectedAt(null);
        visitor.setRescheduleRejectedBy(null);
        visitor.setRescheduleRejectionReason(null);
        visitor.setUpdatedAt(now);
        addHistory(visitor, visitor.getStatus(), "RESCHEDULE_REQUESTED", actorId, visitor.getRescheduleRequestNote(), now);
        Visitor saved = visitorRepository.save(visitor);
        audit(saved.getId(), visitor.getStatus(), visitor.getStatus(), "RESCHEDULE_REQUESTED", actorId, visitor.getRescheduleRequestNote(), now);
        return toResponse(saved);
    }

    @CacheEvict(value = {"adminAnalytics", "statusSummary"}, allEntries = true)
    public VisitorResponse approveReschedule(String id, RescheduleDecisionRequest request, String hostEmployeeId) {
        Visitor visitor = find(id);
        requireHostAccess(visitor, hostEmployeeId);
        if (!RESCHEDULE_PENDING.equals(visitor.getRescheduleStatus())
                || visitor.getPendingScheduledStartTime() == null
                || visitor.getPendingScheduledEndTime() == null) {
            throw new BadRequestException("No pending reschedule request is available for this visitor.");
        }
        Instant now = Instant.now();
        if (!visitor.getPendingScheduledStartTime().isAfter(now)) {
            throw new BadRequestException("Pending reschedule request has expired.");
        }
        applyApprovedSchedule(
                visitor,
                visitor.getPendingScheduledStartTime(),
                visitor.getPendingScheduledEndTime(),
                visitor.getPendingScheduledTimezone(),
                hostEmployeeId,
                now
        );
        visitor.setRescheduleStatus(RESCHEDULE_APPROVED);
        visitor.setRescheduleApprovedAt(now);
        visitor.setRescheduleApprovedBy(hostEmployeeId);
        visitor.setPendingScheduledStartTime(null);
        visitor.setPendingScheduledEndTime(null);
        visitor.setPendingScheduledTimezone(null);
        String note = trimToNull(request == null ? null : request.note());
        addHistory(visitor, visitor.getStatus(), "RESCHEDULE_APPROVED", hostEmployeeId, note, now);
        Visitor saved = visitorRepository.save(visitor);
        audit(saved.getId(), visitor.getStatus(), visitor.getStatus(), "RESCHEDULE_APPROVED", hostEmployeeId, note, now);
        visitorNotificationService.visitorRescheduled(saved);
        return toResponse(saved);
    }

    @CacheEvict(value = {"adminAnalytics", "statusSummary"}, allEntries = true)
    public VisitorResponse rejectReschedule(String id, RescheduleDecisionRequest request, String hostEmployeeId) {
        Visitor visitor = find(id);
        requireHostAccess(visitor, hostEmployeeId);
        if (!RESCHEDULE_PENDING.equals(visitor.getRescheduleStatus())) {
            throw new BadRequestException("No pending reschedule request is available for this visitor.");
        }
        Instant now = Instant.now();
        String note = requiredTrim(request == null ? null : request.note(), "Reschedule rejection reason is required.");
        visitor.setRescheduleStatus(RESCHEDULE_REJECTED);
        visitor.setRescheduleRejectedAt(now);
        visitor.setRescheduleRejectedBy(hostEmployeeId);
        visitor.setRescheduleRejectionReason(note);
        visitor.setPendingScheduledStartTime(null);
        visitor.setPendingScheduledEndTime(null);
        visitor.setPendingScheduledTimezone(null);
        visitor.setUpdatedAt(now);
        addHistory(visitor, visitor.getStatus(), "RESCHEDULE_REJECTED", hostEmployeeId, note, now);
        Visitor saved = visitorRepository.save(visitor);
        audit(saved.getId(), visitor.getStatus(), visitor.getStatus(), "RESCHEDULE_REJECTED", hostEmployeeId, note, now);
        return toResponse(saved);
    }

    @CacheEvict(value = {"adminAnalytics", "statusSummary"}, allEntries = true)
    public VisitorResponse rescheduleForHost(String id, RescheduleRequest request, String hostEmployeeId) {
        Visitor visitor = find(id);
        requireHostAccess(visitor, hostEmployeeId);
        if (isRecurringVisitor(visitor)) {
            throw new BadRequestException("Recurring visitor profiles use validity windows instead of meeting reschedules.");
        }
        Instant now = Instant.now();
        ScheduleCandidate candidate = scheduleCandidate(request.scheduledStartTime(), request.scheduledEndTime(), request.expectedDurationMinutes(), request.timezone(), visitor.getOrganizationTimezone(), now);
        applyApprovedSchedule(visitor, candidate.start(), candidate.end(), candidate.timezone(), hostEmployeeId, now);
        visitor.setRescheduleStatus(RESCHEDULE_APPROVED);
        visitor.setRescheduleApprovedAt(now);
        visitor.setRescheduleApprovedBy(hostEmployeeId);
        visitor.setPendingScheduledStartTime(null);
        visitor.setPendingScheduledEndTime(null);
        visitor.setPendingScheduledTimezone(null);
        String note = trimToNull(request.note());
        addHistory(visitor, visitor.getStatus(), "HOST_RESCHEDULED", hostEmployeeId, note, now);
        Visitor saved = visitorRepository.save(visitor);
        audit(saved.getId(), visitor.getStatus(), visitor.getStatus(), "HOST_RESCHEDULED", hostEmployeeId, note, now);
        visitorNotificationService.visitorRescheduled(saved);
        return toResponse(saved);
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
        visitor = ensurePassSecurityState(visitor);
        return toPassResponse(visitor);
    }

    public VisitorPassResponse pass(String id, String actorId) {
        Visitor visitor = find(id);
        requireOrganizationAccess(visitor, currentUser(actorId));
        requirePassReady(visitor);
        visitor = ensurePassSecurityState(visitor);
        return toPassResponse(visitor);
    }

    public VisitorPassResponse markBadgePrinted(String id) {
        Visitor visitor = find(id);
        requirePassReady(visitor);
        visitor = ensurePassSecurityState(visitor);
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
        visitor = ensurePassSecurityState(visitor);
        Instant now = Instant.now();
        visitor.setBadgePrintedAt(now);
        addHistory(visitor, visitor.getStatus(), "BADGE_PRINTED", actorId, "Badge printed.", now);
        Visitor saved = visitorRepository.save(visitor);
        audit(saved.getId(), visitor.getStatus(), visitor.getStatus(), "BADGE_PRINTED", actorId, "Badge printed.", now);
        return toPassResponse(saved);
    }

    @CacheEvict(value = {"adminAnalytics", "statusSummary"}, allEntries = true)
    public VisitorResponse suspend(String id, String reason, String actorId) {
        Visitor visitor = find(id);
        requireOrganizationAccess(visitor, currentUser(actorId));
        if (!isRecurringVisitor(visitor)) {
            throw new BadRequestException("Only recurring visitor profiles can be suspended.");
        }
        Instant now = Instant.now();
        VisitorStatus from = visitor.getStatus();
        visitor.setStatus(VisitorStatus.SUSPENDED);
        visitor.setSuspendedAt(now);
        visitor.setSuspendedBy(actorId);
        visitor.setSuspensionReason(requiredTrim(reason, "Suspension reason is required."));
        visitor.setUpdatedAt(now);
        addHistory(visitor, VisitorStatus.SUSPENDED, "SUSPENDED", actorId, visitor.getSuspensionReason(), now);
        Visitor saved = visitorRepository.save(visitor);
        audit(saved.getId(), from, VisitorStatus.SUSPENDED, "SUSPENDED", actorId, visitor.getSuspensionReason(), now);
        return toResponse(saved);
    }

    @CacheEvict(value = {"adminAnalytics", "statusSummary"}, allEntries = true)
    public VisitorResponse revoke(String id, String reason, String actorId) {
        Visitor visitor = find(id);
        requireOrganizationAccess(visitor, currentUser(actorId));
        if (!isRecurringVisitor(visitor)) {
            throw new BadRequestException("Only recurring visitor profiles can be revoked.");
        }
        Instant now = Instant.now();
        VisitorStatus from = visitor.getStatus();
        visitor.setStatus(VisitorStatus.EXPIRED);
        visitor.setRevokedAt(now);
        visitor.setRevokedBy(actorId);
        visitor.setRevocationReason(requiredTrim(reason, "Revocation reason is required."));
        clearPassCredentials(visitor);
        visitor.setUpdatedAt(now);
        addHistory(visitor, VisitorStatus.EXPIRED, "REVOKED", actorId, visitor.getRevocationReason(), now);
        Visitor saved = visitorRepository.save(visitor);
        audit(saved.getId(), from, VisitorStatus.EXPIRED, "REVOKED", actorId, visitor.getRevocationReason(), now);
        return toResponse(saved);
    }

    @CacheEvict(value = {"adminAnalytics", "statusSummary"}, allEntries = true)
    public VisitorResponse reactivateRecurring(String id, String actorId) {
        Visitor visitor = find(id);
        requireOrganizationAccess(visitor, currentUser(actorId));
        if (!isRecurringVisitor(visitor)) {
            throw new BadRequestException("Only recurring visitor profiles can be reactivated.");
        }
        Instant now = Instant.now();
        if (visitor.getValidityEndDate() != null && !visitor.getValidityEndDate().isAfter(now)) {
            throw new BadRequestException("Expired recurring profiles require an updated validity end date before reactivation.");
        }
        VisitorStatus from = visitor.getStatus();
        visitor.setStatus(VisitorStatus.APPROVED);
        visitor.setSuspendedAt(null);
        visitor.setSuspendedBy(null);
        visitor.setSuspensionReason(null);
        if (visitor.getQrCode() == null || visitor.getPassTokenId() == null || visitor.getQrExpiresAt() == null || !visitor.getQrExpiresAt().isAfter(now)) {
            issuePassCredentials(visitor, now);
        }
        visitor.setUpdatedAt(now);
        addHistory(visitor, VisitorStatus.APPROVED, "REACTIVATED", actorId, "Recurring visitor profile reactivated.", now);
        Visitor saved = visitorRepository.save(visitor);
        audit(saved.getId(), from, VisitorStatus.APPROVED, "REACTIVATED", actorId, "Recurring visitor profile reactivated.", now);
        return toResponse(saved);
    }

    @CacheEvict(value = {"adminAnalytics", "statusSummary"}, allEntries = true)
    public VisitorResponse escalateIssue(String id, String reason, String actorId) {
        return recordSecurityIssue(id, actorId, reason, "SECURITY_ESCALATED", "SUCCESS");
    }

    @CacheEvict(value = {"adminAnalytics", "statusSummary"}, allEntries = true)
    public VisitorResponse reportMismatch(String id, String reason, String actorId) {
        return recordSecurityIssue(id, actorId, reason, "IDENTITY_MISMATCH_REPORTED", "FLAGGED");
    }

    public QrVerificationResponse verifyQrPayload(String scannedPayload) {
        return verifyQrPayload(scannedPayload, null);
    }

    public QrVerificationResponse verifyQrPayload(String scannedPayload, String actorId) {
        User actor = actorId == null ? null : currentUser(actorId);
        Instant now = Instant.now();
        String publicPassToken = resolvePublicPassToken(scannedPayload);
        if (publicPassToken != null) {
            return verifyPassToken(publicPassToken, actor, now);
        }

        String token = normalizeLegacyQrPayload(scannedPayload);
        Claims claims;
        try {
            claims = jwtService.parseClaims(token);
        } catch (JwtException | IllegalArgumentException ex) {
            return invalidVerification(
                    actor,
                    NotificationType.SECURITY_INVALID_QR_SCAN,
                    "INVALID_QR",
                    "Invalid QR pass",
                    "This badge could not be verified.",
                    "Ask the visitor to reopen the current pass or contact the workplace host."
            );
        }

        if (!"visitor-pass".equals(claims.get("type", String.class))) {
            return invalidVerification(
                    actor,
                    NotificationType.SECURITY_INVALID_QR_SCAN,
                    "INVALID_QR",
                    "Invalid QR pass",
                    "This code is not a supported AccessFlow visitor pass.",
                    "Use a current visitor badge issued by AccessFlow."
            );
        }

        String securePassId = claims.getSubject();
        String organizationReference = claims.get("organizationReference", String.class);
        String visitorReference = claims.get("visitorReference", String.class);
        String approvalState = claims.get("approvalState", String.class);
        String passCode = claims.get("passCode", String.class);
        Visitor visitor = visitorRepository.findByPassTokenId(securePassId)
                .or(() -> visitorRepository.findById(securePassId))
                .orElse(null);
        if (visitor == null) {
            return invalidVerification(
                    actor,
                    NotificationType.SECURITY_SUSPICIOUS_ACTIVITY,
                    "REVOKED_PASS",
                    "Pass no longer active",
                    "This visitor pass has been replaced, revoked, or is no longer recognized.",
                    "Ask security to issue the visitor's latest approved badge."
            );
        }

        if (!matchesTokenClaims(visitor, securePassId, organizationReference, visitorReference, approvalState, passCode)) {
            notifySecurityTeams(
                    actor,
                    NotificationType.SECURITY_SUSPICIOUS_ACTIVITY,
                    "Visitor pass mismatch detected",
                    "%s presented a pass that no longer matches the approved badge on file.".formatted(visitor.getFullName()),
                    visitor
            );
            return verificationResponse(
                    false,
                    true,
                    "REVOKED_PASS",
                    "Pass no longer active",
                    "This visitor pass no longer matches the approved badge on file.",
                    "Ask security to use the visitor's current pass before allowing entry.",
                    visitor,
                    now
            );
        }
        return evaluateVerification(visitor, actor, now);
    }

    public QrVerificationResponse verifyPassToken(String passToken) {
        return verifyPassToken(passToken, null, Instant.now());
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
        return checkIn(visitor, actorId, false, null);
    }

    @CacheEvict(value = {"adminAnalytics", "statusSummary"}, allEntries = true)
    public VisitorResponse checkInWithQr(String qrPayload, String actorId) {
        User actor = currentUser(actorId);
        QrVerificationResponse verification = verifyQrPayload(qrPayload, actorId);
        if (!verification.valid() || verification.visitorId() == null) {
            throw new BadRequestException("QR validation failed: " + verification.headline());
        }
        Visitor visitor = find(verification.visitorId());
        requireOrganizationAccess(visitor, actor);
        return checkIn(visitor, actorId, true, "QR scan validated: " + verification.resultCode());
    }

    @CacheEvict(value = {"adminAnalytics", "statusSummary"}, allEntries = true)
    public VisitorResponse overrideCheckIn(String id, ManualOverrideCheckInRequest request, String actorId) {
        Visitor visitor = find(id);
        requireOrganizationAccess(visitor, currentUser(actorId));
        String reason = requiredTrim(request == null ? null : request.reason(), "Override reason is required.");
        return checkIn(visitor, actorId, true, "Manual override: " + reason);
    }

    private VisitorResponse checkIn(Visitor visitor, String actorId) {
        return checkIn(visitor, actorId, false, null);
    }

    private VisitorResponse checkIn(Visitor visitor, String actorId, boolean qrValidatedOrOverride, String noteOverride) {
        Instant now = Instant.now();
        requireNoEmergencyLockdown(visitor.getOrganizationId(), "New visitor check-ins are blocked while emergency lockdown is active.");
        if (visitor.getStatus() == VisitorStatus.CHECKED_IN) {
            throw new BadRequestException("Visitor is already checked in.");
        }
        if (visitor.getStatus() == VisitorStatus.CHECKED_OUT && !isRecurringVisitor(visitor)) {
            throw new BadRequestException("Checked-out visitors cannot be checked in again.");
        }
        if (visitor.getStatus() == VisitorStatus.SUSPENDED) {
            throw new BadRequestException("Suspended visitors cannot be checked in.");
        }
        if (visitor.getStatus() != VisitorStatus.APPROVED && !(isRecurringVisitor(visitor) && visitor.getStatus() == VisitorStatus.CHECKED_OUT)) {
            throw new BadRequestException("Only approved visitors can be checked in.");
        }
        if (visitor.isPreApproved() && !qrValidatedOrOverride) {
            throw new BadRequestException("Pre-approved visitors must be checked in by scanning and validating their QR badge.");
        }
        requireVisitorWithinAllowedWindow(visitor, now);

        VisitorStatus from = visitor.getStatus();
        visitor.setCheckInTime(now);
        visitor.setCheckOutTime(null);
        visitor.setStatus(VisitorStatus.CHECKED_IN);
        visitor.setUpdatedAt(now);
        String action = noteOverride != null && noteOverride.startsWith("Manual override:") ? "MANUAL_OVERRIDE_CHECK_IN" : "CHECKED_IN";
        String note = noteOverride != null ? noteOverride : "Visitor checked in.";
        addHistory(visitor, VisitorStatus.CHECKED_IN, action, actorId, note, now);
        Visitor saved = visitorRepository.save(visitor);
        audit(saved.getId(), from, VisitorStatus.CHECKED_IN, action, actorId, note, now);
        visitorNotificationService.visitorCheckedIn(saved);
        if ("MANUAL_OVERRIDE_CHECK_IN".equals(action) && actorId != null) {
            notifySecurityTeams(
                    currentUser(actorId),
                    NotificationType.SECURITY_MANUAL_OVERRIDE,
                    "Manual checkpoint override",
                    "%s was checked in using a documented manual override.".formatted(saved.getFullName()),
                    saved
            );
        }
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
        ZoneId timezone = organizationZoneId(actor);
        Instant start = LocalDate.now(timezone).atStartOfDay(timezone).toInstant();
        Instant end = LocalDate.now(timezone).plusDays(1).atStartOfDay(timezone).toInstant();
        String organizationId = scopeOrganizationId(actor);
        return List.of(
                Map.of("label", "Visitors today", "value", countCheckIns(organizationId, start, end), "note", "Checked in since midnight " + timezone.getId()),
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
                        "approvedVisitors", countForMonitoring(organizationId, query, Criteria.where("status").is(VisitorStatus.APPROVED)),
                        "activeRecurringVisitors", countForMonitoring(organizationId, query, activeRecurringCriteria(now)),
                        "expiredRecurringVisitors", countForMonitoring(organizationId, query, expiredRecurringCriteria(now)),
                        "suspendedVisitors", countForMonitoring(organizationId, query, Criteria.where("status").is(VisitorStatus.SUSPENDED)),
                        "dailyAttendanceLogs", countForMonitoring(organizationId, query, dailyAttendanceCriteria(now, actor))
                ),
                monitorVisitors(organizationId, query, Criteria.where("status").is(VisitorStatus.CHECKED_IN), Sort.by(Sort.Direction.DESC, "checkInTime")),
                monitorVisitors(organizationId, query, overdueCriteria(now), Sort.by(Sort.Direction.ASC, "scheduledEndTime").and(Sort.by(Sort.Direction.ASC, "qrExpiresAt"))),
                monitorVisitors(organizationId, query, Criteria.where("status").is(VisitorStatus.CHECKED_OUT), Sort.by(Sort.Direction.DESC, "checkOutTime")),
                monitorVisitors(organizationId, query, Criteria.where("status").is(VisitorStatus.REJECTED), Sort.by(Sort.Direction.DESC, "rejectedAt")),
                monitorVisitors(organizationId, query, Criteria.where("status").is(VisitorStatus.APPROVED), Sort.by(Sort.Direction.ASC, "scheduledStartTime").and(Sort.by(Sort.Direction.DESC, "createdAt"))),
                monitorVisitors(organizationId, query, activeRecurringCriteria(now), Sort.by(Sort.Direction.ASC, "validityEndDate").and(Sort.by(Sort.Direction.ASC, "fullName"))),
                monitorVisitors(organizationId, query, expiredRecurringCriteria(now), Sort.by(Sort.Direction.DESC, "validityEndDate")),
                monitorVisitors(organizationId, query, Criteria.where("status").is(VisitorStatus.SUSPENDED), Sort.by(Sort.Direction.DESC, "suspendedAt")),
                monitorVisitors(organizationId, query, dailyAttendanceCriteria(now, actor), Sort.by(Sort.Direction.DESC, "checkInTime").and(Sort.by(Sort.Direction.DESC, "checkOutTime")))
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
                "expired", countStatus(organizationId, VisitorStatus.EXPIRED),
                "suspended", countStatus(organizationId, VisitorStatus.SUSPENDED)
        );
    }

    @CacheEvict(value = {"adminAnalytics", "statusSummary"}, allEntries = true)
    public int expireDueVisitors() {
        Instant now = Instant.now();
        Query query = new Query(new Criteria().orOperator(
                Criteria.where("status").is(VisitorStatus.PENDING).and("approvalExpiresAt").lte(now),
                Criteria.where("status").is(VisitorStatus.APPROVED).and("accessWindowEndTime").lte(now),
                Criteria.where("status").is(VisitorStatus.APPROVED).and("qrExpiresAt").lte(now),
                new Criteria().andOperator(
                        Criteria.where("visitorType").in(VisitorType.RECURRING, VisitorType.CONTRACTOR_VENDOR),
                        Criteria.where("status").in(VisitorStatus.APPROVED, VisitorStatus.CHECKED_IN, VisitorStatus.CHECKED_OUT),
                        Criteria.where("validityEndDate").lte(now)
                )
        ));

        List<Visitor> dueVisitors = mongoTemplate.find(query, Visitor.class);
        dueVisitors.forEach(visitor -> expireVisitor(visitor, now));
        return dueVisitors.size();
    }

    @CacheEvict(value = {"adminAnalytics", "statusSummary"}, allEntries = true)
    public int notifyExpiringVisitorWindows() {
        Instant now = Instant.now();
        Instant threshold = now.plus(Duration.ofMinutes(ACCESS_WINDOW_EXPIRY_NOTICE_MINUTES));
        Query query = new Query(new Criteria().orOperator(
                Criteria.where("status").is(VisitorStatus.APPROVED).and("accessWindowEndTime").gt(now).lte(threshold),
                Criteria.where("status").is(VisitorStatus.CHECKED_IN).and("accessWindowEndTime").gt(now).lte(threshold)
        ));

        List<Visitor> expiringVisitors = mongoTemplate.find(query, Visitor.class);
        expiringVisitors.forEach(visitorNotificationService::visitorAccessWindowExpiring);
        return expiringVisitors.size();
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
                    Criteria.where("vendorCompanyName").regex(pattern),
                    Criteria.where("purposeOfVisit").regex(pattern),
                    Criteria.where("hostEmployee").regex(pattern),
                    Criteria.where("department").regex(pattern),
                    Criteria.where("visitorType").regex(pattern),
                    Criteria.where("qrCode").regex(pattern),
                    Criteria.where("badgeId").regex(pattern)
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
        if (request.phone() != null || request.phoneCountryCode() != null) {
            applyPhone(visitor, request.phoneCountryCode() != null ? request.phoneCountryCode() : visitor.getPhoneCountryCode(), request.phone(), false);
        }
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
        setIfPresent(request.photoUrl(), value -> visitor.setPhotoUrl(requiredTrim(value, "Visitor photo cannot be removed.")));
        setIfPresent(request.photoPublicId(), value -> visitor.setPhotoPublicId(requiredTrim(value, "Visitor photo cannot be removed.")));
        applyVisitorTypeProfile(visitor, request);
        applyOneTimeSchedule(
                visitor,
                request.scheduledStartTime(),
                request.scheduledEndTime(),
                request.expectedDurationMinutes(),
                request.timezone(),
                Instant.now(),
                false
        );
        if (request.status() != null) {
            applyDirectStatusUpdate(visitor, request.status());
        }
        visitor.setUpdatedAt(Instant.now());
    }

    private void applyVisitorTypeProfile(Visitor visitor, VisitorCreateRequest request, User actor) {
        VisitorType requestedType = request.visitorType() == null ? VisitorType.ONE_TIME : request.visitorType();
        if ((requestedType == VisitorType.RECURRING || requestedType == VisitorType.CONTRACTOR_VENDOR)
                && actor != null
                && !hasRole(actor, Role.SECURITY_GUARD)
                && !hasRole(actor, Role.ADMIN)
                && !hasRole(actor, Role.SUPER_ADMIN)) {
            throw new BadRequestException("Only security or admin users can create recurring visitor profiles.");
        }
        visitor.setVisitorType(requestedType);
        visitor.setVendorCompanyName(trimToNull(request.vendorCompanyName()));
        visitor.setSponsorEmployee(trimToNull(request.sponsorEmployee()));
        visitor.setDepartment(trimToNull(request.department()));
        visitor.setValidityStartDate(request.validityStartDate());
        visitor.setValidityEndDate(request.validityEndDate());
        visitor.setRecurringSchedule(trimToNull(request.recurringSchedule()));
        visitor.setAllowedWeekdays(normalizeWeekdays(request.allowedWeekdays()));
        visitor.setAllowedEntryStartTime(normalizeEntryTime(request.allowedEntryStartTime(), "Allowed entry start time is invalid."));
        visitor.setAllowedEntryEndTime(normalizeEntryTime(request.allowedEntryEndTime(), "Allowed entry end time is invalid."));
        visitor.setEmergencyContact(trimToNull(request.emergencyContact()));
        visitor.setNotes(trimToNull(request.notes()));
        validateRecurringProfile(visitor);
    }

    private void applyVisitorTypeProfile(Visitor visitor, VisitorUpdateRequest request) {
        if (request.visitorType() != null) {
            visitor.setVisitorType(request.visitorType());
        }
        setIfPresent(request.vendorCompanyName(), value -> visitor.setVendorCompanyName(trimToNull(value)));
        setIfPresent(request.sponsorEmployee(), value -> visitor.setSponsorEmployee(trimToNull(value)));
        setIfPresent(request.department(), value -> visitor.setDepartment(trimToNull(value)));
        if (request.validityStartDate() != null) {
            visitor.setValidityStartDate(request.validityStartDate());
        }
        if (request.validityEndDate() != null) {
            visitor.setValidityEndDate(request.validityEndDate());
            if (isRecurringVisitor(visitor) && visitor.getQrExpiresAt() != null) {
                visitor.setQrExpiresAt(request.validityEndDate());
            }
        }
        setIfPresent(request.recurringSchedule(), value -> visitor.setRecurringSchedule(trimToNull(value)));
        if (request.allowedWeekdays() != null) {
            visitor.setAllowedWeekdays(normalizeWeekdays(request.allowedWeekdays()));
        }
        setIfPresent(request.allowedEntryStartTime(), value -> visitor.setAllowedEntryStartTime(normalizeEntryTime(value, "Allowed entry start time is invalid.")));
        setIfPresent(request.allowedEntryEndTime(), value -> visitor.setAllowedEntryEndTime(normalizeEntryTime(value, "Allowed entry end time is invalid.")));
        setIfPresent(request.emergencyContact(), value -> visitor.setEmergencyContact(trimToNull(value)));
        setIfPresent(request.notes(), value -> visitor.setNotes(trimToNull(value)));
        validateRecurringProfile(visitor);
    }

    private void applyOneTimeSchedule(
            Visitor visitor,
            Instant requestedStart,
            Instant requestedEnd,
            Long expectedDurationMinutes,
            String timezone,
            Instant now,
            boolean required
    ) {
        if (isRecurringVisitor(visitor)) {
            return;
        }
        if (requestedStart == null && requestedEnd == null && expectedDurationMinutes == null) {
            if (required) {
                throw new BadRequestException("Visit date and expected arrival time are required.");
            }
            if (isImmediateAccessVisitor(visitor) && visitor.getScheduledStartTime() == null) {
                ScheduleCandidate candidate = scheduleCandidate(now.plusSeconds(60), null, DEFAULT_EXPECTED_DURATION_MINUTES, timezone, visitor.getOrganizationTimezone(), now);
                applyScheduleFields(visitor, now, candidate.start(), candidate.end(), candidate.timezone());
            }
            return;
        }
        ScheduleCandidate candidate = scheduleCandidate(requestedStart, requestedEnd, expectedDurationMinutes, timezone, visitor.getOrganizationTimezone(), now);
        applyScheduleFields(visitor, now, candidate.start(), candidate.end(), candidate.timezone());
    }

    private ScheduleCandidate scheduleCandidate(
            Instant requestedStart,
            Instant requestedEnd,
            Long expectedDurationMinutes,
            String timezone,
            String fallbackTimezone,
            Instant now
    ) {
        if (requestedStart == null) {
            throw new BadRequestException("Visit date and expected arrival time are required.");
        }
        long durationMinutes = expectedDurationMinutes == null ? DEFAULT_EXPECTED_DURATION_MINUTES : expectedDurationMinutes;
        if (durationMinutes < MIN_VISIT_WINDOW_MINUTES || durationMinutes > MAX_VISIT_WINDOW_HOURS * 60) {
            throw new BadRequestException("Expected duration must be between 15 minutes and 24 hours.");
        }
        Instant end = requestedEnd != null ? requestedEnd : requestedStart.plus(Duration.ofMinutes(durationMinutes));
        validateScheduleWindow(requestedStart, end, now);
        return new ScheduleCandidate(requestedStart, end, resolveTimezone(timezone, fallbackTimezone));
    }

    private void applyScheduleFields(Visitor visitor, Instant now, Instant start, Instant end, String timezone) {
        visitor.setScheduledStartTime(start);
        visitor.setScheduledEndTime(end);
        visitor.setScheduledTimezone(timezone);
        visitor.setExpectedDurationMinutes(Duration.between(start, end).toMinutes());
        applyControlledAccessWindow(visitor);
        if (visitor.getQrCode() != null && visitor.getStatus() == VisitorStatus.APPROVED) {
            issuePassCredentials(visitor, now);
        }
    }

    private void applyApprovedSchedule(Visitor visitor, Instant start, Instant end, String timezone, String actorId, Instant now) {
        if (visitor.getOriginalScheduledStartTime() == null && visitor.getScheduledStartTime() != null) {
            visitor.setOriginalScheduledStartTime(visitor.getScheduledStartTime());
            visitor.setOriginalScheduledEndTime(visitor.getScheduledEndTime());
        }
        applyScheduleFields(visitor, now, start, end, timezone);
        visitor.setScheduleUpdatedBy(actorId);
        visitor.setScheduleUpdatedAt(now);
        visitor.setUpdatedAt(now);
    }

    private void applyControlledAccessWindow(Visitor visitor) {
        if (visitor.getScheduledStartTime() == null || visitor.getScheduledEndTime() == null) {
            visitor.setAccessWindowStartTime(null);
            visitor.setAccessWindowEndTime(null);
            return;
        }
        visitor.setAccessWindowStartTime(visitor.getScheduledStartTime().minus(Duration.ofMinutes(EARLY_ENTRY_BUFFER_MINUTES)));
        visitor.setAccessWindowEndTime(visitor.getScheduledEndTime().plus(Duration.ofMinutes(POST_MEETING_GRACE_MINUTES)));
    }

    private boolean shouldRequireSchedule(Visitor visitor, User actor) {
        if (isRecurringVisitor(visitor) || isImmediateAccessVisitor(visitor)) {
            return false;
        }
        return actor == null || !hasRole(actor, Role.SECURITY_GUARD);
    }

    private void validateRecurringProfile(Visitor visitor) {
        if (!isRecurringVisitor(visitor)) {
            return;
        }
        if (visitor.getValidityStartDate() == null || visitor.getValidityEndDate() == null) {
            throw new BadRequestException("Recurring visitors require validity start and end dates.");
        }
        if (!visitor.getValidityEndDate().isAfter(visitor.getValidityStartDate())) {
            throw new BadRequestException("Recurring visitor validity end date must be after the start date.");
        }
        String start = trimToNull(visitor.getAllowedEntryStartTime());
        String end = trimToNull(visitor.getAllowedEntryEndTime());
        if ((start == null) != (end == null)) {
            throw new BadRequestException("Recurring visitors require both allowed entry start and end times.");
        }
        if (start != null && !LocalTime.parse(end).isAfter(LocalTime.parse(start))) {
            throw new BadRequestException("Allowed entry end time must be after the start time.");
        }
    }

    private List<String> normalizeWeekdays(List<String> weekdays) {
        if (weekdays == null) {
            return List.of();
        }
        return weekdays.stream()
                .map(this::trimToNull)
                .filter(value -> value != null)
                .map(value -> value.toUpperCase(Locale.ROOT))
                .map(value -> value.length() >= 3 ? value.substring(0, 3) : value)
                .distinct()
                .peek(value -> {
                    if (!Set.of("MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN").contains(value)) {
                        throw new BadRequestException("Allowed weekdays must use MON, TUE, WED, THU, FRI, SAT, or SUN.");
                    }
                })
                .toList();
    }

    private String normalizeEntryTime(String value, String message) {
        String trimmed = trimToNull(value);
        if (trimmed == null) {
            return null;
        }
        try {
            return LocalTime.parse(trimmed).toString();
        } catch (DateTimeException ex) {
            throw new BadRequestException(message);
        }
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
            qrCode = "AFP-" + UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
        } while (visitorRepository.findByQrCode(qrCode).isPresent());
        return qrCode;
    }

    private String generateBadgeId() {
        return "AFB-" + UUID.randomUUID().toString().replace("-", "").substring(0, 12).toUpperCase();
    }

    private VisitorResponse toResponse(Visitor visitor) {
        return new VisitorResponse(
                visitor.getId(),
                visitor.getFullName(),
                visitor.getPhone(),
                visitor.getPhoneCountryCode(),
                visitor.getEmail(),
                visitor.getCompanyName(),
                visitor.getOrganizationId(),
                visitor.getOrganizationName(),
                visitor.getOrganizationCode(),
                organizationTimezone(visitor),
                visitor.getOrganizationRegionCountry(),
                visitor.getPurposeOfVisit(),
                visitor.getVisitorType() == null ? VisitorType.ONE_TIME : visitor.getVisitorType(),
                visitor.getVendorCompanyName(),
                visitor.getHostEmployee(),
                hostDepartmentFor(visitor),
                visitor.getSponsorEmployee(),
                visitor.getDepartment(),
                visitor.getValidityStartDate(),
                visitor.getValidityEndDate(),
                visitor.getRecurringSchedule(),
                visitor.getAllowedWeekdays() == null ? List.of() : visitor.getAllowedWeekdays(),
                visitor.getAllowedEntryStartTime(),
                visitor.getAllowedEntryEndTime(),
                visitor.getEmergencyContact(),
                visitor.getNotes(),
                visitor.getPhotoUrl(),
                visitor.getHostEmployeeId(),
                resolveBadgeId(visitor),
                visitor.getCheckInTime(),
                visitor.getCheckOutTime(),
                visitor.getScheduledStartTime(),
                visitor.getScheduledEndTime(),
                visitor.getScheduledTimezone(),
                visitor.getAccessWindowStartTime(),
                visitor.getAccessWindowEndTime(),
                visitor.getExpectedDurationMinutes(),
                visitor.getOriginalScheduledStartTime(),
                visitor.getOriginalScheduledEndTime(),
                visitor.getPendingScheduledStartTime(),
                visitor.getPendingScheduledEndTime(),
                visitor.getPendingScheduledTimezone(),
                visitor.getRescheduleRequestedBy(),
                visitor.getRescheduleRequestedAt(),
                visitor.getRescheduleRequestNote(),
                visitor.getRescheduleStatus(),
                visitor.getScheduleUpdatedBy(),
                visitor.getScheduleUpdatedAt(),
                visitor.getRescheduleApprovedAt(),
                visitor.getRescheduleApprovedBy(),
                visitor.getRescheduleRejectedAt(),
                visitor.getRescheduleRejectedBy(),
                visitor.getRescheduleRejectionReason(),
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
                visitor.getSuspendedAt(),
                visitor.getSuspendedBy(),
                visitor.getSuspensionReason(),
                visitor.getRevokedAt(),
                visitor.getRevokedBy(),
                visitor.getRevocationReason(),
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
        String verificationUrl = verificationUrl(visitor);
        Instant now = Instant.now();
        return new VisitorPassResponse(
                visitor.getId(),
                resolveBadgeId(visitor),
                visitor.getFullName(),
                visitor.getCompanyName(),
                visitor.getOrganizationName(),
                visitor.getOrganizationCode(),
                organizationTimezone(visitor),
                visitor.getPurposeOfVisit(),
                visitor.getVisitorType() == null ? VisitorType.ONE_TIME : visitor.getVisitorType(),
                visitor.getVendorCompanyName(),
                visitor.getHostEmployee(),
                hostDepartmentFor(visitor),
                visitor.getSponsorEmployee(),
                visitor.getDepartment(),
                visitor.getValidityStartDate(),
                visitor.getValidityEndDate(),
                visitor.getRecurringSchedule(),
                visitor.getAllowedWeekdays() == null ? List.of() : visitor.getAllowedWeekdays(),
                visitor.getAllowedEntryStartTime(),
                visitor.getAllowedEntryEndTime(),
                visitor.getPhotoUrl(),
                visitor.getStatus(),
                displayStatus(visitor.getStatus()),
                checkInState(visitor, now),
                isPassValid(visitor, now),
                passValidityStatus(visitor, now),
                visitor.getQrCode(),
                verificationUrl,
                verificationUrl,
                qrCodeService.dataUri(verificationUrl),
                visitor.getQrIssuedAt(),
                visitor.getQrExpiresAt(),
                visitor.getApprovedAt(),
                visitor.getScheduledStartTime(),
                visitor.getScheduledEndTime(),
                visitor.getAccessWindowStartTime(),
                visitor.getAccessWindowEndTime(),
                visitor.getExpectedDurationMinutes(),
                visitor.getCheckInTime(),
                visitor.getCheckOutTime(),
                visitor.getBadgePrintedAt()
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
        if (actor != null && !hasRole(actor, Role.SUPER_ADMIN)) {
            String organizationId = requiredTrim(actor.getOrganizationId(), "Authenticated organization scope is required.");
            return organizationService.requireActive(organizationId);
        }
        return organizationService.resolveRequired(companyCode, companyName);
    }

    private void applyOrganization(Visitor visitor, Organization organization) {
        visitor.setOrganizationId(organization.getId());
        visitor.setOrganizationCode(organization.getCompanyCode());
        visitor.setOrganizationName(organization.getCompanyName());
        visitor.setOrganizationTimezone(organization.getTimezone());
        visitor.setOrganizationRegionCountry(organization.getRegionCountry());
        visitor.setCompanyName(organization.getCompanyName());
    }

    private void applyPhone(Visitor visitor, String countryCode, String phone, boolean required) {
        PhoneNumberService.NormalizedPhone normalizedPhone = phoneNumberService.normalize(countryCode, phone, required);
        if (normalizedPhone == null) {
            return;
        }
        visitor.setPhone(normalizedPhone.e164());
        visitor.setPhoneCountryCode(normalizedPhone.countryCode());
    }

    private String organizationTimezone(Visitor visitor) {
        String timezone = trimToNull(visitor.getOrganizationTimezone());
        return timezone == null ? "UTC" : timezone;
    }

    private ZoneId organizationZoneId(User actor) {
        if (actor == null || hasRole(actor, Role.SUPER_ADMIN)) {
            return ZoneOffset.UTC;
        }
        String timezone = null;
        if (trimToNull(actor.getOrganizationId()) != null) {
            try {
                timezone = trimToNull(organizationService.requireActive(actor.getOrganizationId()).getTimezone());
            } catch (RuntimeException ex) {
                timezone = null;
            }
        }
        if (timezone == null) {
            timezone = trimToNull(actor.getOrganizationTimezone());
        }
        try {
            return timezone == null ? ZoneOffset.UTC : ZoneId.of(timezone);
        } catch (DateTimeException ex) {
            return ZoneOffset.UTC;
        }
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

    private String normalizeClientRequestId(String value) {
        String trimmed = trimToNull(value);
        if (trimmed == null) {
            return null;
        }
        return trimmed.replaceAll("[^a-zA-Z0-9._:-]", "-").substring(0, Math.min(trimmed.length(), 120));
    }

    private void requireNoEmergencyLockdown(String organizationId, String message) {
        if (emergencyOperationsService.isLockdownActiveForOrganization(organizationId)) {
            throw new BadRequestException(message);
        }
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
        if (trimToNull(visitor.getPhotoUrl()) == null || trimToNull(visitor.getPhotoPublicId()) == null) {
            throw new BadRequestException("Visitor photo is required before badge verification.");
        }
        if (visitor.getStatus() != VisitorStatus.APPROVED
                && visitor.getStatus() != VisitorStatus.CHECKED_IN
                && !(isRecurringVisitor(visitor) && visitor.getStatus() == VisitorStatus.CHECKED_OUT)) {
            throw new BadRequestException("A visitor pass is available only after approval.");
        }
        if (visitor.getQrCode() == null || visitor.getQrExpiresAt() == null || visitor.getQrExpiresAt().isBefore(Instant.now())) {
            throw new BadRequestException("Visitor pass is missing or expired.");
        }
        if (isRecurringVisitor(visitor)) {
            requireRecurringWithinValidity(visitor, Instant.now());
        }
    }

    private boolean isRecurringVisitor(Visitor visitor) {
        VisitorType type = visitor.getVisitorType();
        return type == VisitorType.RECURRING || type == VisitorType.CONTRACTOR_VENDOR;
    }

    private boolean isImmediateAccessVisitor(Visitor visitor) {
        VisitorType type = visitor.getVisitorType();
        return type == VisitorType.WALK_IN || type == VisitorType.EMERGENCY;
    }

    private String normalizeLegacyQrPayload(String scannedPayload) {
        String value = requiredTrim(scannedPayload, "QR payload is required.");
        if (value.startsWith(QR_PAYLOAD_PREFIX)) {
            return value.substring(QR_PAYLOAD_PREFIX.length());
        }
        return value;
    }

    private QrVerificationResponse invalidVerification(String resultCode, String headline, String message, String recommendedAction) {
        return new QrVerificationResponse(
                false,
                false,
                resultCode,
                headline,
                message,
                recommendedAction,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                List.of(),
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                false,
                "Invalid",
                false,
                false
        );
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

    private String resolveTimezone(String timezone, String fallbackTimezone) {
        String value = trimToNull(timezone);
        if (value == null) {
            value = trimToNull(fallbackTimezone);
        }
        if (value == null) {
            value = ZoneOffset.UTC.getId();
        }
        try {
            return ZoneId.of(value).getId();
        } catch (DateTimeException ex) {
            throw new BadRequestException("Timezone is invalid.");
        }
    }

    private Instant resolveQrExpiry(Visitor visitor, Instant now) {
        if (isRecurringVisitor(visitor) && visitor.getValidityEndDate() != null) {
            return visitor.getValidityEndDate();
        }
        if (visitor.getAccessWindowEndTime() != null) {
            return visitor.getAccessWindowEndTime();
        }
        if (visitor.getScheduledEndTime() != null) {
            return visitor.getScheduledEndTime().plus(Duration.ofMinutes(POST_MEETING_GRACE_MINUTES));
        }
        return now.plusSeconds(PASS_VALID_HOURS * 60 * 60);
    }

    private void requireVisitorWithinAllowedWindow(Visitor visitor, Instant now) {
        if (isRecurringVisitor(visitor)) {
            requireRecurringAllowedNow(visitor, now);
            return;
        }
        Instant accessStart = visitor.getAccessWindowStartTime() != null ? visitor.getAccessWindowStartTime() : visitor.getScheduledStartTime();
        Instant accessEnd = visitor.getAccessWindowEndTime() != null ? visitor.getAccessWindowEndTime() : visitor.getScheduledEndTime();
        if (accessStart != null && now.isBefore(accessStart)) {
            throw new BadRequestException("Visitor pass is not active until the approved access window opens.");
        }
        if (accessEnd != null && !now.isBefore(accessEnd)) {
            throw new BadRequestException("Visitor pass has expired for the approved access window.");
        }
    }

    private void requireRecurringAllowedNow(Visitor visitor, Instant now) {
        if (!isRecurringAllowedNow(visitor, now)) {
            throw new BadRequestException("Recurring visitor access is outside the approved validity, weekday, or entry window.");
        }
    }

    private void requireRecurringWithinValidity(Visitor visitor, Instant now) {
        if (visitor.getValidityEndDate() != null && !now.isBefore(visitor.getValidityEndDate())) {
            throw new BadRequestException("Recurring visitor badge has expired.");
        }
    }

    private boolean isRecurringAllowedNow(Visitor visitor, Instant now) {
        if (visitor.getValidityStartDate() != null && now.isBefore(visitor.getValidityStartDate())) {
            return false;
        }
        if (visitor.getValidityEndDate() != null && !now.isBefore(visitor.getValidityEndDate())) {
            return false;
        }
        ZoneId zone = ZoneId.of(organizationTimezone(visitor));
        List<String> weekdays = visitor.getAllowedWeekdays() == null ? List.of() : visitor.getAllowedWeekdays();
        if (!weekdays.isEmpty()) {
            String today = dayCode(now.atZone(zone).getDayOfWeek());
            if (!weekdays.contains(today)) {
                return false;
            }
        }
        String start = trimToNull(visitor.getAllowedEntryStartTime());
        String end = trimToNull(visitor.getAllowedEntryEndTime());
        if (start != null && end != null) {
            LocalTime current = now.atZone(zone).toLocalTime();
            return !current.isBefore(LocalTime.parse(start)) && current.isBefore(LocalTime.parse(end));
        }
        return true;
    }

    private String dayCode(DayOfWeek dayOfWeek) {
        return dayOfWeek.name().substring(0, 3);
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
        if (actor != null && !hasRole(actor, Role.SUPER_ADMIN)) {
            String organizationId = requiredTrim(actor.getOrganizationId(), "Authenticated organization scope is required.");
            return organizationService.requireActive(organizationId);
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
                Criteria.where("vendorCompanyName").regex(pattern),
                Criteria.where("purposeOfVisit").regex(pattern),
                Criteria.where("hostEmployee").regex(pattern),
                Criteria.where("hostEmployeeDepartment").regex(pattern),
                Criteria.where("department").regex(pattern),
                Criteria.where("visitorType").regex(pattern),
                Criteria.where("qrCode").regex(pattern),
                Criteria.where("badgeId").regex(pattern),
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
                        Criteria.where("accessWindowEndTime").lte(now),
                        Criteria.where("qrExpiresAt").lte(now)
                )
        );
    }

    private Criteria activeRecurringCriteria(Instant now) {
        return new Criteria().andOperator(
                Criteria.where("visitorType").in(VisitorType.RECURRING, VisitorType.CONTRACTOR_VENDOR),
                Criteria.where("status").in(VisitorStatus.APPROVED, VisitorStatus.CHECKED_IN, VisitorStatus.CHECKED_OUT),
                new Criteria().orOperator(
                        Criteria.where("validityStartDate").exists(false),
                        Criteria.where("validityStartDate").lte(now)
                ),
                new Criteria().orOperator(
                        Criteria.where("validityEndDate").exists(false),
                        Criteria.where("validityEndDate").gt(now)
                )
        );
    }

    private Criteria expiredRecurringCriteria(Instant now) {
        return new Criteria().andOperator(
                Criteria.where("visitorType").in(VisitorType.RECURRING, VisitorType.CONTRACTOR_VENDOR),
                new Criteria().orOperator(
                        Criteria.where("status").is(VisitorStatus.EXPIRED),
                        Criteria.where("validityEndDate").lte(now)
                )
        );
    }

    private Criteria dailyAttendanceCriteria(Instant now, User actor) {
        ZoneId timezone = organizationZoneId(actor);
        Instant start = LocalDate.now(timezone).atStartOfDay(timezone).toInstant();
        Instant end = LocalDate.now(timezone).plusDays(1).atStartOfDay(timezone).toInstant();
        return new Criteria().orOperator(
                Criteria.where("checkInTime").gte(start).lt(end),
                Criteria.where("checkOutTime").gte(start).lt(end)
        );
    }

    private boolean isPassValid(Visitor visitor, Instant now) {
        return visitor.getQrCode() != null
                && visitor.getPassTokenId() != null
                && visitor.getQrExpiresAt() != null
                && visitor.getQrExpiresAt().isAfter(now)
                && (visitor.getStatus() == VisitorStatus.APPROVED || (isRecurringVisitor(visitor) && visitor.getStatus() == VisitorStatus.CHECKED_OUT))
                && (visitor.getAccessWindowStartTime() == null || !now.isBefore(visitor.getAccessWindowStartTime()))
                && (visitor.getAccessWindowEndTime() == null || now.isBefore(visitor.getAccessWindowEndTime()))
                && (!isRecurringVisitor(visitor) || isRecurringAllowedNow(visitor, now));
    }

    private boolean isOverdue(Visitor visitor, Instant now) {
        return visitor.getStatus() == VisitorStatus.CHECKED_IN
                && ((visitor.getScheduledEndTime() != null && !now.isBefore(visitor.getScheduledEndTime()))
                || (visitor.getQrExpiresAt() != null && !now.isBefore(visitor.getQrExpiresAt())));
    }

    private String passValidityStatus(Visitor visitor, Instant now) {
        if (visitor.getStatus() == VisitorStatus.CHECKED_OUT && !isRecurringVisitor(visitor)) {
            return "Checked out";
        }
        if (visitor.getStatus() == VisitorStatus.CHECKED_OUT && isRecurringVisitor(visitor)) {
            return isRecurringAllowedNow(visitor, now) ? "Valid recurring pass" : "Outside recurring window";
        }
        if (visitor.getStatus() == VisitorStatus.REJECTED) {
            return "Rejected";
        }
        if (visitor.getStatus() == VisitorStatus.SUSPENDED) {
            return "Suspended";
        }
        if (visitor.getStatus() == VisitorStatus.EXPIRED) {
            return "Expired";
        }
        if (visitor.getStatus() == VisitorStatus.PENDING) {
            return "Awaiting approval";
        }
        Instant accessStart = visitor.getAccessWindowStartTime() != null ? visitor.getAccessWindowStartTime() : visitor.getScheduledStartTime();
        Instant accessEnd = visitor.getAccessWindowEndTime() != null ? visitor.getAccessWindowEndTime() : visitor.getScheduledEndTime();
        if (accessStart != null && now.isBefore(accessStart)) {
            return "Scheduled";
        }
        if (visitor.getQrExpiresAt() == null || !visitor.getQrExpiresAt().isAfter(now)) {
            return "Expired";
        }
        if (isRecurringVisitor(visitor) && !isRecurringAllowedNow(visitor, now)) {
            return "Outside recurring window";
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
        return visitor.getBadgeId() != null ? visitor.getBadgeId() : "AFB-" + visitor.getQrCode();
    }

    private String hostDepartmentFor(Visitor visitor) {
        String department = trimToNull(visitor.getHostEmployeeDepartment());
        return department != null ? department : resolveHostDepartment(visitor.getHostEmployeeId());
    }

    private void expireVisitor(Visitor visitor, Instant now) {
        VisitorStatus from = visitor.getStatus();
        visitor.setStatus(VisitorStatus.EXPIRED);
        if (from == VisitorStatus.PENDING) {
            clearPassCredentials(visitor);
        }
        visitor.setUpdatedAt(now);
        String note = from == VisitorStatus.PENDING
                ? "Pending approval expired automatically."
                : "Scheduled visitor pass expired automatically.";
        addHistory(visitor, VisitorStatus.EXPIRED, "AUTO_EXPIRED", null, note, now);
        Visitor saved = visitorRepository.save(visitor);
        audit(saved.getId(), from, VisitorStatus.EXPIRED, "AUTO_EXPIRED", null, note, now);
        visitorNotificationService.visitorExpired(saved, note);
    }

    private void issuePassCredentials(Visitor visitor, Instant now) {
        visitor.setQrCode(generatePassCode());
        if (visitor.getBadgeId() == null) {
            visitor.setBadgeId(generateBadgeId());
        }
        visitor.setPassTokenId(UUID.randomUUID().toString());
        visitor.setQrIssuedAt(now);
        visitor.setQrExpiresAt(resolveQrExpiry(visitor, now));
        visitor.setBadgePrintedAt(null);
    }

    private void clearPassCredentials(Visitor visitor) {
        visitor.setQrCode(null);
        visitor.setPassTokenId(null);
        visitor.setQrIssuedAt(null);
        visitor.setQrExpiresAt(null);
        visitor.setBadgePrintedAt(null);
    }

    private Visitor ensurePassSecurityState(Visitor visitor) {
        boolean changed = false;
        if (visitor.getBadgeId() == null && visitor.getQrCode() != null) {
            visitor.setBadgeId(generateBadgeId());
            changed = true;
        }
        if (visitor.getPassTokenId() == null && visitor.getQrCode() != null) {
            visitor.setPassTokenId(UUID.randomUUID().toString());
            changed = true;
        }
        if (changed) {
            visitor.setUpdatedAt(Instant.now());
            return visitorRepository.save(visitor);
        }
        return visitor;
    }

    private QrVerificationResponse verifyPassToken(String passToken, User actor, Instant now) {
        String normalizedPassToken = requiredTrim(passToken, "Pass token is required.");
        Visitor visitor = visitorRepository.findByPassTokenId(normalizedPassToken).orElse(null);
        if (visitor == null) {
            return invalidVerification(
                    actor,
                    NotificationType.SECURITY_INVALID_QR_SCAN,
                    "INVALID_QR",
                    "Badge not recognized",
                    "This AccessFlow badge link is invalid, malformed, or no longer active.",
                    "Ask the visitor to reopen the latest badge or request a new approved pass."
            );
        }
        return evaluateVerification(visitor, actor, now);
    }

    private QrVerificationResponse evaluateVerification(Visitor visitor, User actor, Instant now) {
        if (actor != null && !hasOrganizationAccess(visitor, actor)) {
            return invalidVerification(
                    actor,
                    NotificationType.SECURITY_SUSPICIOUS_ACTIVITY,
                    "ORGANIZATION_MISMATCH",
                    "Organization mismatch",
                    "This pass belongs to a different organization and cannot be processed here.",
                    "Use the security desk assigned to the issuing organization."
            );
        }

        Instant accessStart = visitor.getAccessWindowStartTime() != null ? visitor.getAccessWindowStartTime() : visitor.getScheduledStartTime();
        if (accessStart != null && now.isBefore(accessStart)) {
            return verificationResponse(
                    false,
                    true,
                    "NOT_ACTIVE_YET",
                    "Pass not active yet",
                    "This visitor is scheduled for a later arrival window.",
                    "Confirm the scheduled time and ask the visitor to return when the access window opens.",
                    visitor,
                    now
            );
        }

        if (visitor.getStatus() == VisitorStatus.REJECTED) {
            return verificationResponse(
                    false,
                    true,
                    "DENIED_VISITOR",
                    "Access denied",
                    "This visitor request was denied and the pass cannot be used for entry.",
                    "Do not admit the visitor. Ask them to contact their host for a new approval.",
                    visitor,
                    now
            );
        }

        if (visitor.getStatus() == VisitorStatus.SUSPENDED) {
            return verificationResponse(
                    false,
                    true,
                    "SUSPENDED_VISITOR",
                    "Visitor suspended",
                    "This recurring visitor or badge has been suspended.",
                    "Do not admit the visitor until an authorized user reactivates the profile.",
                    visitor,
                    now
            );
        }

        if (visitor.getStatus() == VisitorStatus.PENDING) {
            return verificationResponse(
                    false,
                    true,
                    "PENDING_APPROVAL",
                    "Approval still pending",
                    "This visit has not been approved yet.",
                    "Hold entry until the host or workplace team approves the visitor.",
                    visitor,
                    now
            );
        }

        if (visitor.getStatus() == VisitorStatus.CHECKED_OUT && !isRecurringVisitor(visitor)) {
            return verificationResponse(
                    false,
                    true,
                    "ALREADY_USED",
                    "Pass already used",
                    "This visitor has already completed check-out and the pass cannot be reused.",
                    "Do not re-admit the visitor with this badge. Issue a new approved visit if re-entry is required.",
                    visitor,
                    now
            );
        }

        if (visitor.getStatus() == VisitorStatus.EXPIRED
                || visitor.getQrExpiresAt() == null
                || !visitor.getQrExpiresAt().isAfter(now)
                || (isRecurringVisitor(visitor) && !isRecurringAllowedNow(visitor, now))
                || (visitor.getAccessWindowEndTime() != null && !now.isBefore(visitor.getAccessWindowEndTime()))) {
            return verificationResponse(
                    false,
                    true,
                    "EXPIRED_PASS",
                    "Pass expired",
                    "This visitor pass is outside its approved access window.",
                    "Do not admit the visitor until a new approval is issued.",
                    visitor,
                    now
            );
        }

        if (visitor.getStatus() == VisitorStatus.CHECKED_OUT && isRecurringVisitor(visitor)) {
            return verificationResponse(
                    true,
                    true,
                    "VALID_RECURRING_PASS",
                    "Recurring pass verified",
                    "The reusable recurring badge is active for this entry window.",
                    "Confirm the visitor photo and identity, then complete check-in.",
                    visitor,
                    now
            );
        }

        if (visitor.getStatus() == VisitorStatus.CHECKED_IN) {
            return verificationResponse(
                    false,
                    true,
                    isOverdue(visitor, now) ? "OVERDUE_VISIT" : "ALREADY_USED",
                    isOverdue(visitor, now) ? "Visitor still on site" : "Pass already used",
                    isOverdue(visitor, now)
                            ? "This visitor is already checked in and has exceeded the approved visit window."
                            : "This visitor is already checked in.",
                    "Visually confirm identity and check the visitor out when they depart.",
                    visitor,
                    now
            );
        }

        return verificationResponse(
                true,
                true,
                "VALID_PASS",
                "Pass verified",
                "Approval is active and the visitor can be checked in.",
                "Confirm the visitor photo and identity, then complete check-in.",
                visitor,
                now
        );
    }

    private String verificationUrl(Visitor visitor) {
        String frontendUrl = trimToNull(corsOriginResolver.resolvePublicOrigin());
        if (frontendUrl == null) {
            throw new BadRequestException("Public frontend URL is not configured for visitor badge verification.");
        }
        return UriComponentsBuilder.fromUriString(frontendUrl)
                .replacePath(null)
                .pathSegment("pass", requiredTrim(visitor.getPassTokenId(), "Visitor pass token is required."))
                .build()
                .toUriString();
    }

    private String resolvePublicPassToken(String scannedPayload) {
        String value = requiredTrim(scannedPayload, "QR payload is required.");
        if (looksLikePassToken(value)) {
            return value;
        }
        if (!value.startsWith("http://") && !value.startsWith("https://")) {
            return null;
        }
        try {
            URI uri = URI.create(value);
            String path = uri.getPath();
            if (path == null || path.isBlank()) {
                return null;
            }
            String[] segments = path.split("/");
            for (int index = 0; index < segments.length - 1; index++) {
                String segment = segments[index];
                if (!"pass".equalsIgnoreCase(segment) && !"verify".equalsIgnoreCase(segment)) {
                    continue;
                }
                String candidate = trimToNull(segments[index + 1]);
                if (looksLikePassToken(candidate)) {
                    return candidate;
                }
            }
            return null;
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private boolean looksLikePassToken(String value) {
        String candidate = trimToNull(value);
        if (candidate == null) {
            return false;
        }
        try {
            UUID.fromString(candidate);
            return true;
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }

    private boolean matchesTokenClaims(
            Visitor visitor,
            String securePassId,
            String organizationReference,
            String visitorReference,
            String approvalState,
            String passCode
    ) {
        if (visitor.getQrCode() == null || !visitor.getQrCode().equals(passCode)) {
            return false;
        }
        if (securePassId != null && securePassId.equals(visitor.getId())) {
            return true;
        }
        return visitor.getPassTokenId() != null
                && resolveBadgeId(visitor).equals(visitorReference)
                && String.valueOf(visitor.getOrganizationCode()).equals(String.valueOf(organizationReference))
                && visitor.getStatus().name().equals(approvalState);
    }

    private QrVerificationResponse verificationResponse(
            boolean valid,
            boolean recognized,
            String resultCode,
            String headline,
            String message,
            String recommendedAction,
            Visitor visitor,
            Instant now
    ) {
        boolean overdue = isOverdue(visitor, now);
        return new QrVerificationResponse(
                valid,
                recognized,
                resultCode,
                headline,
                message,
                recommendedAction,
                visitor.getId(),
                visitor.getFullName(),
                visitor.getCompanyName(),
                visitor.getOrganizationName(),
                visitor.getOrganizationCode(),
                organizationTimezone(visitor),
                visitor.getVisitorType() == null ? VisitorType.ONE_TIME : visitor.getVisitorType(),
                visitor.getVendorCompanyName(),
                visitor.getHostEmployee(),
                hostDepartmentFor(visitor),
                visitor.getSponsorEmployee(),
                visitor.getDepartment(),
                visitor.getValidityStartDate(),
                visitor.getValidityEndDate(),
                visitor.getRecurringSchedule(),
                visitor.getAllowedWeekdays() == null ? List.of() : visitor.getAllowedWeekdays(),
                visitor.getAllowedEntryStartTime(),
                visitor.getAllowedEntryEndTime(),
                visitor.getPhotoUrl(),
                visitor.getStatus(),
                displayStatus(visitor.getStatus()),
                resolveBadgeId(visitor),
                visitor.getQrCode(),
                visitor.getQrIssuedAt(),
                visitor.getQrExpiresAt(),
                visitor.getScheduledStartTime(),
                visitor.getScheduledEndTime(),
                visitor.getAccessWindowStartTime(),
                visitor.getAccessWindowEndTime(),
                visitor.getExpectedDurationMinutes(),
                visitor.getCheckInTime(),
                visitor.getCheckOutTime(),
                overdue,
                passValidityStatus(visitor, now),
                valid && (visitor.getStatus() == VisitorStatus.APPROVED || (isRecurringVisitor(visitor) && visitor.getStatus() == VisitorStatus.CHECKED_OUT)),
                visitor.getStatus() == VisitorStatus.CHECKED_IN
        );
    }

    private String displayStatus(VisitorStatus status) {
        return switch (status) {
            case PENDING -> "Pending approval";
            case APPROVED -> "Approved";
            case REJECTED -> "Denied";
            case CHECKED_IN -> "Checked in";
            case CHECKED_OUT -> "Checked out";
            case EXPIRED -> "Expired";
            case SUSPENDED -> "Suspended";
        };
    }

    private String checkInState(Visitor visitor, Instant now) {
        if (visitor.getCheckOutTime() != null) {
            return "Checked out";
        }
        if (visitor.getCheckInTime() != null) {
            return isOverdue(visitor, now) ? "Checked in · overdue" : "Checked in";
        }
        if (visitor.getStatus() == VisitorStatus.APPROVED) {
            return "Awaiting check-in";
        }
        if (visitor.getStatus() == VisitorStatus.PENDING) {
            return "Pending approval";
        }
        if (visitor.getStatus() == VisitorStatus.REJECTED) {
            return "Access denied";
        }
        if (visitor.getStatus() == VisitorStatus.EXPIRED) {
            return "Visit expired";
        }
        if (visitor.getStatus() == VisitorStatus.SUSPENDED) {
            return "Visitor suspended";
        }
        return displayStatus(visitor.getStatus());
    }

    private VisitorResponse recordSecurityIssue(String id, String actorId, String reason, String action, String outcome) {
        Visitor visitor = find(id);
        User actor = currentUser(actorId);
        requireOrganizationAccess(visitor, actor);
        Instant now = Instant.now();
        VisitorStatus currentStatus = visitor.getStatus();
        String note = requiredTrim(reason, "A security note is required.");
        visitor.setUpdatedAt(now);
        addHistory(visitor, currentStatus, action, actorId, note, now);
        Visitor saved = visitorRepository.save(visitor);
        audit(saved.getId(), currentStatus, currentStatus, action, actorId, note, now);
        accessAuditService.recordVisitorAccess(actor, saved, action, outcome, note);
        notifySecurityTeams(actor, notificationTypeForSecurityAction(action), securityTitleForAction(action), securityMessageForAction(action, saved, note), saved);
        return toResponse(saved);
    }

    private NotificationType notificationTypeForSecurityAction(String action) {
        return switch (action) {
            case "SECURITY_ESCALATED" -> NotificationType.SECURITY_ESCALATION;
            case "IDENTITY_MISMATCH_REPORTED" -> NotificationType.SECURITY_SUSPICIOUS_ACTIVITY;
            default -> NotificationType.SECURITY_SUSPICIOUS_ACTIVITY;
        };
    }

    private String securityTitleForAction(String action) {
        return switch (action) {
            case "SECURITY_ESCALATED" -> "Checkpoint escalation recorded";
            case "IDENTITY_MISMATCH_REPORTED" -> "Suspicious activity reported";
            default -> "Security alert recorded";
        };
    }

    private String securityMessageForAction(String action, Visitor visitor, String note) {
        return switch (action) {
            case "SECURITY_ESCALATED" -> "%s was escalated by security for follow-up. %s".formatted(visitor.getFullName(), note);
            case "IDENTITY_MISMATCH_REPORTED" -> "%s triggered an identity mismatch report. %s".formatted(visitor.getFullName(), note);
            default -> "%s triggered a security alert. %s".formatted(visitor.getFullName(), note);
        };
    }

    private void notifySecurityTeams(User actor, NotificationType type, String title, String message, Visitor visitor) {
        if (actor == null) {
            return;
        }
        String organizationId = trimToNull(actor.getOrganizationId());
        if (organizationId == null && visitor != null) {
            organizationId = trimToNull(visitor.getOrganizationId());
        }
        if (organizationId == null) {
            return;
        }
        notificationService.notifyOrganizationRoles(
                organizationId,
                Set.of(Role.SECURITY_GUARD, Role.ADMIN),
                null,
                type,
                title,
                message,
                visitor,
                "/pages/security/#alerts",
                actor.getFullName()
        );
    }

    private QrVerificationResponse invalidVerification(
            User actor,
            NotificationType notificationType,
            String resultCode,
            String headline,
            String message,
            String recommendedAction
    ) {
        notifySecurityTeams(actor, notificationType, headline, message, null);
        return invalidVerification(resultCode, headline, message, recommendedAction);
    }

    private record ScheduleCandidate(Instant start, Instant end, String timezone) {
    }
}
