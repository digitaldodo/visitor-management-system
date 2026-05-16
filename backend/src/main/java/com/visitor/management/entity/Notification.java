package com.visitor.management.entity;

import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

@Document(collection = "notifications")
public class Notification {

    @Id
    private String id;

    @Indexed
    private String recipientUserId;

    private String recipientEmail;

    private String recipientName;

    @Indexed
    private NotificationType type;

    private NotificationCategory category;

    private NotificationPriority priority = NotificationPriority.MEDIUM;

    private String title;

    private String message;

    private String visitorId;

    private String visitorName;

    private String actionUrl;

    private String actorName;

    private String organizationTimezone;

    @Indexed
    private boolean read;

    private boolean emailEnabled;

    private NotificationStatus emailStatus = NotificationStatus.PENDING;

    private int emailAttempts;

    private String lastEmailError;

    private Instant emailLastAttemptAt;

    private Instant readAt;

    @CreatedDate
    @Indexed
    private Instant createdAt;

    @LastModifiedDate
    private Instant updatedAt;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getRecipientUserId() {
        return recipientUserId;
    }

    public void setRecipientUserId(String recipientUserId) {
        this.recipientUserId = recipientUserId;
    }

    public String getRecipientEmail() {
        return recipientEmail;
    }

    public void setRecipientEmail(String recipientEmail) {
        this.recipientEmail = recipientEmail;
    }

    public String getRecipientName() {
        return recipientName;
    }

    public void setRecipientName(String recipientName) {
        this.recipientName = recipientName;
    }

    public NotificationType getType() {
        return type;
    }

    public void setType(NotificationType type) {
        this.type = type;
    }

    public NotificationCategory getCategory() {
        return category;
    }

    public void setCategory(NotificationCategory category) {
        this.category = category;
    }

    public NotificationPriority getPriority() {
        return priority;
    }

    public void setPriority(NotificationPriority priority) {
        this.priority = priority;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public String getVisitorId() {
        return visitorId;
    }

    public void setVisitorId(String visitorId) {
        this.visitorId = visitorId;
    }

    public String getVisitorName() {
        return visitorName;
    }

    public void setVisitorName(String visitorName) {
        this.visitorName = visitorName;
    }

    public String getActionUrl() {
        return actionUrl;
    }

    public void setActionUrl(String actionUrl) {
        this.actionUrl = actionUrl;
    }

    public String getActorName() {
        return actorName;
    }

    public void setActorName(String actorName) {
        this.actorName = actorName;
    }

    public String getOrganizationTimezone() {
        return organizationTimezone;
    }

    public void setOrganizationTimezone(String organizationTimezone) {
        this.organizationTimezone = organizationTimezone;
    }

    public boolean isRead() {
        return read;
    }

    public void setRead(boolean read) {
        this.read = read;
    }

    public boolean isEmailEnabled() {
        return emailEnabled;
    }

    public void setEmailEnabled(boolean emailEnabled) {
        this.emailEnabled = emailEnabled;
    }

    public NotificationStatus getEmailStatus() {
        return emailStatus;
    }

    public void setEmailStatus(NotificationStatus emailStatus) {
        this.emailStatus = emailStatus;
    }

    public int getEmailAttempts() {
        return emailAttempts;
    }

    public void setEmailAttempts(int emailAttempts) {
        this.emailAttempts = emailAttempts;
    }

    public String getLastEmailError() {
        return lastEmailError;
    }

    public void setLastEmailError(String lastEmailError) {
        this.lastEmailError = lastEmailError;
    }

    public Instant getEmailLastAttemptAt() {
        return emailLastAttemptAt;
    }

    public void setEmailLastAttemptAt(Instant emailLastAttemptAt) {
        this.emailLastAttemptAt = emailLastAttemptAt;
    }

    public Instant getReadAt() {
        return readAt;
    }

    public void setReadAt(Instant readAt) {
        this.readAt = readAt;
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
