package com.visitor.management.entity;

import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

@Document(collection = "visitor_invites")
public class VisitorInvite {

    @Id
    private String id;

    @Indexed(unique = true)
    private String tokenHash;

    @Indexed
    private String organizationId;

    private String organizationCode;

    private String organizationName;

    private String organizationTimezone;

    @Indexed
    private String hostEmployeeId;

    private String hostEmployeeName;

    private String hostEmployeeEmail;

    private String visitorName;

    @Indexed
    private String visitorEmail;

    private String visitorPhone;

    private String phoneCountryCode;

    private String companyName;

    private String purposeOfVisit;

    private VisitorType visitorType = VisitorType.ONE_TIME;

    private Instant scheduledStartTime;

    private Instant scheduledEndTime;

    private Long expectedDurationMinutes;

    private String timezone;

    private boolean approvalRequired;

    @Indexed
    private VisitorInviteStatus status = VisitorInviteStatus.INVITED;

    private String inviteUrl;

    private String mobileInviteUrl;

    @Indexed
    private Instant expiresAt;

    private Instant viewedAt;

    private Instant registrationCompletedAt;

    private Instant qrIssuedAt;

    private Instant arrivedAt;

    private Instant revokedAt;

    private String revokedBy;

    private String revocationReason;

    private String visitorId;

    private String note;

    @Indexed
    private NotificationStatus emailStatus = NotificationStatus.FAILED;

    private int emailAttempts;

    private Instant emailLastAttemptAt;

    private Instant emailSentAt;

    private String lastEmailError;

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

    public String getTokenHash() {
        return tokenHash;
    }

    public void setTokenHash(String tokenHash) {
        this.tokenHash = tokenHash;
    }

    public String getOrganizationId() {
        return organizationId;
    }

    public void setOrganizationId(String organizationId) {
        this.organizationId = organizationId;
    }

    public String getOrganizationCode() {
        return organizationCode;
    }

    public void setOrganizationCode(String organizationCode) {
        this.organizationCode = organizationCode;
    }

    public String getOrganizationName() {
        return organizationName;
    }

    public void setOrganizationName(String organizationName) {
        this.organizationName = organizationName;
    }

    public String getOrganizationTimezone() {
        return organizationTimezone;
    }

    public void setOrganizationTimezone(String organizationTimezone) {
        this.organizationTimezone = organizationTimezone;
    }

    public String getHostEmployeeId() {
        return hostEmployeeId;
    }

    public void setHostEmployeeId(String hostEmployeeId) {
        this.hostEmployeeId = hostEmployeeId;
    }

    public String getHostEmployeeName() {
        return hostEmployeeName;
    }

    public void setHostEmployeeName(String hostEmployeeName) {
        this.hostEmployeeName = hostEmployeeName;
    }

    public String getHostEmployeeEmail() {
        return hostEmployeeEmail;
    }

    public void setHostEmployeeEmail(String hostEmployeeEmail) {
        this.hostEmployeeEmail = hostEmployeeEmail;
    }

    public String getVisitorName() {
        return visitorName;
    }

    public void setVisitorName(String visitorName) {
        this.visitorName = visitorName;
    }

    public String getVisitorEmail() {
        return visitorEmail;
    }

    public void setVisitorEmail(String visitorEmail) {
        this.visitorEmail = visitorEmail;
    }

    public String getVisitorPhone() {
        return visitorPhone;
    }

    public void setVisitorPhone(String visitorPhone) {
        this.visitorPhone = visitorPhone;
    }

    public String getPhoneCountryCode() {
        return phoneCountryCode;
    }

    public void setPhoneCountryCode(String phoneCountryCode) {
        this.phoneCountryCode = phoneCountryCode;
    }

    public String getCompanyName() {
        return companyName;
    }

    public void setCompanyName(String companyName) {
        this.companyName = companyName;
    }

    public String getPurposeOfVisit() {
        return purposeOfVisit;
    }

