package com.visitor.management;

import com.visitor.management.repository.PasswordResetTokenRepository;
import com.visitor.management.repository.RefreshTokenRepository;
import com.visitor.management.repository.UserRepository;
import com.visitor.management.repository.VisitorRepository;
import com.visitor.management.repository.VisitorAuditLogRepository;
import com.visitor.management.repository.NotificationRepository;
import com.visitor.management.entity.Notification;
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

    @MockitoBean
    private UserRepository userRepository;

    @MockitoBean
    private VisitorRepository visitorRepository;

    @MockitoBean
    private VisitorAuditLogRepository visitorAuditLogRepository;

    @MockitoBean
    private NotificationRepository notificationRepository;

    @MockitoBean
    private RefreshTokenRepository refreshTokenRepository;

    @MockitoBean
    private PasswordResetTokenRepository passwordResetTokenRepository;

    @MockitoBean
    private MongoTemplate mongoTemplate;

    @BeforeEach
    void setUpUsers() {
        when(userRepository.findById("super-admin-id")).thenReturn(Optional.of(user("super-admin-id", Role.SUPER_ADMIN)));
        when(userRepository.findById("admin-id")).thenReturn(Optional.of(user("admin-id", Role.ADMIN)));
        when(userRepository.findById("employee-id")).thenReturn(Optional.of(user("employee-id", Role.EMPLOYEE)));
        when(userRepository.findById("security-id")).thenReturn(Optional.of(user("security-id", Role.SECURITY_GUARD)));
        when(visitorRepository.findByQrCode(any())).thenReturn(Optional.empty());
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
        user.setEmail(id + "@example.com");
        user.setFullName(id);
        user.setRoles(Set.of(role));
        user.setActive(true);
        return user;
    }

    private Visitor visitor(String id, VisitorStatus status) {
        Visitor visitor = new Visitor();
        visitor.setId(id);
        visitor.setFullName("Test Visitor");
        visitor.setPhone("+919876543210");
        visitor.setPurposeOfVisit("Meeting");
        visitor.setHostEmployeeId("employee-id");
        visitor.setHostEmployee("Employee User");
        visitor.setStatus(status);
        visitor.setQrCode("VST-TEST");
        return visitor;
    }
}
