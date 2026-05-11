package com.visitor.management.service;

import com.visitor.management.dto.DepartmentUpdateRequest;
import com.visitor.management.entity.Department;
import com.visitor.management.entity.Organization;
import com.visitor.management.entity.Role;
import com.visitor.management.entity.User;
import com.visitor.management.exception.ConflictException;
import com.visitor.management.repository.DepartmentRepository;
import com.visitor.management.repository.OrganizationRepository;
import com.visitor.management.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Sort;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DepartmentServiceTest {

    @Mock
    private DepartmentRepository departmentRepository;

    @Mock
    private OrganizationRepository organizationRepository;

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private DepartmentService departmentService;

    @Test
    void listDepartmentsKeepsAdminScopedToOwnOrganization() {
        User admin = user("admin-1", Role.ADMIN, "org-1");
        Organization organization = organization("org-1", "Northstar", "NORTHSTAR");
        Department department = department("dept-1", "org-1", "Operations", "OPERATIONS", true);

        when(userRepository.findById("admin-1")).thenReturn(Optional.of(admin));
        when(organizationRepository.findById("org-1")).thenReturn(Optional.of(organization));
        when(departmentRepository.findAllByOrganizationId(eq("org-1"), any(Sort.class))).thenReturn(List.of(department));

        var response = departmentService.listDepartments(authentication(admin), "org-2", true);

        assertThat(response).singleElement().satisfies(item -> {
            assertThat(item.organizationId()).isEqualTo("org-1");
            assertThat(item.departmentName()).isEqualTo("Operations");
        });
        verify(departmentRepository, never()).findAllByOrganizationId(eq("org-2"), any(Sort.class));
    }

    @Test
    void resolveAssignmentNormalizesAndCreatesDepartment() {
        Department saved = department("dept-2", "org-1", "Visitor Desk", "VISITOR DESK", true);

        when(departmentRepository.findByOrganizationIdAndNormalizedName("org-1", "VISITOR DESK")).thenReturn(Optional.empty());
        when(departmentRepository.save(any(Department.class))).thenReturn(saved);

        DepartmentService.DepartmentAssignment assignment = departmentService.resolveAssignment("org-1", "  visitor   desk  ");

        assertThat(assignment).isNotNull();
        assertThat(assignment.departmentId()).isEqualTo("dept-2");
        assertThat(assignment.departmentName()).isEqualTo("Visitor Desk");
    }

    @Test
    void syncDepartmentsRejectsDuplicatesAfterNormalization() {
        when(organizationRepository.findById("org-1")).thenReturn(Optional.of(organization("org-1", "Northstar", "NORTHSTAR")));

        assertThatThrownBy(() -> departmentService.syncDepartmentsForOrganization("org-1", List.of("IT", "  it  ")))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("Duplicate department names");
    }

    @Test
    void updateDepartmentRenamesAndSyncsLegacyUsers() {
        User admin = user("admin-1", Role.ADMIN, "org-1");
        Organization organization = organization("org-1", "Northstar", "NORTHSTAR");
        Department existing = department("dept-1", "org-1", "operations", "OPERATIONS", true);
        Department saved = department("dept-1", "org-1", "Operations", "OPERATIONS", true);

        User legacyUser = user("user-1", Role.EMPLOYEE, "org-1");
        legacyUser.setDepartment("operations");

        User linkedUser = user("user-2", Role.SECURITY_GUARD, "org-1");
        linkedUser.setDepartmentId("dept-1");
        linkedUser.setDepartment("operations");

        when(userRepository.findById("admin-1")).thenReturn(Optional.of(admin));
        when(departmentRepository.findById("dept-1")).thenReturn(Optional.of(existing));
        when(organizationRepository.findById("org-1")).thenReturn(Optional.of(organization));
        when(departmentRepository.save(any(Department.class))).thenReturn(saved);
        when(userRepository.findAllByOrganizationId("org-1")).thenReturn(List.of(legacyUser, linkedUser));

        var response = departmentService.updateDepartment("dept-1", new DepartmentUpdateRequest("operations", null), authentication(admin));

        assertThat(response.departmentName()).isEqualTo("Operations");

        ArgumentCaptor<List<User>> savedUsers = ArgumentCaptor.forClass(List.class);
        verify(userRepository).saveAll(savedUsers.capture());
        assertThat(savedUsers.getValue())
                .extracting(User::getDepartment)
                .containsOnly("Operations");
    }

    private UsernamePasswordAuthenticationToken authentication(User user) {
        return new UsernamePasswordAuthenticationToken(
                user.getId(),
                "secret",
                user.getRoles().stream()
                        .map(role -> new SimpleGrantedAuthority("ROLE_" + role.name()))
                        .toList()
        );
    }

    private User user(String id, Role role, String organizationId) {
        User user = new User();
        user.setId(id);
        user.setRoles(Set.of(role));
        user.setOrganizationId(organizationId);
        return user;
    }

    private Organization organization(String id, String companyName, String companyCode) {
        Organization organization = new Organization();
        organization.setId(id);
        organization.setCompanyName(companyName);
        organization.setCompanyCode(companyCode);
        return organization;
    }

    private Department department(String id, String organizationId, String departmentName, String normalizedName, boolean active) {
        Department department = new Department();
        department.setId(id);
        department.setOrganizationId(organizationId);
        department.setDepartmentName(departmentName);
        department.setNormalizedName(normalizedName);
        department.setActiveStatus(active);
        return department;
    }
}
