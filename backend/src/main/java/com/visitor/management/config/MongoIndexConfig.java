package com.visitor.management.config;

import com.visitor.management.entity.Notification;
import com.visitor.management.entity.AccessAuditLog;
import com.visitor.management.entity.EmployeeAttendanceLog;
import com.visitor.management.entity.SuperAdminCreationOtp;
import com.visitor.management.entity.User;
import com.visitor.management.entity.Visitor;
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

@Configuration
@Profile("!test")
public class MongoIndexConfig {

    private static final Logger log = LoggerFactory.getLogger(MongoIndexConfig.class);

    @Bean
    public ApplicationRunner ensureEnterpriseIndexes(MongoTemplate mongoTemplate) {
        return args -> {
            try {
                mongoTemplate.indexOps(Visitor.class).createIndex(new Index()
                        .on("hostEmployeeId", Sort.Direction.ASC)
                        .on("status", Sort.Direction.ASC)
                        .on("createdAt", Sort.Direction.DESC)
                        .named("visitor_host_status_created_idx"));
                mongoTemplate.indexOps(Visitor.class).createIndex(new Index()
                        .on("status", Sort.Direction.ASC)
                        .on("checkInTime", Sort.Direction.DESC)
                        .named("visitor_status_checkin_idx"));
                mongoTemplate.indexOps(Visitor.class).createIndex(new Index()
                        .on("organizationId", Sort.Direction.ASC)
                        .on("status", Sort.Direction.ASC)
                        .on("createdAt", Sort.Direction.DESC)
                        .named("visitor_org_status_created_idx"));
                mongoTemplate.indexOps(Visitor.class).createIndex(new Index()
                        .on("organizationId", Sort.Direction.ASC)
                        .on("visitorType", Sort.Direction.ASC)
                        .on("validityEndDate", Sort.Direction.ASC)
                        .named("visitor_org_type_validity_idx"));
                mongoTemplate.indexOps(Visitor.class).createIndex(new Index()
                        .on("organizationId", Sort.Direction.ASC)
                        .on("status", Sort.Direction.ASC)
                        .on("checkOutTime", Sort.Direction.DESC)
                        .named("visitor_org_status_checkout_idx"));
                mongoTemplate.indexOps(Visitor.class).createIndex(new Index()
                        .on("organizationId", Sort.Direction.ASC)
                        .on("checkInTime", Sort.Direction.DESC)
                        .named("visitor_org_checkin_idx"));
                mongoTemplate.indexOps(Visitor.class).createIndex(new Index()
                        .on("organizationId", Sort.Direction.ASC)
                        .on("rejectedAt", Sort.Direction.DESC)
                        .named("visitor_org_rejected_idx"));
                mongoTemplate.indexOps(Notification.class).createIndex(new Index()
                        .on("recipientUserId", Sort.Direction.ASC)
                        .on("read", Sort.Direction.ASC)
                        .on("createdAt", Sort.Direction.DESC)
                        .named("notification_recipient_read_created_idx"));
                mongoTemplate.indexOps(VisitorAuditLog.class).createIndex(new Index()
                        .on("visitorId", Sort.Direction.ASC)
                        .on("createdAt", Sort.Direction.DESC)
                        .named("audit_visitor_created_idx"));
                mongoTemplate.indexOps(AccessAuditLog.class).createIndex(new Index()
                        .on("action", Sort.Direction.ASC)
                        .on("createdAt", Sort.Direction.DESC)
                        .named("access_audit_action_created_idx"));
                mongoTemplate.indexOps(AccessAuditLog.class).createIndex(new Index()
                        .on("organizationId", Sort.Direction.ASC)
                        .on("action", Sort.Direction.ASC)
                        .on("createdAt", Sort.Direction.DESC)
                        .named("access_audit_org_action_created_idx"));
                mongoTemplate.indexOps(EmployeeAttendanceLog.class).createIndex(new Index()
                        .on("organizationId", Sort.Direction.ASC)
                        .on("attendanceDate", Sort.Direction.DESC)
                        .on("state", Sort.Direction.ASC)
                        .named("employee_attendance_org_date_state_idx"));
                mongoTemplate.indexOps(EmployeeAttendanceLog.class).createIndex(new Index()
                        .on("organizationId", Sort.Direction.ASC)
                        .on("createdAt", Sort.Direction.DESC)
                        .named("employee_attendance_org_created_idx"));
                mongoTemplate.indexOps(EmployeeAttendanceLog.class).createIndex(new Index()
                        .on("employeeUserId", Sort.Direction.ASC)
                        .on("checkInTime", Sort.Direction.DESC)
                        .named("employee_attendance_employee_checkin_idx"));
                mongoTemplate.indexOps(SuperAdminCreationOtp.class).createIndex(new Index()
                        .on("expiresAt", Sort.Direction.ASC)
                        .expire(Duration.ZERO)
                        .named("super_admin_creation_otp_ttl_idx"));
                mongoTemplate.indexOps(User.class).createIndex(new Index()
                        .on("emailVerificationTokenHash", Sort.Direction.ASC)
                        .sparse()
                        .named("user_email_verification_token_idx"));
                mongoTemplate.indexOps(User.class).createIndex(new Index()
                        .on("roles", Sort.Direction.ASC)
                        .on("accountStatus", Sort.Direction.ASC)
                        .named("user_roles_account_status_idx"));
                log.info("AccessFlow MongoDB indexes verified.");
            } catch (RuntimeException ex) {
                log.warn("AccessFlow MongoDB indexes could not be verified during startup: {}", ex.getMessage());
            }
        };
    }
}
