package com.visitor.management.service;

import com.visitor.management.dto.AdminUserResponse;
import com.visitor.management.dto.DepartmentResponse;
import com.visitor.management.dto.OrganizationAuditLogResponse;
import com.visitor.management.dto.OrganizationRequest;
import com.visitor.management.dto.OrganizationResponse;
import com.visitor.management.dto.OrganizationSummaryResponse;
import com.visitor.management.dto.OrganizationVisitorActivityResponse;
import com.visitor.management.dto.OrganizationWorkspaceListItemResponse;
import com.visitor.management.dto.OrganizationWorkspaceResponse;
import com.visitor.management.entity.AccessAuditLog;
import com.visitor.management.entity.Department;
import com.visitor.management.entity.Organization;
import com.visitor.management.entity.Role;
import com.visitor.management.entity.User;
import com.visitor.management.entity.Visitor;
import com.visitor.management.entity.VisitorStatus;
import com.visitor.management.exception.BadRequestException;
import com.visitor.management.exception.ConflictException;
import com.visitor.management.exception.ResourceNotFoundException;
import com.visitor.management.repository.AccessAuditLogRepository;
import com.visitor.management.repository.DepartmentRepository;
import com.visitor.management.repository.OrganizationRepository;
import com.visitor.management.repository.UserRepository;
import com.visitor.management.repository.VisitorRepository;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.DateTimeException;
import java.time.ZoneId;
import java.util.List;
import java.util.Locale;

@Service
public class OrganizationService {

    private static final Sort ORGANIZATION_SORT = Sort.by(Sort.Direction.ASC, "companyName");
    private static final Sort DEPARTMENT_SORT = Sort.by(Sort.Direction.ASC, "departmentName");
    private static final long RECENT_VISITOR_WINDOW_SECONDS = 30L * 24 * 60 * 60;

    private final OrganizationRepository organizationRepository;
    private final UserRepository userRepository;
    private final DepartmentService departmentService;
    private final DepartmentRepository departmentRepository;
    private final VisitorRepository visitorRepository;
    private final AccessAuditLogRepository accessAuditLogRepository;
    private final AccessAuditService accessAuditService;

    public OrganizationService(
            OrganizationRepository organizationRepository,
            UserRepository userRepository,
            DepartmentService departmentService,
            DepartmentRepository departmentRepository,
            VisitorRepository visitorRepository,
            AccessAuditLogRepository accessAuditLogRepository,
            AccessAuditService accessAuditService
    ) {
        this.organizationRepository = organizationRepository;
        this.userRepository = userRepository;
        this.departmentService = departmentService;
        this.departmentRepository = departmentRepository;
        this.visitorRepository = visitorRepository;
        this.accessAuditLogRepository = accessAuditLogRepository;
        this.accessAuditService = accessAuditService;
    }

