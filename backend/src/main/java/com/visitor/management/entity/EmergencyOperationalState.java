package com.visitor.management.entity;

import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

@Document(collection = "emergency_operational_states")
public class EmergencyOperationalState {

    @Id
    private String id;

    @Indexed(unique = true, sparse = true)
    private String organizationId;

    private String organizationName;
    private String organizationCode;
    private boolean lockdownActive;
    private String lockdownReason;
    private String lockdownScope;
    private String lockdownInitiatedById;
    private String lockdownInitiatedByName;
    private Instant lockdownStartedAt;
    private String lockdownClearedById;
    private String lockdownClearedByName;
    private Instant lockdownClearedAt;
    private boolean evacuationActive;
    private String evacuationScope;
    private Instant evacuationStartedAt;
    private String latestBroadcastTitle;
    private String latestBroadcastMessage;
    private EmergencyIncidentSeverity latestBroadcastSeverity;
    private Instant latestBroadcastAt;

    @CreatedDate
    private Instant createdAt;

    @LastModifiedDate
    private Instant updatedAt;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getOrganizationId() {
        return organizationId;
    }

    public void setOrganizationId(String organizationId) {
        this.organizationId = organizationId;
    }

    public String getOrganizationName() {
        return organizationName;
    }

    public void setOrganizationName(String organizationName) {
        this.organizationName = organizationName;
    }

    public String getOrganizationCode() {
        return organizationCode;
    }

    public void setOrganizationCode(String organizationCode) {
        this.organizationCode = organizationCode;
    }

    public boolean isLockdownActive() {
        return lockdownActive;
    }

    public void setLockdownActive(boolean lockdownActive) {
        this.lockdownActive = lockdownActive;
    }

    public String getLockdownReason() {
        return lockdownReason;
    }

    public void setLockdownReason(String lockdownReason) {
        this.lockdownReason = lockdownReason;
    }

    public String getLockdownScope() {
        return lockdownScope;
    }

    public void setLockdownScope(String lockdownScope) {
        this.lockdownScope = lockdownScope;
    }

    public String getLockdownInitiatedById() {
        return lockdownInitiatedById;
    }

    public void setLockdownInitiatedById(String lockdownInitiatedById) {
        this.lockdownInitiatedById = lockdownInitiatedById;
    }

    public String getLockdownInitiatedByName() {
        return lockdownInitiatedByName;
    }

    public void setLockdownInitiatedByName(String lockdownInitiatedByName) {
        this.lockdownInitiatedByName = lockdownInitiatedByName;
    }

    public Instant getLockdownStartedAt() {
        return lockdownStartedAt;
    }

    public void setLockdownStartedAt(Instant lockdownStartedAt) {
        this.lockdownStartedAt = lockdownStartedAt;
    }

    public String getLockdownClearedById() {
        return lockdownClearedById;
    }

    public void setLockdownClearedById(String lockdownClearedById) {
        this.lockdownClearedById = lockdownClearedById;
    }

    public String getLockdownClearedByName() {
        return lockdownClearedByName;
    }

    public void setLockdownClearedByName(String lockdownClearedByName) {
        this.lockdownClearedByName = lockdownClearedByName;
    }

    public Instant getLockdownClearedAt() {
        return lockdownClearedAt;
    }

    public void setLockdownClearedAt(Instant lockdownClearedAt) {
        this.lockdownClearedAt = lockdownClearedAt;
    }

    public boolean isEvacuationActive() {
        return evacuationActive;
    }

    public void setEvacuationActive(boolean evacuationActive) {
        this.evacuationActive = evacuationActive;
    }

    public String getEvacuationScope() {
        return evacuationScope;
    }

    public void setEvacuationScope(String evacuationScope) {
        this.evacuationScope = evacuationScope;
    }

    public Instant getEvacuationStartedAt() {
        return evacuationStartedAt;
    }

    public void setEvacuationStartedAt(Instant evacuationStartedAt) {
        this.evacuationStartedAt = evacuationStartedAt;
    }

    public String getLatestBroadcastTitle() {
        return latestBroadcastTitle;
    }

    public void setLatestBroadcastTitle(String latestBroadcastTitle) {
        this.latestBroadcastTitle = latestBroadcastTitle;
    }

    public String getLatestBroadcastMessage() {
        return latestBroadcastMessage;
    }

    public void setLatestBroadcastMessage(String latestBroadcastMessage) {
        this.latestBroadcastMessage = latestBroadcastMessage;
    }

    public EmergencyIncidentSeverity getLatestBroadcastSeverity() {
        return latestBroadcastSeverity;
    }

    public void setLatestBroadcastSeverity(EmergencyIncidentSeverity latestBroadcastSeverity) {
        this.latestBroadcastSeverity = latestBroadcastSeverity;
    }

    public Instant getLatestBroadcastAt() {
        return latestBroadcastAt;
    }

    public void setLatestBroadcastAt(Instant latestBroadcastAt) {
        this.latestBroadcastAt = latestBroadcastAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
