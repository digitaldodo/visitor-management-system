package com.visitor.management.config;

import com.visitor.management.entity.Notification;
import com.visitor.management.entity.Visitor;
import com.visitor.management.entity.VisitorAuditLog;
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

    @Bean
    public ApplicationRunner ensureEnterpriseIndexes(MongoTemplate mongoTemplate) {
        return args -> {
            mongoTemplate.indexOps(Visitor.class).createIndex(new Index()
                    .on("hostEmployeeId", Sort.Direction.ASC)
                    .on("status", Sort.Direction.ASC)
                    .on("createdAt", Sort.Direction.DESC)
                    .named("visitor_host_status_created_idx"));
            mongoTemplate.indexOps(Visitor.class).createIndex(new Index()
                    .on("status", Sort.Direction.ASC)
                    .on("checkInTime", Sort.Direction.DESC)
                    .named("visitor_status_checkin_idx"));
            mongoTemplate.indexOps(Notification.class).createIndex(new Index()
                    .on("recipientUserId", Sort.Direction.ASC)
                    .on("read", Sort.Direction.ASC)
                    .on("createdAt", Sort.Direction.DESC)
                    .named("notification_recipient_read_created_idx"));
            mongoTemplate.indexOps(VisitorAuditLog.class).createIndex(new Index()
                    .on("visitorId", Sort.Direction.ASC)
                    .on("createdAt", Sort.Direction.DESC)
                    .named("audit_visitor_created_idx"));
        };
    }
}
