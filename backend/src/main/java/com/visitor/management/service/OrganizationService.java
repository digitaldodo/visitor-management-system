package com.visitor.management.service;

import com.visitor.management.dto.OrganizationRequest;
import com.visitor.management.dto.OrganizationResponse;
import com.visitor.management.entity.Organization;
import com.visitor.management.entity.Role;
import com.visitor.management.entity.User;
import com.visitor.management.exception.BadRequestException;
import com.visitor.management.exception.ConflictException;
import com.visitor.management.exception.ResourceNotFoundException;
import com.visitor.management.repository.OrganizationRepository;
import com.visitor.management.repository.UserRepository;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Locale;

@Service
public class OrganizationService {

    private final OrganizationRepository organizationRepository;
    private final UserRepository userRepository;

    public OrganizationService(OrganizationRepository organizationRepository, UserRepository userRepository) {
        this.organizationRepository = organizationRepository;
        this.userRepository = userRepository;
    }

    public List<OrganizationResponse> listAll() {
        return organizationRepository.findAll(Sort.by(Sort.Direction.ASC, "companyName"))
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
        return organizationRepository.findAllByActiveStatusTrue(Sort.by(Sort.Direction.ASC, "companyName"))
                .stream()
                .map(this::toResponse)
                .toList();
    }

    public OrganizationResponse create(OrganizationRequest request) {
        String companyCode = normalizeCode(request.companyCode());
        if (organizationRepository.existsByCompanyCodeIgnoreCase(companyCode)) {
            throw new ConflictException("An organization with this company code already exists.");
        }
        Organization organization = new Organization();
        organization.setCompanyName(request.companyName().trim());
        organization.setCompanyCode(companyCode);
        organization.setAddress(trimToNull(request.address()));
        organization.setContactEmail(trimToNull(request.contactEmail()));
        organization.setActiveStatus(request.activeStatus() == null || request.activeStatus());
        return toResponse(organizationRepository.save(organization));
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
                organization.isActiveStatus(),
                organization.getCreatedAt(),
                organization.getUpdatedAt()
        );
    }

    private String normalizeCode(String value) {
        return value.trim().toUpperCase(Locale.ROOT);
    }

    private String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private User currentUser(String actorId) {
        return userRepository.findById(actorId)
                .orElseThrow(() -> new ResourceNotFoundException("User account was not found."));
    }
}
