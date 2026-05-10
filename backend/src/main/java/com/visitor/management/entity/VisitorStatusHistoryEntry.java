package com.visitor.management.entity;

import java.time.Instant;

public class VisitorStatusHistoryEntry {

    private VisitorStatus status;
    private String action;
    private String actorId;
    private String note;
    private Instant timestamp;

    public VisitorStatus getStatus() {
        return status;
    }

    public void setStatus(VisitorStatus status) {
        this.status = status;
    }

    public String getAction() {
        return action;
    }

    public void setAction(String action) {
        this.action = action;
    }

    public String getActorId() {
        return actorId;
    }

    public void setActorId(String actorId) {
        this.actorId = actorId;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }

    public Instant getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(Instant timestamp) {
        this.timestamp = timestamp;
    }
}
