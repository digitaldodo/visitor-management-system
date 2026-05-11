package com.visitor.management.config;

import com.visitor.management.entity.Notification;
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
                mongoTemplate.indexOps(Notification.class).createIndex(new Index()
                        .on("recipientUserId", Sort.Direction.ASC)
                        .on("read", Sort.Direction.ASC)
                        .on("createdAt", Sort.Direction.DESC)
                        .named("notification_recipient_read_created_idx"));
                mongoTemplate.indexOps(VisitorAuditLog.class).createIndex(new Index()
                        .on("visitorId", Sort.Direction.ASC)
                        .on("createdAt", Sort.Direction.DESC)
                        .named("audit_visitor_created_idx"));
                log.info("AccessFlow MongoDB indexes verified.");
            } catch (RuntimeException ex) {
                log.warn("AccessFlow MongoDB indexes could not be verified during startup: {}", ex.getMessage());
            }
        };
    }
}
