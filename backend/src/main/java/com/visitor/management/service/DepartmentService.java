package com.visitor.management.service;

import com.visitor.management.dto.DepartmentCreateRequest;
import com.visitor.management.dto.DepartmentResponse;
import com.visitor.management.dto.DepartmentUpdateRequest;
import com.visitor.management.entity.Department;
import com.visitor.management.entity.Organization;
import com.visitor.management.entity.Role;
import com.visitor.management.entity.User;
import com.visitor.management.exception.BadRequestException;
import com.visitor.management.exception.ConflictException;
import com.visitor.management.exception.ResourceNotFoundException;
import com.visitor.management.repository.DepartmentRepository;
import com.visitor.management.repository.OrganizationRepository;
import com.visitor.management.repository.UserRepository;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.domain.Sort;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class DepartmentService {

    private static final Sort ORGANIZATION_DEPARTMENT_SORT = Sort.by(Sort.Direction.ASC, "departmentName");
    private static final Sort GLOBAL_DEPARTMENT_SORT = Sort.by(Sort.Direction.ASC, "organizationId", "departmentName");
    private static final Pattern DEPARTMENT_PATTERN = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9 &/-]{1,79}$");
    private static final Set<String> ACRONYMS = Set.of("HR", "IT", "QA", "HSE", "R&D");

    private final DepartmentRepository departmentRepository;
    private final OrganizationRepository organizationRepository;
    private final UserRepository userRepository;

    public DepartmentService(
            DepartmentRepository departmentRepository,
            OrganizationRepository organizationRepository,
            UserRepository userRepository
    ) {
        this.departmentRepository = departmentRepository;
        this.organizationRepository = organizationRepository;
        this.userRepository = userRepository;
    }

    public List<DepartmentResponse> listDepartments(Authentication authentication, String requestedOrganizationId, boolean includeInactive) {
        User actor = currentUser(authentication);
        boolean superAdmin = actor.getRoles().contains(Role.SUPER_ADMIN);
        String organizationId = trimToNull(requestedOrganizationId);

        if (superAdmin && organizationId == null) {
            List<Department> departments = includeInactive
                    ? departmentRepository.findAll(GLOBAL_DEPARTMENT_SORT)
                    : departmentRepository.findAllByActiveStatusTrue(GLOBAL_DEPARTMENT_SORT);
            Map<String, Organization> organizationMap = organizationMap(departments.stream()
                    .map(Department::getOrganizationId)
                    .filter(Objects::nonNull)
                    .collect(Collectors.toSet()));
            return departments.stream()
                    .map(department -> toResponse(department, organizationMap.get(department.getOrganizationId())))
                    .toList();
        }

        Organization organization = resolveScopedOrganization(actor, organizationId);
        List<Department> departments = includeInactive
                ? departmentRepository.findAllByOrganizationId(organization.getId(), ORGANIZATION_DEPARTMENT_SORT)
                : departmentRepository.findAllByOrganizationIdAndActiveStatusTrue(organization.getId(), ORGANIZATION_DEPARTMENT_SORT);
        return departments.stream()
                .map(department -> toResponse(department, organization))
                .toList();
    }

    public DepartmentResponse createDepartment(DepartmentCreateRequest request, Authentication authentication) {
        User actor = currentUser(authentication);
        Organization organization = resolveScopedOrganization(actor, trimToNull(request.organizationId()));
        Department department = createOrReactivate(organization.getId(), request.departmentName());
        return toResponse(department, organization);
    }

    public DepartmentResponse updateDepartment(String id, DepartmentUpdateRequest request, Authentication authentication) {
        User actor = currentUser(authentication);
        Department department = departmentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Department was not found."));
        Organization organization = authorizeDepartmentAccess(actor, department);

        boolean changed = false;
        String previousDepartmentName = department.getDepartmentName();
        String nextDepartmentName = trimToNull(request.departmentName());

        if (request.departmentName() != null && nextDepartmentName == null) {
            throw new BadRequestException("Department name is required.");
        }

        if (nextDepartmentName != null) {
            DepartmentName normalized = normalizeDepartment(nextDepartmentName);
            boolean sameKey = normalized.key().equals(department.getNormalizedName());
            boolean sameDisplay = normalized.display().equals(department.getDepartmentName());
            if (!sameKey) {
                departmentRepository.findByOrganizationIdAndNormalizedName(organization.getId(), normalized.key())
                        .filter(existing -> !existing.getId().equals(department.getId()))
                        .ifPresent(existing -> {
                            throw new ConflictException("This organization already has that department.");
                        });
            }
            if (!sameKey || !sameDisplay) {
                department.setDepartmentName(normalized.display());
                department.setNormalizedName(normalized.key());
                changed = true;
            }
        }

        if (request.activeStatus() != null && department.isActiveStatus() != request.activeStatus()) {
            department.setActiveStatus(request.activeStatus());
            changed = true;
        }

        if (!changed) {
            throw new BadRequestException("No department changes were provided.");
        }

        Department saved;
        try {
            saved = departmentRepository.save(department);
        } catch (DuplicateKeyException exception) {
            throw new ConflictException("This organization already has that department.");
        }

        if (!Objects.equals(previousDepartmentName, saved.getDepartmentName())) {
            syncAssignedUsers(organization.getId(), saved.getId(), previousDepartmentName, saved.getDepartmentName());
        }

        return toResponse(saved, organization);
    }

    public DepartmentAssignment resolveAssignment(String organizationId, String requestedDepartmentName) {
        String candidate = trimToNull(requestedDepartmentName);
        if (candidate == null) {
            return null;
        }
        Department department = createOrReactivate(organizationId, candidate);
        return new DepartmentAssignment(department.getId(), department.getDepartmentName());
    }

    public void syncDepartmentsForOrganization(String organizationId, List<String> requestedDepartmentNames) {
        if (requestedDepartmentNames == null) {
            return;
        }

        requireOrganization(organizationId);

        LinkedHashSet<String> requestedKeys = new LinkedHashSet<>();
        List<DepartmentName> requestedDepartments = new ArrayList<>();
        for (String requestedDepartmentName : requestedDepartmentNames) {
            DepartmentName normalized = normalizeDepartment(requestedDepartmentName);
            if (!requestedKeys.add(normalized.key())) {
                throw new ConflictException("Duplicate department names are not allowed within the same organization.");
            }
            requestedDepartments.add(normalized);
        }

        for (DepartmentName requestedDepartment : requestedDepartments) {
            createOrReactivate(organizationId, requestedDepartment.display());
        }

        List<Department> existingDepartments = departmentRepository.findAllByOrganizationId(organizationId, ORGANIZATION_DEPARTMENT_SORT);
        boolean changed = false;
        for (Department department : existingDepartments) {
            boolean shouldBeActive = requestedKeys.contains(department.getNormalizedName());
            if (department.isActiveStatus() != shouldBeActive) {
                department.setActiveStatus(shouldBeActive);
                changed = true;
            }
        }

        if (changed) {
            departmentRepository.saveAll(existingDepartments);
        }
    }

    private Department createOrReactivate(String organizationId, String requestedDepartmentName) {
        DepartmentName normalized = normalizeDepartment(requestedDepartmentName);
        Department existing = departmentRepository.findByOrganizationIdAndNormalizedName(organizationId, normalized.key()).orElse(null);
        if (existing != null) {
            boolean changed = false;
            String previousDepartmentName = existing.getDepartmentName();

            if (!normalized.display().equals(existing.getDepartmentName()) || !normalized.key().equals(existing.getNormalizedName())) {
                existing.setDepartmentName(normalized.display());
                existing.setNormalizedName(normalized.key());
                changed = true;
            }
            if (!existing.isActiveStatus()) {
                existing.setActiveStatus(true);
                changed = true;
            }

            if (!changed) {
                return existing;
            }

            try {
                Department saved = departmentRepository.save(existing);
                if (!Objects.equals(previousDepartmentName, saved.getDepartmentName())) {
                    syncAssignedUsers(organizationId, saved.getId(), previousDepartmentName, saved.getDepartmentName());
                }
                return saved;
            } catch (DuplicateKeyException exception) {
                throw new ConflictException("This organization already has that department.");
            }
        }

        Department department = new Department();
        department.setOrganizationId(organizationId);
        department.setDepartmentName(normalized.display());
        department.setNormalizedName(normalized.key());
        department.setActiveStatus(true);
        try {
            return departmentRepository.save(department);
        } catch (DuplicateKeyException exception) {
            throw new ConflictException("This organization already has that department.");
        }
    }

    private void syncAssignedUsers(String organizationId, String departmentId, String previousDepartmentName, String nextDepartmentName) {
        List<User> dirtyUsers = userRepository.findAllByOrganizationId(organizationId).stream()
                .filter(user -> departmentId.equals(user.getDepartmentId()) || equalsIgnoreCase(user.getDepartment(), previousDepartmentName))
                .peek(user -> {
                    user.setDepartmentId(departmentId);
                    user.setDepartment(nextDepartmentName);
                })
                .toList();

        if (!dirtyUsers.isEmpty()) {
            userRepository.saveAll(dirtyUsers);
        }
    }

    private Organization resolveScopedOrganization(User actor, String requestedOrganizationId) {
        if (actor.getRoles().contains(Role.SUPER_ADMIN)) {
            String organizationId = trimToNull(requestedOrganizationId);
            if (organizationId == null) {
                throw new BadRequestException("Select an organization to manage departments.");
            }
            return requireOrganization(organizationId);
        }
        return requireOrganization(requiredOrganizationId(actor));
    }

    private Organization authorizeDepartmentAccess(User actor, Department department) {
        if (!actor.getRoles().contains(Role.SUPER_ADMIN) && !requiredOrganizationId(actor).equals(department.getOrganizationId())) {
            throw new ResourceNotFoundException("Department was not found.");
        }
        return requireOrganization(department.getOrganizationId());
    }

    private Organization requireOrganization(String organizationId) {
        return organizationRepository.findById(organizationId)
                .orElseThrow(() -> new ResourceNotFoundException("Organization was not found."));
    }

    private Map<String, Organization> organizationMap(Collection<String> organizationIds) {
        return organizationRepository.findAllById(organizationIds).stream()
                .collect(Collectors.toMap(Organization::getId, organization -> organization));
    }

    private DepartmentResponse toResponse(Department department, Organization organization) {
        return new DepartmentResponse(
                department.getId(),
                department.getOrganizationId(),
                organization != null ? organization.getCompanyName() : null,
                organization != null ? organization.getCompanyCode() : null,
                department.getDepartmentName(),
                department.isActiveStatus(),
                department.getCreatedAt()
        );
    }

    private DepartmentName normalizeDepartment(String value) {
        String trimmed = trimToNull(value);
        if (trimmed == null) {
            throw new BadRequestException("Department name is required.");
        }

        String compact = trimmed.replaceAll("\\s+", " ");
        if (!DEPARTMENT_PATTERN.matcher(compact).matches()) {
            throw new BadRequestException("Department names must be 2-80 characters and use letters, numbers, spaces, hyphens, slashes, or ampersands.");
        }

        List<String> words = new ArrayList<>();
        for (String word : compact.split(" ")) {
            words.add(normalizeWord(word));
        }

        String display = String.join(" ", words);
        return new DepartmentName(display, display.toUpperCase(Locale.ROOT));
    }

    private String normalizeWord(String value) {
        String upper = value.toUpperCase(Locale.ROOT);
        if (ACRONYMS.contains(upper)) {
            return upper;
        }

        StringBuilder normalized = new StringBuilder();
        StringBuilder segment = new StringBuilder();
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            if (character == '-' || character == '/' || character == '&') {
                appendNormalizedSegment(normalized, segment);
                normalized.append(character);
            } else {
                segment.append(character);
            }
        }
        appendNormalizedSegment(normalized, segment);
        return normalized.toString();
    }

    private void appendNormalizedSegment(StringBuilder normalized, StringBuilder segment) {
        if (segment.isEmpty()) {
            return;
        }

        String word = segment.toString();
        String upper = word.toUpperCase(Locale.ROOT);
        if (ACRONYMS.contains(upper)) {
            normalized.append(upper);
        } else if (word.chars().allMatch(Character::isDigit)) {
            normalized.append(word);
        } else {
            normalized.append(Character.toUpperCase(word.charAt(0)));
            if (word.length() > 1) {
                normalized.append(word.substring(1).toLowerCase(Locale.ROOT));
            }
        }
        segment.setLength(0);
    }

    private String requiredOrganizationId(User user) {
        String organizationId = trimToNull(user.getOrganizationId());
        if (organizationId == null) {
            throw new BadRequestException("Your account is not assigned to an organization.");
        }
        return organizationId;
    }

    private User currentUser(Authentication authentication) {
        if (authentication == null || authentication.getName() == null) {
            throw new BadRequestException("Authentication is required.");
        }
        return userRepository.findById(authentication.getName())
                .orElseThrow(() -> new ResourceNotFoundException("User account was not found."));
    }

    private boolean equalsIgnoreCase(String left, String right) {
        return left != null && right != null && left.equalsIgnoreCase(right);
    }

    private String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private record DepartmentName(String display, String key) {
    }

    public record DepartmentAssignment(String departmentId, String departmentName) {
    }
}
