package com.visitor.management.entity;

import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

@Document(collection = "visitor_audit_logs")
public class VisitorAuditLog {

    @Id
    private String id;

    @Indexed
    private String visitorId;

    @Indexed
    private String actorId;

    private String action;
    private VisitorStatus fromStatus;
    private VisitorStatus toStatus;
    private String note;

    @CreatedDate
    private Instant createdAt;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getVisitorId() {
        return visitorId;
    }

    public void setVisitorId(String visitorId) {
        this.visitorId = visitorId;
    }

    public String getActorId() {
        return actorId;
    }

    public void setActorId(String actorId) {
        this.actorId = actorId;
    }

    public String getAction() {
        return action;
    }

    public void setAction(String action) {
        this.action = action;
    }

    public VisitorStatus getFromStatus() {
        return fromStatus;
    }

    public void setFromStatus(VisitorStatus fromStatus) {
        this.fromStatus = fromStatus;
    }

    public VisitorStatus getToStatus() {
        return toStatus;
    }

    public void setToStatus(VisitorStatus toStatus) {
        this.toStatus = toStatus;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