    public List<OrganizationResponse> listAll() {
        return organizationRepository.findAll(ORGANIZATION_SORT)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    public List<OrganizationResponse> listAccessible(String actorId) {
        User actor = currentUser(actorId);
        if (actor.getRoles().contains(Role.SUPER_ADMIN)) {
            return listAll();
        }
        String organizationId = trimToNull(actor.getOrganizationId());
        if (organizationId == null) {
            throw new BadRequestException("Your account is not assigned to an organization.");
        }
        return List.of(toResponse(requireActive(organizationId)));
    }

    public List<OrganizationResponse> listPublicActive() {
        return organizationRepository.findAllByActiveStatusTrue(ORGANIZATION_SORT)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    public List<OrganizationWorkspaceListItemResponse> listWorkspaceItems() {
        Instant recentThreshold = Instant.now().minusSeconds(RECENT_VISITOR_WINDOW_SECONDS);
        List<User> allUsers = userRepository.findAll();
        List<Department> allDepartments = departmentRepository.findAll();

        return listAll().stream()
                .map(organization -> new OrganizationWorkspaceListItemResponse(
                        organization.id(),
                        organization.companyName(),
                        organization.companyCode(),
                        organization.address(),
                        organization.contactEmail(),
                        organization.regionCountry(),
                        organization.timezone(),
                        organization.activeStatus(),
                        organization.createdAt(),
                        organization.updatedAt(),
                        allUsers.stream()
                                .filter(user -> organization.id().equals(user.getOrganizationId()))
                                .filter(user -> user.getRoles() != null && user.getRoles().contains(Role.ADMIN))
                                .count(),
                        allUsers.stream()
                                .filter(user -> organization.id().equals(user.getOrganizationId()))
                                .filter(user -> user.getRoles() != null && user.getRoles().stream().anyMatch(this::isWorkforceRole))
                                .count(),
                        allDepartments.stream()
                                .filter(department -> organization.id().equals(department.getOrganizationId()))
                                .count(),
                        visitorRepository.countByOrganizationIdAndStatus(organization.id(), VisitorStatus.CHECKED_IN),
                        visitorRepository.countByOrganizationIdAndStatus(organization.id(), VisitorStatus.PENDING),
                        visitorRepository.countByOrganizationIdAndCreatedAtGreaterThanEqual(organization.id(), recentThreshold),
                        visitorRepository.findTopByOrganizationIdOrderByUpdatedAtDesc(organization.id())
                                .map(Visitor::getUpdatedAt)
                                .orElse(null)
                ))
                .toList();
    }

    public OrganizationWorkspaceResponse workspace(String id) {
        Organization organization = organizationRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Organization was not found."));
        List<User> users = userRepository.findAllByOrganizationId(organization.getId());
        List<Department> departments = departmentRepository.findAllByOrganizationId(organization.getId(), DEPARTMENT_SORT);
        List<Visitor> recentVisitors = visitorRepository.findTop8ByOrganizationIdOrderByUpdatedAtDesc(organization.getId());
        Instant recentThreshold = Instant.now().minusSeconds(RECENT_VISITOR_WINDOW_SECONDS);

        List<User> admins = users.stream()
                .filter(user -> user.getRoles() != null && user.getRoles().contains(Role.ADMIN))
                .toList();
        List<User> workforce = users.stream()
                .filter(user -> user.getRoles() != null && user.getRoles().stream().anyMatch(this::isWorkforceRole))
                .toList();

        return new OrganizationWorkspaceResponse(
                toResponse(organization),
                new OrganizationSummaryResponse(
                        admins.size(),
                        workforce.size(),
                        departments.size(),
                        departments.stream().filter(Department::isActiveStatus).count(),
                        visitorRepository.countByOrganizationId(organization.getId()),
                        visitorRepository.countByOrganizationIdAndStatus(organization.getId(), VisitorStatus.CHECKED_IN),
                        visitorRepository.countByOrganizationIdAndStatus(organization.getId(), VisitorStatus.PENDING),
                        visitorRepository.countByOrganizationIdAndCreatedAtGreaterThanEqual(organization.getId(), recentThreshold),
                        recentVisitors.isEmpty() ? null : recentVisitors.get(0).getUpdatedAt(),
                        organization.isActiveStatus()
                ),
                admins.stream().map(this::toAdminUserResponse).toList(),
                departments.stream().map(department -> toDepartmentResponse(department, organization)).toList(),
                recentVisitors.stream().map(this::toVisitorActivityResponse).toList(),
                accessAuditLogRepository.findTop12ByOrganizationIdOrderByCreatedAtDesc(organization.getId())
                        .stream()
                        .map(this::toAuditLogResponse)
                        .toList()
        );
    }

    public OrganizationResponse create(OrganizationRequest request, String actorId) {
        String companyCode = normalizeCode(request.companyCode());
        if (organizationRepository.existsByCompanyCodeIgnoreCase(companyCode)) {
            throw new ConflictException("An organization with this company code already exists.");
        }
        Organization organization = new Organization();
        organization.setCompanyName(request.companyName().trim());
        organization.setCompanyCode(companyCode);
        organization.setAddress(trimToNull(request.address()));
        organization.setContactEmail(trimToNull(request.contactEmail()));
        organization.setRegionCountry(requiredTrim(request.regionCountry(), "Organization region/country is required."));
        organization.setTimezone(resolveTimezone(request.timezone()));
        organization.setActiveStatus(request.activeStatus() == null || request.activeStatus());
        Organization saved = organizationRepository.save(organization);
        departmentService.syncDepartmentsForOrganization(saved.getId(), request.departmentNames());
        accessAuditService.recordOrganizationChanged(
                currentUser(actorId),
                saved,
                "ORGANIZATION_CREATED",
                "Organization created from the super-admin workspace."
        );
        return toResponse(saved);
    }

    public OrganizationResponse update(String id, OrganizationRequest request, String actorId) {
        Organization organization = organizationRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Organization was not found."));

        boolean wasActive = organization.isActiveStatus();
        String companyCode = normalizeCode(request.companyCode());
        organizationRepository.findByCompanyCodeIgnoreCase(companyCode)
                .filter(existing -> !existing.getId().equals(organization.getId()))
                .ifPresent(existing -> {
                    throw new ConflictException("An organization with this company code already exists.");
                });

        organization.setCompanyName(request.companyName().trim());
        organization.setCompanyCode(companyCode);
        organization.setAddress(trimToNull(request.address()));
        organization.setContactEmail(trimToNull(request.contactEmail()));
        organization.setRegionCountry(requiredTrim(request.regionCountry(), "Organization region/country is required."));
        organization.setTimezone(resolveTimezone(request.timezone()));
        organization.setActiveStatus(request.activeStatus() == null || request.activeStatus());
        Organization saved = organizationRepository.save(organization);
        departmentService.syncDepartmentsForOrganization(saved.getId(), request.departmentNames());

        String action = !saved.isActiveStatus()
                ? "ORGANIZATION_DISABLED"
                : !wasActive && saved.isActiveStatus()
                ? "ORGANIZATION_ENABLED"
                : "ORGANIZATION_UPDATED";
        String detail = switch (action) {
            case "ORGANIZATION_DISABLED" -> "Organization was disabled from the super-admin workspace.";
            case "ORGANIZATION_ENABLED" -> "Organization was re-enabled from the super-admin workspace.";
            default -> "Organization settings were updated from the super-admin workspace.";
        };
        accessAuditService.recordOrganizationChanged(currentUser(actorId), saved, action, detail);
        return toResponse(saved);
    }

    public Organization requireActive(String organizationId) {
        Organization organization = organizationRepository.findById(organizationId)
                .orElseThrow(() -> new ResourceNotFoundException("Organization was not found."));
        if (!organization.isActiveStatus()) {
            throw new BadRequestException("Organization is inactive.");
        }
        return organization;
    }

    public Organization resolveRequired(String companyCode, String companyName) {
        Organization organization = resolve(companyCode, companyName);
        if (organization == null) {
            throw new BadRequestException("Select a valid organization.");
        }
        if (!organization.isActiveStatus()) {
            throw new BadRequestException("Selected organization is inactive.");
        }
        return organization;
    }

    public Organization resolve(String companyCode, String companyName) {
        String code = trimToNull(companyCode);
        if (code != null) {
            return organizationRepository.findByCompanyCodeIgnoreCase(normalizeCode(code)).orElse(null);
        }
        String name = trimToNull(companyName);
        if (name != null) {
            return organizationRepository.findByCompanyNameIgnoreCase(name).orElse(null);
        }
        return null;
    }

    public OrganizationResponse toResponse(Organization organization) {
        return new OrganizationResponse(
                organization.getId(),
                organization.getCompanyName(),
                organization.getCompanyCode(),
                organization.getAddress(),
                organization.getContactEmail(),
                organization.getRegionCountry(),
                organizationTimezone(organization),
                organization.isActiveStatus(),
                organization.getCreatedAt(),
                organization.getUpdatedAt()
        );
    }

    private AdminUserResponse toAdminUserResponse(User user) {
        return new AdminUserResponse(
                user.getId(),
                user.getUsername(),
                user.getEmail(),
                user.getFullName(),
                user.getDepartment(),
                user.getEmployeeId(),
                user.getDesignation(),
                user.getEmployeeType(),
                user.getEmployeePhotoUrl(),
                user.getShiftName(),
                user.getShiftStartTime(),
                user.getShiftEndTime(),
                user.getPhone(),
                user.getPhoneCountryCode(),
                user.getOrganizationId(),
                user.getOrganizationName(),
                user.getOrganizationCode(),
                user.getOrganizationTimezone(),
                user.getOrganizationRegionCountry(),
                user.getRoles(),
                user.isActive(),
                user.getAccountStatus(),
                user.getCreatedAt(),
                user.getUpdatedAt()
        );
    }

    private DepartmentResponse toDepartmentResponse(Department department, Organization organization) {
        return new DepartmentResponse(
                department.getId(),
                department.getOrganizationId(),
                organization.getCompanyName(),
                organization.getCompanyCode(),
                department.getDepartmentName(),
                department.isActiveStatus(),
                department.getCreatedAt()
        );
    }

    private OrganizationVisitorActivityResponse toVisitorActivityResponse(Visitor visitor) {
        return new OrganizationVisitorActivityResponse(
                visitor.getId(),
                visitor.getFullName(),
                visitor.getCompanyName(),
                visitor.getHostEmployee(),
                visitor.getStatus() != null ? visitor.getStatus().name() : "",
                visitor.getCreatedAt(),
                visitor.getCheckInTime(),
                visitor.getUpdatedAt()
        );
    }

    private OrganizationAuditLogResponse toAuditLogResponse(AccessAuditLog log) {
        return new OrganizationAuditLogResponse(
                log.getId(),
                log.getAction(),
                log.getActorName(),
                log.getOutcome(),
                log.getDetails(),
                log.getCreatedAt()
        );
    }

    private boolean isWorkforceRole(Role role) {
        return role == Role.EMPLOYEE || role == Role.SECURITY_GUARD;
    }

    private String normalizeCode(String value) {
        return value.trim().toUpperCase(Locale.ROOT);
    }

    private String resolveTimezone(String timezone) {
        String value = requiredTrim(timezone, "Organization timezone is required.");
        try {
            return ZoneId.of(value).getId();
        } catch (DateTimeException ex) {
            throw new BadRequestException("Organization timezone is invalid.");
        }
    }

    private String organizationTimezone(Organization organization) {
        String timezone = trimToNull(organization.getTimezone());
        return timezone == null ? "UTC" : timezone;
    }

    private String requiredTrim(String value, String message) {
        String trimmed = trimToNull(value);
        if (trimmed == null) {
            throw new BadRequestException(message);
        }
        return trimmed;
    }

    private String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private User currentUser(String actorId) {
        return userRepository.findById(actorId)
                .orElseThrow(() -> new ResourceNotFoundException("User account was not found."));
    }
}