    public void setPurposeOfVisit(String purposeOfVisit) {
        this.purposeOfVisit = purposeOfVisit;
    }

    public VisitorType getVisitorType() {
        return visitorType;
    }

    public void setVisitorType(VisitorType visitorType) {
        this.visitorType = visitorType;
    }

    public Instant getScheduledStartTime() {
        return scheduledStartTime;
    }

    public void setScheduledStartTime(Instant scheduledStartTime) {
        this.scheduledStartTime = scheduledStartTime;
    }

    public Instant getScheduledEndTime() {
        return scheduledEndTime;
    }

    public void setScheduledEndTime(Instant scheduledEndTime) {
        this.scheduledEndTime = scheduledEndTime;
    }

    public Long getExpectedDurationMinutes() {
        return expectedDurationMinutes;
    }

    public void setExpectedDurationMinutes(Long expectedDurationMinutes) {
        this.expectedDurationMinutes = expectedDurationMinutes;
    }

    public String getTimezone() {
        return timezone;
    }

    public void setTimezone(String timezone) {
        this.timezone = timezone;
    }

    public boolean isApprovalRequired() {
        return approvalRequired;
    }

    public void setApprovalRequired(boolean approvalRequired) {
        this.approvalRequired = approvalRequired;
    }

    public VisitorInviteStatus getStatus() {
        return status;
    }

    public void setStatus(VisitorInviteStatus status) {
        this.status = status;
    }

    public String getInviteUrl() {
        return inviteUrl;
    }

    public void setInviteUrl(String inviteUrl) {
        this.inviteUrl = inviteUrl;
    }

    public String getMobileInviteUrl() {
        return mobileInviteUrl;
    }

    public void setMobileInviteUrl(String mobileInviteUrl) {
        this.mobileInviteUrl = mobileInviteUrl;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(Instant expiresAt) {
        this.expiresAt = expiresAt;
    }

    public Instant getViewedAt() {
        return viewedAt;
    }

    public void setViewedAt(Instant viewedAt) {
        this.viewedAt = viewedAt;
    }

    public Instant getRegistrationCompletedAt() {
        return registrationCompletedAt;
    }

    public void setRegistrationCompletedAt(Instant registrationCompletedAt) {
        this.registrationCompletedAt = registrationCompletedAt;
    }

    public Instant getQrIssuedAt() {
        return qrIssuedAt;
    }

    public void setQrIssuedAt(Instant qrIssuedAt) {
        this.qrIssuedAt = qrIssuedAt;
    }

    public Instant getArrivedAt() {
        return arrivedAt;
    }

    public void setArrivedAt(Instant arrivedAt) {
        this.arrivedAt = arrivedAt;
    }

    public Instant getRevokedAt() {
        return revokedAt;
    }

    public void setRevokedAt(Instant revokedAt) {
        this.revokedAt = revokedAt;
    }

    public String getRevokedBy() {
        return revokedBy;
    }

    public void setRevokedBy(String revokedBy) {
        this.revokedBy = revokedBy;
    }

    public String getRevocationReason() {
        return revocationReason;
    }

    public void setRevocationReason(String revocationReason) {
        this.revocationReason = revocationReason;
    }

    public String getVisitorId() {
        return visitorId;
    }

    public void setVisitorId(String visitorId) {
        this.visitorId = visitorId;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
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

    public Instant getEmailLastAttemptAt() {
        return emailLastAttemptAt;
    }

    public void setEmailLastAttemptAt(Instant emailLastAttemptAt) {
        this.emailLastAttemptAt = emailLastAttemptAt;
    }

    public Instant getEmailSentAt() {
        return emailSentAt;
    }

    public void setEmailSentAt(Instant emailSentAt) {
        this.emailSentAt = emailSentAt;
    }

    public String getLastEmailError() {
        return lastEmailError;
    }

    public void setLastEmailError(String lastEmailError) {
        this.lastEmailError = lastEmailError;
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
