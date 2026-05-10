package com.visitor.management.service;

import com.visitor.management.dto.PageResponse;
import com.visitor.management.dto.ApprovalDecisionRequest;
import com.visitor.management.dto.SearchRequest;
import com.visitor.management.dto.VisitorCreateRequest;
import com.visitor.management.dto.VisitorResponse;
import com.visitor.management.dto.VisitorStatusHistoryResponse;
import com.visitor.management.dto.VisitorUpdateRequest;
import com.visitor.management.entity.VisitorAuditLog;
import com.visitor.management.entity.User;
import com.visitor.management.entity.Visitor;
import com.visitor.management.entity.VisitorStatus;
import com.visitor.management.entity.VisitorStatusHistoryEntry;
import com.visitor.management.exception.BadRequestException;
import com.visitor.management.exception.ResourceNotFoundException;
import com.visitor.management.repository.VisitorAuditLogRepository;
import com.visitor.management.repository.UserRepository;
import com.visitor.management.repository.VisitorRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
public class VisitorService {

    private static final Set<String> SORT_FIELDS = Set.of(
            "createdAt",
            "updatedAt",
            "fullName",
            "companyName",
            "hostEmployee",
            "checkInTime",
            "checkOutTime",
            "status"
    );

    private final VisitorRepository visitorRepository;
    private final UserRepository userRepository;
    private final VisitorAuditLogRepository visitorAuditLogRepository;
    private final MongoTemplate mongoTemplate;
    private final PaginationService paginationService;

    public VisitorService(
            VisitorRepository visitorRepository,
            UserRepository userRepository,
            VisitorAuditLogRepository visitorAuditLogRepository,
            MongoTemplate mongoTemplate,
            PaginationService paginationService
    ) {
        this.visitorRepository = visitorRepository;
        this.userRepository = userRepository;
        this.visitorAuditLogRepository = visitorAuditLogRepository;
        this.mongoTemplate = mongoTemplate;
        this.paginationService = paginationService;
    }

    public VisitorResponse create(VisitorCreateRequest request) {
        return create(request, null);
    }

    public VisitorResponse create(VisitorCreateRequest request, String forcedHostEmployeeId) {
        Instant now = Instant.now();
        Visitor visitor = new Visitor();
        visitor.setFullName(requiredTrim(request.fullName(), "Full name is required."));
        visitor.setPhone(requiredTrim(request.phone(), "Phone is required."));
        visitor.setEmail(trimToNull(request.email()));
        visitor.setCompanyName(trimToNull(request.companyName()));
        visitor.setPurposeOfVisit(requiredTrim(request.purposeOfVisit(), "Purpose of visit is required."));
        visitor.setHostEmployeeId(resolveHostEmployeeId(request.hostEmployeeId(), request.hostEmployee(), forcedHostEmployeeId));
        visitor.setHostEmployee(resolveHostEmployeeName(request.hostEmployee(), visitor.getHostEmployeeId()));
        visitor.setPhotoUrl(requiredTrim(request.photoUrl(), "Visitor photo is required."));
        visitor.setPhotoPublicId(requiredTrim(request.photoPublicId(), "Visitor photo is required."));
        visitor.setStatus(VisitorStatus.PENDING);
        visitor.setCreatedAt(now);
        visitor.setUpdatedAt(now);
        addHistory(visitor, VisitorStatus.PENDING, "REGISTERED", visitor.getHostEmployeeId(), "Approval requested.", now);
        Visitor saved = visitorRepository.save(visitor);
        audit(saved.getId(), null, VisitorStatus.PENDING, "REGISTERED", visitor.getHostEmployeeId(), "Approval requested.", now);
        return toResponse(saved);
    }

    public VisitorResponse get(String id) {
        return toResponse(find(id));
    }

    public VisitorResponse getForHost(String id, String hostEmployeeId) {
        Visitor visitor = find(id);
        requireHostAccess(visitor, hostEmployeeId);
        return toResponse(visitor);
    }

    public PageResponse<VisitorResponse> search(SearchRequest request) {
        return search(request, null);
    }

