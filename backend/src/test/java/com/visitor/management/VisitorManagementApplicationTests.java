package com.visitor.management;

import com.visitor.management.repository.PasswordResetTokenRepository;
import com.visitor.management.repository.RefreshTokenRepository;
import com.visitor.management.repository.UserRepository;
import com.visitor.management.repository.VisitorRepository;
import com.visitor.management.repository.VisitorAuditLogRepository;
import com.visitor.management.repository.NotificationRepository;
import com.visitor.management.repository.OrganizationRepository;
import com.visitor.management.repository.HomepageSettingsRepository;
import com.visitor.management.entity.Notification;
import com.visitor.management.entity.Organization;
import com.visitor.management.entity.Role;
import com.visitor.management.entity.User;
import com.visitor.management.entity.Visitor;
import com.visitor.management.entity.VisitorStatus;
import com.visitor.management.security.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Optional;
import java.util.Set;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class VisitorManagementApplicationTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @MockitoBean
    private UserRepository userRepository;

    @MockitoBean
    private VisitorRepository visitorRepository;

    @MockitoBean
    private VisitorAuditLogRepository visitorAuditLogRepository;

    @MockitoBean
    private NotificationRepository notificationRepository;

    @MockitoBean
    private OrganizationRepository organizationRepository;

    @MockitoBean
    private HomepageSettingsRepository homepageSettingsRepository;

    @MockitoBean
    private RefreshTokenRepository refreshTokenRepository;

    @MockitoBean
    private PasswordResetTokenRepository passwordResetTokenRepository;

    @MockitoBean
    private MongoTemplate mongoTemplate;

    @BeforeEach
    void setUpUsers() {
        Organization organization = organization();
        when(organizationRepository.findById("org-acme")).thenReturn(Optional.of(organization));
        when(organizationRepository.findByCompanyCodeIgnoreCase("ACME")).thenReturn(Optional.of(organization));
        when(organizationRepository.findByCompanyNameIgnoreCase("Acme Corp")).thenReturn(Optional.of(organization));
        when(homepageSettingsRepository.findById("homepage")).thenReturn(Optional.empty());
        when(userRepository.findById("super-admin-id")).thenReturn(Optional.of(user("super-admin-id", Role.SUPER_ADMIN)));
        when(userRepository.findById("admin-id")).thenReturn(Optional.of(user("admin-id", Role.ADMIN)));
        when(userRepository.findById("employee-id")).thenReturn(Optional.of(user("employee-id", Role.EMPLOYEE)));
        when(userRepository.findById("security-id")).thenReturn(Optional.of(user("security-id", Role.SECURITY_GUARD)));
        when(userRepository.findById("employee-target-id")).thenReturn(Optional.of(user("employee-target-id", Role.EMPLOYEE)));
        when(userRepository.findById("admin-target-id")).thenReturn(Optional.of(user("admin-target-id", Role.ADMIN)));
        when(userRepository.findById("super-admin-target-id")).thenReturn(Optional.of(user("super-admin-target-id", Role.SUPER_ADMIN)));
        when(userRepository.findByUsernameIgnoreCase("super-admin-id")).thenReturn(Optional.of(user("super-admin-id", Role.SUPER_ADMIN)));
        when(userRepository.findByUsernameIgnoreCase("admin-id")).thenReturn(Optional.of(user("admin-id", Role.ADMIN)));
        when(userRepository.findByUsernameIgnoreCase("employee-id")).thenReturn(Optional.of(user("employee-id", Role.EMPLOYEE)));
        when(userRepository.findByUsernameIgnoreCase("security-id")).thenReturn(Optional.of(user("security-id", Role.SECURITY_GUARD)));
        when(userRepository.findByEmailIgnoreCase("employee-id@example.com")).thenReturn(Optional.of(user("employee-id", Role.EMPLOYEE)));
        when(visitorRepository.findByQrCode(any())).thenReturn(Optional.empty());
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(visitorRepository.save(any(Visitor.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(notificationRepository.save(any(Notification.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void contextLoads() {
    }

    @Test
    void accessTokenStoresRoleClaims() {
        String token = jwtService.generateToken("employee-id", "employee@example.com", Set.of(Role.EMPLOYEE));

        org.assertj.core.api.Assertions.assertThat(jwtService.getRoles(token)).containsExactly(Role.EMPLOYEE);
    }

    @Test
    void protectedRoleRoutesRequireAuthentication() throws Exception {
        mockMvc.perform(get("/api/v1/admin/overview"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void adminUserCreationRequiresAuthentication() throws Exception {
        mockMvc.perform(post("/api/v1/admin/users")
                        .contentType("application/json")
                        .content("""
                                {
                                  "fullName": "Employee User",
                                  "username": "employee01",
                                  "email": "employee01@example.com",
                                  "password": "SecurePass123!",
                                  "role": "EMPLOYEE",
                                  "companyCode": "ACME"
                                }
                                """))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void healthEndpointsArePublic() throws Exception {
        mockMvc.perform(get("/api/v1/health/live"))
                .andExpect(status().isOk());
    }

    @Test
    void homepageEndpointReturnsSafeEmptyStateByDefault() throws Exception {
        mockMvc.perform(get("/api/v1/homepage"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.featuredMetrics").isArray())
                .andExpect(jsonPath("$.data.featuredMetrics.length()").value(0))
                .andExpect(jsonPath("$.data.publicCounters").isArray())
                .andExpect(jsonPath("$.data.publicCounters.length()").value(0));
    }

    @Test
    void unprefixedPublicLoginIssuesTokens() throws Exception {
        mockMvc.perform(post("/auth/login")
                        .contentType("application/json")
                        .content("""
                                {
                                  "identifier": "employee-id",
                                  "companyCode": "ACME",
                                  "portalAudience": "employee",
                                  "password": "SecurePass123!"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.data.roles[0]").value("EMPLOYEE"));
    }

    @Test
    void superAdminCanLoginThroughAnyInternalPortal() throws Exception {
        mockMvc.perform(post("/auth/login")
                        .contentType("application/json")
                        .content("""
                                {
                                  "identifier": "super-admin-id",
                                  "portalAudience": "admin",
                                  "password": "SecurePass123!"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.roles[0]").value("SUPER_ADMIN"));

        mockMvc.perform(post("/auth/login")
                        .contentType("application/json")
                        .content("""
                                {
                                  "identifier": "super-admin-id",
                                  "portalAudience": "employee",
                                  "password": "SecurePass123!"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.roles[0]").value("SUPER_ADMIN"));

        mockMvc.perform(post("/auth/login")
                        .contentType("application/json")
                        .content("""
                                {
                                  "identifier": "super-admin-id",
                                  "portalAudience": "security",
                                  "password": "SecurePass123!"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.roles[0]").value("SUPER_ADMIN"));
    }

    @Test
    void nonSuperAdminRolesCannotLoginThroughOtherInternalPortals() throws Exception {
        mockMvc.perform(post("/auth/login")
                        .contentType("application/json")
                        .content("""
                                {
                                  "identifier": "admin-id",
                                  "companyCode": "ACME",
                                  "portalAudience": "employee",
                                  "password": "SecurePass123!"
                                }
                                """))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/auth/login")
                        .contentType("application/json")
                        .content("""
                                {
                                  "identifier": "employee-id",
                                  "companyCode": "ACME",
                                  "portalAudience": "admin",
                                  "password": "SecurePass123!"
                                }
                                """))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/auth/login")
                        .contentType("application/json")
                        .content("""
                                {
                                  "identifier": "security-id",
                                  "companyCode": "ACME",
                                  "portalAudience": "employee",
                                  "password": "SecurePass123!"
                                }
                                """))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void adminCanLoginThroughAdminPortalOnly() throws Exception {
        mockMvc.perform(post("/auth/login")
                        .contentType("application/json")
                        .content("""
                                {
                                  "identifier": "admin-id",
                                  "companyCode": "ACME",
                                  "portalAudience": "admin",
                                  "password": "SecurePass123!"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.roles[0]").value("ADMIN"));
    }

    @Test
    void adminCannotAccessEmployeeNamespace() throws Exception {
        mockMvc.perform(get("/api/v1/employee/overview")
                        .header(HttpHeaders.AUTHORIZATION, bearer("admin-id", Role.ADMIN)))
                .andExpect(status().isForbidden());
    }

    @Test
    void employeeCannotAccessSecurityNamespace() throws Exception {
        mockMvc.perform(get("/api/v1/security/overview")
                        .header(HttpHeaders.AUTHORIZATION, bearer("employee-id", Role.EMPLOYEE)))
                .andExpect(status().isForbidden());
    }

    @Test
    void authenticatedUsersCanLoadNotifications() throws Exception {
        Notification notification = new Notification();
        notification.setId("notification-id");
        notification.setRecipientUserId("employee-id");
        notification.setTitle("Visitor checked in");
        notification.setMessage("Test Visitor has checked in.");
        when(notificationRepository.countByRecipientUserIdAndReadFalse("employee-id")).thenReturn(1L);
        when(notificationRepository.findByRecipientUserIdOrderByCreatedAtDesc(any(), any())).thenReturn(List.of(notification));

        mockMvc.perform(get("/api/v1/notifications")
                        .header(HttpHeaders.AUTHORIZATION, bearer("employee-id", Role.EMPLOYEE)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.unreadCount").value(1))
                .andExpect(jsonPath("$.data.items[0].title").value("Visitor checked in"));
    }

    @Test
    void roleOwnedNamespacesAllowMatchingRoles() throws Exception {
        mockMvc.perform(get("/api/v1/admin/overview")
                        .header(HttpHeaders.AUTHORIZATION, bearer("super-admin-id", Role.SUPER_ADMIN)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/admin/overview")
                        .header(HttpHeaders.AUTHORIZATION, bearer("admin-id", Role.ADMIN)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/employee/overview")
                        .header(HttpHeaders.AUTHORIZATION, bearer("employee-id", Role.EMPLOYEE)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/security/overview")
                        .header(HttpHeaders.AUTHORIZATION, bearer("security-id", Role.SECURITY_GUARD)))
                .andExpect(status().isOk());
    }

    @Test
    void publicRegistrationCreatesOnlyVisitorAccounts() throws Exception {
        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType("application/json")
                        .content("""
                                {
                                  "fullName": "Visitor User",
                                  "username": "visitor01",
                                  "email": "visitor@example.com",
                                  "password": "SecurePass123!",
                                  "companyCode": "ACME"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.roles[0]").value("VISITOR"));
    }

    @Test
    void publicRegistrationRejectsLegacyDottedUsername() throws Exception {
        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType("application/json")
                        .content("""
                                {
                                  "fullName": "Legacy Visitor",
                                  "username": "legacy.visitor",
                                  "email": "legacy@example.com",
                                  "password": "SecurePass123!",
                                  "companyCode": "ACME"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].message").value("Username can contain only lowercase letters, numbers, and underscores."));
    }

    @Test
    void unprefixedPublicRegistrationCreatesOnlyVisitorAccounts() throws Exception {
        mockMvc.perform(post("/auth/register")
                        .contentType("application/json")
                        .content("""
                                {
                                  "fullName": "Direct Visitor",
                                  "username": "directvisitor01",
                                  "email": "direct.visitor@example.com",
                                  "password": "SecurePass123!",
                                  "companyCode": "ACME"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.roles[0]").value("VISITOR"));
    }

    @Test
    void publicRegistrationIgnoresInvalidBearerToken() throws Exception {
        mockMvc.perform(post("/auth/register")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer not-a-valid-token")
                        .contentType("application/json")
                        .content("""
                                {
                                  "fullName": "Tokenless Visitor",
                                  "username": "tokenless01",
                                  "email": "tokenless.visitor@example.com",
                                  "password": "SecurePass123!",
                                  "companyCode": "ACME"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.roles[0]").value("VISITOR"));
    }

    @Test
    void publicRegistrationRejectsInternalRoleInjection() throws Exception {
        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType("application/json")
                        .content("""
                                {
                                  "fullName": "Internal User",
                                  "username": "internal01",
                                  "email": "internal@example.com",
                                  "password": "SecurePass123!",
                                  "role": "EMPLOYEE"
                                }
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void adminCanCreateSecurityGuardInternally() throws Exception {
        mockMvc.perform(post("/api/v1/admin/users")
                        .header(HttpHeaders.AUTHORIZATION, bearer("admin-id", Role.ADMIN))
                        .contentType("application/json")
                        .content("""
                                {
                                  "fullName": "Security User",
                                  "username": "security01",
                                  "email": "security01@example.com",
                                  "password": "SecurePass123!",
                                  "role": "SECURITY_GUARD",
                                  "companyCode": "ACME",
                                  "department": "Front Desk"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.roles[0]").value("SECURITY_GUARD"));
    }

    @Test
    void adminCannotCreateAdminInternally() throws Exception {
        mockMvc.perform(post("/api/v1/admin/users")
                        .header(HttpHeaders.AUTHORIZATION, bearer("admin-id", Role.ADMIN))
                        .contentType("application/json")
                        .content("""
                                {
                                  "fullName": "Admin User",
                                  "username": "admin01",
                                  "email": "admin01@example.com",
                                  "password": "SecurePass123!",
                                  "role": "ADMIN",
                                  "companyCode": "ACME"
                                }
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void adminCannotCreateVisitorInternally() throws Exception {
        mockMvc.perform(post("/api/v1/admin/users")
                        .header(HttpHeaders.AUTHORIZATION, bearer("admin-id", Role.ADMIN))
                        .contentType("application/json")
                        .content("""
                                {
                                  "fullName": "Visitor User",
                                  "username": "visitorinternal01",
                                  "email": "visitor.internal@example.com",
                                  "password": "SecurePass123!",
                                  "role": "VISITOR",
                                  "companyCode": "ACME"
                                }
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void adminCanChangeEmployeeToSecurityGuardInternally() throws Exception {
        mockMvc.perform(patch("/api/v1/admin/users/employee-target-id/role")
                        .header(HttpHeaders.AUTHORIZATION, bearer("admin-id", Role.ADMIN))
                        .contentType("application/json")
                        .content("""
                                {
                                  "role": "SECURITY_GUARD"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.roles[0]").value("SECURITY_GUARD"));
    }

    @Test
    void adminCannotMutateAdminAccountRole() throws Exception {
        mockMvc.perform(patch("/api/v1/admin/users/admin-target-id/role")
                        .header(HttpHeaders.AUTHORIZATION, bearer("admin-id", Role.ADMIN))
                        .contentType("application/json")
                        .content("""
                                {
                                  "role": "EMPLOYEE"
                                }
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void adminCannotMutateSuperAdminAccountRole() throws Exception {
        mockMvc.perform(patch("/api/v1/admin/users/super-admin-target-id/role")
                        .header(HttpHeaders.AUTHORIZATION, bearer("super-admin-id", Role.SUPER_ADMIN))
                        .contentType("application/json")
                        .content("""
                                {
                                  "role": "EMPLOYEE"
                                }
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void securityCanRegisterVisitor() throws Exception {
        mockMvc.perform(post("/api/v1/security/visitors")
                        .header(HttpHeaders.AUTHORIZATION, bearer("security-id", Role.SECURITY_GUARD))
                        .contentType("application/json")
                        .content("""
                                {
                                  "fullName": "Priya Shah",
                                  "phone": "+919876543210",
                                  "email": "priya@example.com",
                                  "companyName": "Acme Corp",
                                  "companyCode": "ACME",
                                  "purposeOfVisit": "Vendor meeting",
                                  "hostEmployee": "Aarav Mehta",
                                  "photoUrl": "https://res.cloudinary.com/accessflow-test/image/upload/v1/visitor.jpg",
                                  "photoPublicId": "visitor-management/visitor-photos/visitor-test"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.fullName").value("Priya Shah"))
                .andExpect(jsonPath("$.data.status").value("PENDING"))
                .andExpect(jsonPath("$.data.qrCode").doesNotExist());
    }

    @Test
    void employeeCanPreApproveScheduledVisitor() throws Exception {
        mockMvc.perform(post("/api/v1/employee/pre-approvals")
                        .header(HttpHeaders.AUTHORIZATION, bearer("employee-id", Role.EMPLOYEE))
                        .contentType("application/json")
                        .content("""
                                {
                                  "fullName": "Sana Khan",
                                  "phone": "+919876543211",
                                  "email": "sana@example.com",
                                  "companyName": "Acme Corp",
                                  "companyCode": "ACME",
                                  "purposeOfVisit": "Project review",
                                  "scheduledStartTime": "2099-05-12T04:30:00Z",
                                  "scheduledEndTime": "2099-05-12T06:30:00Z",
                                  "timezone": "Asia/Calcutta",
                                  "note": "Pre-cleared for reception"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.fullName").value("Sana Khan"))
                .andExpect(jsonPath("$.data.status").value("APPROVED"))
                .andExpect(jsonPath("$.data.preApproved").value(true))
                .andExpect(jsonPath("$.data.scheduledTimezone").value("Asia/Calcutta"))
                .andExpect(jsonPath("$.data.qrCode").exists());
    }

    @Test
    void checkoutRequiresCheckedInVisitor() throws Exception {
        Visitor visitor = visitor("visitor-id", VisitorStatus.PENDING);
        when(visitorRepository.findById("visitor-id")).thenReturn(Optional.of(visitor));

        mockMvc.perform(patch("/api/v1/security/visitors/visitor-id/check-out")
                        .header(HttpHeaders.AUTHORIZATION, bearer("security-id", Role.SECURITY_GUARD)))
                .andExpect(status().isBadRequest());
    }

    private String bearer(String subject, Role role) {
        return "Bearer " + jwtService.generateToken(subject, subject + "@example.com", Set.of(role));
    }

    private User user(String id, Role role) {
        User user = new User();
        user.setId(id);
        user.setUsername(id);
        user.setEmail(id + "@example.com");
        user.setFullName(id);
        user.setPasswordHash(passwordEncoder.encode("SecurePass123!"));
        user.setRoles(Set.of(role));
        user.setActive(true);
        if (role != Role.SUPER_ADMIN) {
            user.setOrganizationId("org-acme");
            user.setOrganizationName("Acme Corp");
            user.setOrganizationCode("ACME");
        }
        return user;
    }

    private Organization organization() {
        Organization organization = new Organization();
        organization.setId("org-acme");
        organization.setCompanyName("Acme Corp");
        organization.setCompanyCode("ACME");
        organization.setActiveStatus(true);
        return organization;
    }

    private Visitor visitor(String id, VisitorStatus status) {
        Visitor visitor = new Visitor();
        visitor.setId(id);
        visitor.setFullName("Test Visitor");
        visitor.setPhone("+919876543210");
        visitor.setPurposeOfVisit("Meeting");
        visitor.setHostEmployeeId("employee-id");
        visitor.setHostEmployee("Employee User");
        visitor.setOrganizationId("org-acme");
        visitor.setOrganizationName("Acme Corp");
        visitor.setOrganizationCode("ACME");
        visitor.setCompanyName("Acme Corp");
        visitor.setStatus(status);
        visitor.setQrCode("VST-TEST");
        return visitor;
    }
}
