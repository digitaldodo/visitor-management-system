package com.visitor.management.service;

import com.visitor.management.dto.PageResponse;
import com.visitor.management.dto.SearchRequest;
import com.visitor.management.dto.VisitorCreateRequest;
import com.visitor.management.dto.VisitorResponse;
import com.visitor.management.dto.VisitorUpdateRequest;
import com.visitor.management.entity.User;
import com.visitor.management.entity.Visitor;
import com.visitor.management.entity.VisitorStatus;
import com.visitor.management.exception.BadRequestException;
import com.visitor.management.exception.ResourceNotFoundException;
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
    private final MongoTemplate mongoTemplate;
    private final PaginationService paginationService;

    public VisitorService(
            VisitorRepository visitorRepository,
            UserRepository userRepository,
            MongoTemplate mongoTemplate,
            PaginationService paginationService
    ) {
        this.visitorRepository = visitorRepository;
        this.userRepository = userRepository;
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
        visitor.setStatus(VisitorStatus.SCHEDULED);
        visitor.setQrCode(generateQrCode());
        visitor.setCreatedAt(now);
        visitor.setUpdatedAt(now);
        return toResponse(visitorRepository.save(visitor));
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
        if (visitor.getStatus() == VisitorStatus.CANCELLED) {
            throw new BadRequestException("Cancelled visitors cannot be checked in.");
        }

        Instant now = Instant.now();
        visitor.setCheckInTime(now);
        visitor.setCheckOutTime(null);
        visitor.setStatus(VisitorStatus.CHECKED_IN);
        visitor.setUpdatedAt(now);
        return toResponse(visitorRepository.save(visitor));
    }

    public VisitorResponse checkOut(String id) {
        Visitor visitor = find(id);
        if (visitor.getStatus() != VisitorStatus.CHECKED_IN) {
            throw new BadRequestException("Only checked-in visitors can be checked out.");
        }

        Instant now = Instant.now();
        visitor.setCheckOutTime(now);
        visitor.setStatus(VisitorStatus.CHECKED_OUT);
        visitor.setUpdatedAt(now);
        return toResponse(visitorRepository.save(visitor));
    }

    public List<Map<String, Object>> metrics() {
        Instant start = LocalDate.now(ZoneOffset.UTC).atStartOfDay().toInstant(ZoneOffset.UTC);
        Instant end = start.plusSeconds(24 * 60 * 60);
        return List.of(
                Map.of("label", "Visitors today", "value", visitorRepository.countByCheckInTimeBetween(start, end), "note", "Checked in"),
                Map.of("label", "Scheduled", "value", visitorRepository.countByStatus(VisitorStatus.SCHEDULED), "note", "Awaiting arrival"),
                Map.of("label", "On site", "value", visitorRepository.countByStatus(VisitorStatus.CHECKED_IN), "note", "Currently checked in"),
                Map.of("label", "Checked out", "value", visitorRepository.countByStatus(VisitorStatus.CHECKED_OUT), "note", "Completed visits")
        );
    }

    public Map<String, Object> statusSummary() {
        return Map.of(
                "scheduled", visitorRepository.countByStatus(VisitorStatus.SCHEDULED),
                "checkedIn", visitorRepository.countByStatus(VisitorStatus.CHECKED_IN),
                "checkedOut", visitorRepository.countByStatus(VisitorStatus.CHECKED_OUT),
                "cancelled", visitorRepository.countByStatus(VisitorStatus.CANCELLED)
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
        if (status == VisitorStatus.CHECKED_IN || status == VisitorStatus.CHECKED_OUT) {
            throw new BadRequestException("Use check-in and check-out endpoints to change active visit status.");
        }
        if (visitor.getStatus() == VisitorStatus.CHECKED_IN && status == VisitorStatus.SCHEDULED) {
            throw new BadRequestException("Checked-in visitors cannot be moved back to scheduled.");
        }
        visitor.setStatus(status);
        if (status == VisitorStatus.CANCELLED) {
            visitor.setCheckOutTime(null);
        }
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
}