    public PageResponse<VisitorResponse> search(SearchRequest request, String forcedHostEmployeeId) {
        Pageable pageable = pageable(request);
        Query query = queryFor(request, forcedHostEmployeeId).with(pageable);
        Query countQuery = queryFor(request, forcedHostEmployeeId);
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
        visitor.setQrCode(generateQrCode());
        visitor.setUpdatedAt(now);
        String note = trimToNull(request == null ? null : request.note());
        addHistory(visitor, VisitorStatus.APPROVED, "APPROVED", actorId, note, now);
        Visitor saved = visitorRepository.save(visitor);
        audit(saved.getId(), from, VisitorStatus.APPROVED, "APPROVED", actorId, note, now);
        return toResponse(saved);
    }

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
        visitor.setUpdatedAt(now);
        addHistory(visitor, VisitorStatus.REJECTED, "REJECTED", actorId, note, now);
        Visitor saved = visitorRepository.save(visitor);
        audit(saved.getId(), from, VisitorStatus.REJECTED, "REJECTED", actorId, note, now);
        return toResponse(saved);
    }

    public VisitorResponse update(String id, VisitorUpdateRequest request) {
        Visitor visitor = find(id);
        applyUpdate(visitor, request);
        return toResponse(visitorRepository.save(visitor));
    }

    public VisitorResponse updateForHost(String id, VisitorUpdateRequest request, String hostEmployeeId) {
        Visitor visitor = find(id);
        requireHostAccess(visitor, hostEmployeeId);
        applyUpdate(visitor, request);
        visitor.setHostEmployeeId(hostEmployeeId);
        return toResponse(visitorRepository.save(visitor));
    }

    public void delete(String id) {
        Visitor visitor = find(id);
        visitorRepository.delete(visitor);
    }

    public VisitorResponse checkIn(String id) {
        Visitor visitor = find(id);
        if (visitor.getStatus() == VisitorStatus.CHECKED_IN) {
            throw new BadRequestException("Visitor is already checked in.");
        }
        if (visitor.getStatus() == VisitorStatus.CHECKED_OUT) {
            throw new BadRequestException("Checked-out visitors cannot be checked in again.");
        }
        if (visitor.getStatus() != VisitorStatus.APPROVED) {
            throw new BadRequestException("Only approved visitors can be checked in.");
        }

        Instant now = Instant.now();
        VisitorStatus from = visitor.getStatus();
        visitor.setCheckInTime(now);
        visitor.setCheckOutTime(null);
        visitor.setStatus(VisitorStatus.CHECKED_IN);
        visitor.setUpdatedAt(now);
        addHistory(visitor, VisitorStatus.CHECKED_IN, "CHECKED_IN", null, "Visitor checked in.", now);
        Visitor saved = visitorRepository.save(visitor);
        audit(saved.getId(), from, VisitorStatus.CHECKED_IN, "CHECKED_IN", null, "Visitor checked in.", now);
        return toResponse(saved);
    }

    public VisitorResponse checkOut(String id) {
        Visitor visitor = find(id);
        if (visitor.getStatus() != VisitorStatus.CHECKED_IN) {
            throw new BadRequestException("Only checked-in visitors can be checked out.");
        }

        Instant now = Instant.now();
        VisitorStatus from = visitor.getStatus();
        visitor.setCheckOutTime(now);
        visitor.setStatus(VisitorStatus.CHECKED_OUT);
        visitor.setUpdatedAt(now);
        addHistory(visitor, VisitorStatus.CHECKED_OUT, "CHECKED_OUT", null, "Visitor checked out.", now);
        Visitor saved = visitorRepository.save(visitor);
        audit(saved.getId(), from, VisitorStatus.CHECKED_OUT, "CHECKED_OUT", null, "Visitor checked out.", now);
        return toResponse(saved);
    }

    public List<Map<String, Object>> metrics() {
        Instant start = LocalDate.now(ZoneOffset.UTC).atStartOfDay().toInstant(ZoneOffset.UTC);
        Instant end = start.plusSeconds(24 * 60 * 60);
        return List.of(
                Map.of("label", "Visitors today", "value", visitorRepository.countByCheckInTimeBetween(start, end), "note", "Checked in"),
                Map.of("label", "Pending", "value", visitorRepository.countByStatus(VisitorStatus.PENDING), "note", "Awaiting approval"),
                Map.of("label", "Approved", "value", visitorRepository.countByStatus(VisitorStatus.APPROVED), "note", "Passes generated"),
                Map.of("label", "On site", "value", visitorRepository.countByStatus(VisitorStatus.CHECKED_IN), "note", "Currently checked in"),
                Map.of("label", "Checked out", "value", visitorRepository.countByStatus(VisitorStatus.CHECKED_OUT), "note", "Completed visits")
        );
    }

    public Map<String, Object> statusSummary() {
        return Map.of(
                "pending", visitorRepository.countByStatus(VisitorStatus.PENDING),
                "approved", visitorRepository.countByStatus(VisitorStatus.APPROVED),
                "rejected", visitorRepository.countByStatus(VisitorStatus.REJECTED),
                "checkedIn", visitorRepository.countByStatus(VisitorStatus.CHECKED_IN),
                "checkedOut", visitorRepository.countByStatus(VisitorStatus.CHECKED_OUT)
        );
    }

    private Query queryFor(SearchRequest request, String forcedHostEmployeeId) {
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

        String hostEmployeeId = forcedHostEmployeeId != null ? forcedHostEmployeeId : trimToNull(request.hostEmployeeId());
        if (hostEmployeeId != null) {
            criteria.add(Criteria.where("hostEmployeeId").is(hostEmployeeId));
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
        setIfPresent(request.companyName(), value -> visitor.setCompanyName(trimToNull(value)));
        setIfPresent(request.purposeOfVisit(), value -> visitor.setPurposeOfVisit(requiredTrim(value, "Purpose of visit is required.")));
        setIfPresent(request.hostEmployeeId(), value -> visitor.setHostEmployeeId(trimToNull(value)));
        setIfPresent(request.hostEmployee(), value -> visitor.setHostEmployee(trimToNull(value)));
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
    }

    private String resolveHostEmployeeId(String requestHostEmployeeId, String requestHostEmployee, String forcedHostEmployeeId) {
        String resolved = forcedHostEmployeeId != null ? forcedHostEmployeeId : trimToNull(requestHostEmployeeId);
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

    private String generateQrCode() {
        String qrCode;
        do {
            qrCode = "VST-" + UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
        } while (visitorRepository.findByQrCode(qrCode).isPresent());
        return qrCode;
    }

    private VisitorResponse toResponse(Visitor visitor) {
        return new VisitorResponse(
                visitor.getId(),
                visitor.getFullName(),
                visitor.getPhone(),
                visitor.getEmail(),
                visitor.getCompanyName(),
                visitor.getPurposeOfVisit(),
                visitor.getHostEmployee(),
                visitor.getPhotoUrl(),
                visitor.getHostEmployeeId(),
                visitor.getCheckInTime(),
                visitor.getCheckOutTime(),
                visitor.getStatus(),
                visitor.getQrCode(),
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

    private String requiredTrim(String value, String message) {
        String trimmed = trimToNull(value);
        if (trimmed == null) {
            throw new BadRequestException(message);
        }
        return trimmed;
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
}
