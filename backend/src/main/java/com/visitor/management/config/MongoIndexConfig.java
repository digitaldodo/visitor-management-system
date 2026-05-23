package com.visitor.management.config;

import com.visitor.management.entity.Notification;
import com.visitor.management.entity.AccessAuditLog;
import com.visitor.management.entity.Department;
import com.visitor.management.entity.EmployeeAttendanceLog;
import com.visitor.management.entity.EmergencyIncident;
import com.visitor.management.entity.MobileDeviceRegistration;
import com.visitor.management.entity.Organization;
import com.visitor.management.entity.PasswordResetToken;
import com.visitor.management.entity.RefreshToken;
import com.visitor.management.entity.SuperAdminCreationOtp;
import com.visitor.management.entity.User;
import com.visitor.management.entity.Visitor;
import com.visitor.management.entity.VisitorInvite;
import com.visitor.management.entity.VisitorAuditLog;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.index.Index;

import java.time.Duration;
import java.util.function.Supplier;

@Configuration
@Profile("!test")
public class MongoIndexConfig {

    private static final Logger log = LoggerFactory.getLogger(MongoIndexConfig.class);

    @Bean
    public ApplicationRunner ensureEnterpriseIndexes(MongoTemplate mongoTemplate) {
        return args -> {
            createIndex(mongoTemplate, User.class, () -> new Index()
                    .on("email", Sort.Direction.ASC)
                    .unique()
                    .named("user_email_unique_idx"));
            createIndex(mongoTemplate, User.class, () -> new Index()
                    .on("username", Sort.Direction.ASC)
                    .unique()
                    .sparse()
                    .named("user_username_unique_idx"));
            createIndex(mongoTemplate, User.class, () -> new Index()
                    .on("fullName", Sort.Direction.ASC)
                    .named("user_full_name_idx"));
            createIndex(mongoTemplate, User.class, () -> new Index()
                    .on("organizationId", Sort.Direction.ASC)
                    .on("fullName", Sort.Direction.ASC)
                    .named("user_org_full_name_idx"));
            createIndex(mongoTemplate, User.class, () -> new Index()
                    .on("organizationId", Sort.Direction.ASC)
                    .on("roles", Sort.Direction.ASC)
                    .on("accountStatus", Sort.Direction.ASC)
                    .named("user_org_roles_account_status_idx"));
            createIndex(mongoTemplate, User.class, () -> new Index()
                    .on("organizationId", Sort.Direction.ASC)
                    .on("workforceOnboardingCreatedById", Sort.Direction.ASC)
                    .named("user_org_workforce_creator_idx"));
            createIndex(mongoTemplate, User.class, () -> new Index()
                    .on("organizationCode", Sort.Direction.ASC)
                    .named("user_org_code_idx"));
            createIndex(mongoTemplate, User.class, () -> new Index()
                    .on("employeeQrToken", Sort.Direction.ASC)
                    .unique()
                    .sparse()
                    .named("user_employee_qr_token_unique_idx"));
            createIndex(mongoTemplate, User.class, () -> new Index()
                    .on("emailVerificationTokenHash", Sort.Direction.ASC)
                    .sparse()
                    .named("user_email_verification_token_idx"));
            createIndex(mongoTemplate, User.class, () -> new Index()
                    .on("roles", Sort.Direction.ASC)
                    .on("accountStatus", Sort.Direction.ASC)
                    .named("user_roles_account_status_idx"));

            createIndex(mongoTemplate, Organization.class, () -> new Index()
                    .on("companyCode", Sort.Direction.ASC)
                    .unique()
                    .named("organization_company_code_unique_idx"));
            createIndex(mongoTemplate, Organization.class, () -> new Index()
                    .on("companyName", Sort.Direction.ASC)
                    .named("organization_company_name_idx"));
            createIndex(mongoTemplate, Organization.class, () -> new Index()
                    .on("activeStatus", Sort.Direction.ASC)
                    .on("companyName", Sort.Direction.ASC)
                    .named("organization_active_name_idx"));

            createIndex(mongoTemplate, Department.class, () -> new Index()
                    .on("organizationId", Sort.Direction.ASC)
                    .on("normalizedName", Sort.Direction.ASC)
                    .unique()
                    .named("uk_department_org_normalized"));
            createIndex(mongoTemplate, Department.class, () -> new Index()
                    .on("organizationId", Sort.Direction.ASC)
                    .on("activeStatus", Sort.Direction.ASC)
                    .on("departmentName", Sort.Direction.ASC)
                    .named("department_org_active_name_idx"));
            createIndex(mongoTemplate, Department.class, () -> new Index()
                    .on("activeStatus", Sort.Direction.ASC)
                    .on("organizationId", Sort.Direction.ASC)
                    .on("departmentName", Sort.Direction.ASC)
                    .named("department_active_org_name_idx"));

            createIndex(mongoTemplate, Visitor.class, () -> new Index()
                    .on("qrCode", Sort.Direction.ASC)
                    .unique()
                    .sparse()
                    .named("visitor_qr_code_unique_idx"));
            createIndex(mongoTemplate, Visitor.class, () -> new Index()
                    .on("passTokenId", Sort.Direction.ASC)
                    .unique()
                    .sparse()
                    .named("visitor_pass_token_unique_idx"));
            createIndex(mongoTemplate, Visitor.class, () -> new Index()
                    .on("badgeId", Sort.Direction.ASC)
                    .unique()
                    .sparse()
                    .named("visitor_badge_unique_idx"));
            createIndex(mongoTemplate, Visitor.class, () -> new Index()
                    .on("clientRequestId", Sort.Direction.ASC)
                    .unique()
                    .sparse()
                    .named("visitor_client_request_unique_idx"));
            createIndex(mongoTemplate, Visitor.class, () -> new Index()
                    .on("email", Sort.Direction.ASC)
                    .on("createdAt", Sort.Direction.DESC)
                    .named("visitor_email_created_idx"));
            createIndex(mongoTemplate, Visitor.class, () -> new Index()
                    .on("email", Sort.Direction.ASC)
                    .on("organizationId", Sort.Direction.ASC)
                    .on("createdAt", Sort.Direction.DESC)
                    .named("visitor_email_org_created_idx"));
            createIndex(mongoTemplate, Visitor.class, () -> new Index()
                    .on("organizationId", Sort.Direction.ASC)
                    .on("updatedAt", Sort.Direction.DESC)
                    .named("visitor_org_updated_idx"));
            createIndex(mongoTemplate, Visitor.class, () -> new Index()
                        .on("hostEmployeeId", Sort.Direction.ASC)
                        .on("status", Sort.Direction.ASC)
                        .on("createdAt", Sort.Direction.DESC)
                        .named("visitor_host_status_created_idx"));
            createIndex(mongoTemplate, Visitor.class, () -> new Index()
                    .on("hostEmployeeId", Sort.Direction.ASC)
                    .on("createdAt", Sort.Direction.DESC)
                    .named("visitor_host_created_idx"));
            createIndex(mongoTemplate, Visitor.class, () -> new Index()
                        .on("status", Sort.Direction.ASC)
                        .on("checkInTime", Sort.Direction.DESC)
                        .named("visitor_status_checkin_idx"));
            createIndex(mongoTemplate, Visitor.class, () -> new Index()
                        .on("organizationId", Sort.Direction.ASC)
                        .on("status", Sort.Direction.ASC)
                        .on("createdAt", Sort.Direction.DESC)
                        .named("visitor_org_status_created_idx"));
            createIndex(mongoTemplate, Visitor.class, () -> new Index()
                        .on("organizationId", Sort.Direction.ASC)
                        .on("visitorType", Sort.Direction.ASC)
                        .on("validityEndDate", Sort.Direction.ASC)
                        .named("visitor_org_type_validity_idx"));
            createIndex(mongoTemplate, Visitor.class, () -> new Index()
                        .on("organizationId", Sort.Direction.ASC)
                        .on("status", Sort.Direction.ASC)
                        .on("checkOutTime", Sort.Direction.DESC)
                        .named("visitor_org_status_checkout_idx"));
            createIndex(mongoTemplate, Visitor.class, () -> new Index()
                        .on("organizationId", Sort.Direction.ASC)
                        .on("checkInTime", Sort.Direction.DESC)
                        .named("visitor_org_checkin_idx"));
            createIndex(mongoTemplate, Visitor.class, () -> new Index()
                        .on("organizationId", Sort.Direction.ASC)
                        .on("rejectedAt", Sort.Direction.DESC)
                        .named("visitor_org_rejected_idx"));
            createIndex(mongoTemplate, Visitor.class, () -> new Index()
                    .on("organizationId", Sort.Direction.ASC)
                    .on("createdAt", Sort.Direction.DESC)
                    .named("visitor_org_created_idx"));
            createIndex(mongoTemplate, Visitor.class, () -> new Index()
                    .on("organizationId", Sort.Direction.ASC)
                    .on("scheduledStartTime", Sort.Direction.ASC)
                    .named("visitor_org_scheduled_start_idx"));
            createIndex(mongoTemplate, Visitor.class, () -> new Index()
                    .on("organizationId", Sort.Direction.ASC)
                    .on("validityEndDate", Sort.Direction.DESC)
                    .named("visitor_org_validity_end_idx"));
            createIndex(mongoTemplate, Visitor.class, () -> new Index()
                    .on("checkInTime", Sort.Direction.ASC)
                    .named("visitor_checkin_range_idx"));

            createIndex(mongoTemplate, Notification.class, () -> new Index()
                        .on("recipientUserId", Sort.Direction.ASC)
                        .on("read", Sort.Direction.ASC)
                        .on("createdAt", Sort.Direction.DESC)
                        .named("notification_recipient_read_created_idx"));
            createIndex(mongoTemplate, Notification.class, () -> new Index()
                        .on("recipientUserId", Sort.Direction.ASC)
                        .on("organizationId", Sort.Direction.ASC)
                        .on("createdAt", Sort.Direction.DESC)
                        .named("notification_recipient_org_created_idx"));
            createIndex(mongoTemplate, Notification.class, () -> new Index()
                        .on("dedupeKey", Sort.Direction.ASC)
                        .unique()
                        .sparse()
                        .named("notification_dedupe_key_idx"));
            createIndex(mongoTemplate, Notification.class, () -> new Index()
                    .on("emailEnabled", Sort.Direction.ASC)
                    .on("emailStatus", Sort.Direction.ASC)
                    .on("emailAttempts", Sort.Direction.ASC)
                    .on("createdAt", Sort.Direction.ASC)
                    .named("notification_email_retry_idx"));
            createIndex(mongoTemplate, Notification.class, () -> new Index()
                    .on("recipientUserId", Sort.Direction.ASC)
                    .on("type", Sort.Direction.ASC)
                    .on("visitorId", Sort.Direction.ASC)
                    .on("createdAt", Sort.Direction.DESC)
                    .named("notification_recipient_type_visitor_created_idx"));

            createIndex(mongoTemplate, Visitor.class, () -> new Index()
                        .on("status", Sort.Direction.ASC)
                        .on("scheduledStartTime", Sort.Direction.ASC)
                        .named("visitor_status_scheduled_start_idx"));
            createIndex(mongoTemplate, Visitor.class, () -> new Index()
                        .on("status", Sort.Direction.ASC)
                        .on("accessWindowStartTime", Sort.Direction.ASC)
                        .named("visitor_status_access_start_idx"));
            createIndex(mongoTemplate, VisitorInvite.class, () -> new Index()
                    .on("tokenHash", Sort.Direction.ASC)
                    .unique()
                    .named("visitor_invite_token_unique_idx"));
            createIndex(mongoTemplate, VisitorInvite.class, () -> new Index()
                    .on("visitorId", Sort.Direction.ASC)
                    .named("visitor_invite_visitor_idx"));
            createIndex(mongoTemplate, VisitorInvite.class, () -> new Index()
                    .on("hostEmployeeId", Sort.Direction.ASC)
                    .on("createdAt", Sort.Direction.DESC)
                    .named("visitor_invite_host_created_idx"));
            createIndex(mongoTemplate, VisitorInvite.class, () -> new Index()
                    .on("organizationId", Sort.Direction.ASC)
                    .on("createdAt", Sort.Direction.DESC)
                    .named("visitor_invite_org_created_idx"));
            createIndex(mongoTemplate, VisitorInvite.class, () -> new Index()
                    .on("visitorEmail", Sort.Direction.ASC)
                    .on("createdAt", Sort.Direction.DESC)
                    .named("visitor_invite_email_created_idx"));
            createIndex(mongoTemplate, VisitorInvite.class, () -> new Index()
                    .on("visitorEmail", Sort.Direction.ASC)
                    .on("organizationId", Sort.Direction.ASC)
                    .on("createdAt", Sort.Direction.DESC)
                    .named("visitor_invite_email_org_created_idx"));
            createIndex(mongoTemplate, VisitorInvite.class, () -> new Index()
                    .on("status", Sort.Direction.ASC)
                    .on("expiresAt", Sort.Direction.ASC)
                    .named("visitor_invite_status_expires_idx"));
            createIndex(mongoTemplate, VisitorInvite.class, () -> new Index()
                        .on("visitorEmail", Sort.Direction.ASC)
                        .on("emailStatus", Sort.Direction.ASC)
                        .on("emailAttempts", Sort.Direction.ASC)
                        .named("visitor_invite_email_retry_idx"));

            createIndex(mongoTemplate, VisitorAuditLog.class, () -> new Index()
                        .on("visitorId", Sort.Direction.ASC)
                        .on("createdAt", Sort.Direction.DESC)
                        .named("audit_visitor_created_idx"));
            createIndex(mongoTemplate, AccessAuditLog.class, () -> new Index()
                        .on("action", Sort.Direction.ASC)
                        .on("createdAt", Sort.Direction.DESC)
                        .named("access_audit_action_created_idx"));
            createIndex(mongoTemplate, AccessAuditLog.class, () -> new Index()
                        .on("organizationId", Sort.Direction.ASC)
                        .on("action", Sort.Direction.ASC)
                        .on("createdAt", Sort.Direction.DESC)
                        .named("access_audit_org_action_created_idx"));
            createIndex(mongoTemplate, AccessAuditLog.class, () -> new Index()
                    .on("organizationId", Sort.Direction.ASC)
                    .on("createdAt", Sort.Direction.DESC)
                    .named("access_audit_org_created_idx"));

            createIndex(mongoTemplate, EmployeeAttendanceLog.class, () -> new Index()
                        .on("organizationId", Sort.Direction.ASC)
                        .on("attendanceDate", Sort.Direction.DESC)
                        .on("state", Sort.Direction.ASC)
                        .named("employee_attendance_org_date_state_idx"));
            createIndex(mongoTemplate, EmployeeAttendanceLog.class, () -> new Index()
                        .on("organizationId", Sort.Direction.ASC)
                        .on("createdAt", Sort.Direction.DESC)
                        .named("employee_attendance_org_created_idx"));
            createIndex(mongoTemplate, EmployeeAttendanceLog.class, () -> new Index()
                        .on("employeeUserId", Sort.Direction.ASC)
                        .on("checkInTime", Sort.Direction.DESC)
                        .named("employee_attendance_employee_checkin_idx"));
            createIndex(mongoTemplate, EmployeeAttendanceLog.class, () -> new Index()
                    .on("employeeUserId", Sort.Direction.ASC)
                    .on("attendanceDate", Sort.Direction.ASC)
                    .on("createdAt", Sort.Direction.DESC)
                    .named("employee_attendance_employee_date_created_idx"));
            createIndex(mongoTemplate, EmployeeAttendanceLog.class, () -> new Index()
                    .on("employeeUserId", Sort.Direction.ASC)
                    .on("createdAt", Sort.Direction.DESC)
                    .named("employee_attendance_employee_created_idx"));

            createIndex(mongoTemplate, EmergencyIncident.class, () -> new Index()
                    .on("organizationId", Sort.Direction.ASC)
                    .on("createdAt", Sort.Direction.DESC)
                    .named("emergency_incident_org_created_idx"));
            createIndex(mongoTemplate, EmergencyIncident.class, () -> new Index()
                    .on("organizationId", Sort.Direction.ASC)
                    .on("subjectType", Sort.Direction.ASC)
                    .on("subjectId", Sort.Direction.ASC)
                    .named("emergency_incident_org_subject_idx"));

            createIndex(mongoTemplate, MobileDeviceRegistration.class, () -> new Index()
                    .on("expoPushToken", Sort.Direction.ASC)
                    .unique()
                    .sparse()
                    .named("mobile_device_expo_token_unique_idx"));
            createIndex(mongoTemplate, MobileDeviceRegistration.class, () -> new Index()
                    .on("fcmToken", Sort.Direction.ASC)
                    .unique()
                    .sparse()
                    .named("mobile_device_fcm_token_unique_idx"));
            createIndex(mongoTemplate, MobileDeviceRegistration.class, () -> new Index()
                    .on("userId", Sort.Direction.ASC)
                    .on("active", Sort.Direction.ASC)
                    .named("mobile_device_user_active_idx"));
            createIndex(mongoTemplate, MobileDeviceRegistration.class, () -> new Index()
                    .on("userId", Sort.Direction.ASC)
                    .on("deviceId", Sort.Direction.ASC)
                    .named("mobile_device_user_device_idx"));
            createIndex(mongoTemplate, MobileDeviceRegistration.class, () -> new Index()
                    .on("organizationId", Sort.Direction.ASC)
                    .on("deviceId", Sort.Direction.ASC)
                    .named("mobile_device_org_device_idx"));

            createIndex(mongoTemplate, RefreshToken.class, () -> new Index()
                    .on("tokenHash", Sort.Direction.ASC)
                    .unique()
                    .named("refresh_token_hash_unique_idx"));
            createIndex(mongoTemplate, RefreshToken.class, () -> new Index()
                    .on("userId", Sort.Direction.ASC)
                    .on("revokedAt", Sort.Direction.ASC)
                    .named("refresh_token_user_revoked_idx"));

            createIndex(mongoTemplate, PasswordResetToken.class, () -> new Index()
                    .on("tokenHash", Sort.Direction.ASC)
                    .unique()
                    .sparse()
                    .named("password_reset_token_hash_unique_idx"));
            createIndex(mongoTemplate, PasswordResetToken.class, () -> new Index()
                    .on("resetTokenHash", Sort.Direction.ASC)
                    .unique()
                    .sparse()
                    .named("password_reset_reset_token_hash_unique_idx"));
            createIndex(mongoTemplate, PasswordResetToken.class, () -> new Index()
                    .on("userId", Sort.Direction.ASC)
                    .on("usedAt", Sort.Direction.ASC)
                    .on("createdAt", Sort.Direction.DESC)
                    .named("password_reset_user_used_created_idx"));

            createIndex(mongoTemplate, SuperAdminCreationOtp.class, () -> new Index()
                        .on("expiresAt", Sort.Direction.ASC)
                        .expire(Duration.ZERO)
                        .named("super_admin_creation_otp_ttl_idx"));
            log.info("AccessFlow MongoDB indexes verified.");
        };
    }

    private <T> void createIndex(MongoTemplate mongoTemplate, Class<T> entityClass, Supplier<Index> indexSupplier) {
        Index index = indexSupplier.get();
        try {
            mongoTemplate.indexOps(entityClass).createIndex(index);
        } catch (RuntimeException ex) {
            log.warn("AccessFlow MongoDB index '{}' on {} could not be verified during startup: {}",
                    index.getIndexOptions().get("name"), entityClass.getSimpleName(), ex.getMessage());
        }
    }
}
