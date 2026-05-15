package com.visitor.management.entity;

import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Document(collection = "visitors")
public class Visitor {

    @Id
    private String id;

    @Indexed
    private String fullName;

    @Indexed
    private String phone;

    private String phoneCountryCode;

    @Indexed
    private String email;

    @Indexed
    private String companyName;

    @Indexed
    private String organizationId;

    private String organizationCode;

    private String organizationName;

    private String organizationTimezone;

    private String organizationRegionCountry;

    private String purposeOfVisit;

    @Indexed
    private VisitorType visitorType = VisitorType.ONE_TIME;

    @Indexed
    private String vendorCompanyName;

    @Indexed
    private String hostEmployeeId;

    @Indexed
    private String hostEmployee;

    private String hostEmployeeDepartment;

    private String sponsorEmployee;

    @Indexed
    private String department;

    @Indexed
    private Instant validityStartDate;

    @Indexed
    private Instant validityEndDate;

    private String recurringSchedule;

    private List<String> allowedWeekdays = new ArrayList<>();

    private String allowedEntryStartTime;

    private String allowedEntryEndTime;

    private String emergencyContact;

    private String notes;

    @Indexed
    private Instant checkInTime;

    private Instant checkOutTime;

    @Indexed
    private Instant scheduledStartTime;

    @Indexed
    private Instant scheduledEndTime;

    private String scheduledTimezone;

    @Indexed
    private Instant approvalExpiresAt;

    @Indexed
    private boolean preApproved;

    @Indexed
    private VisitorStatus status = VisitorStatus.PENDING;

    private String photoUrl;

    private String photoPublicId;

    private Instant approvedAt;

    private Instant rejectedAt;

    private String approvedBy;

    private String rejectedBy;

    private String rejectionReason;

    private Instant suspendedAt;

    private String suspendedBy;

    private String suspensionReason;

    private Instant revokedAt;

    private String revokedBy;

    private String revocationReason;

    private List<VisitorStatusHistoryEntry> statusHistory = new ArrayList<>();

    @Indexed(unique = true, sparse = true)
    private String qrCode;

    @Indexed(unique = true, sparse = true)
    private String badgeId;

    @Indexed(unique = true, sparse = true)
    private String passTokenId;

    private Instant qrIssuedAt;

    private Instant qrExpiresAt;

    private Instant badgePrintedAt;

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

    public String getFullName() {
        return fullName;
    }

    public void setFullName(String fullName) {
        this.fullName = fullName;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public String getPhoneCountryCode() {
        return phoneCountryCode;
    }

    public void setPhoneCountryCode(String phoneCountryCode) {
        this.phoneCountryCode = phoneCountryCode;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getCompanyName() {
        return companyName;
    }

    public void setCompanyName(String companyName) {
        this.companyName = companyName;
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

    public String getOrganizationRegionCountry() {
        return organizationRegionCountry;
    }

    public void setOrganizationRegionCountry(String organizationRegionCountry) {
        this.organizationRegionCountry = organizationRegionCountry;
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

    public String getVendorCompanyName() {
        return vendorCompanyName;
    }

    public void setVendorCompanyName(String vendorCompanyName) {
        this.vendorCompanyName = vendorCompanyName;
    }

    public String getHostEmployeeId() {
        return hostEmployeeId;
    }

    public void setHostEmployeeId(String hostEmployeeId) {
        this.hostEmployeeId = hostEmployeeId;
    }

    public String getHostEmployee() {
        return hostEmployee;
    }

    public void setHostEmployee(String hostEmployee) {
        this.hostEmployee = hostEmployee;
    }

    public String getHostEmployeeDepartment() {
        return hostEmployeeDepartment;
    }

    public void setHostEmployeeDepartment(String hostEmployeeDepartment) {
        this.hostEmployeeDepartment = hostEmployeeDepartment;
    }

    public String getSponsorEmployee() {
        return sponsorEmployee;
    }

    public void setSponsorEmployee(String sponsorEmployee) {
        this.sponsorEmployee = sponsorEmployee;
    }

    public String getDepartment() {
        return department;
    }

    public void setDepartment(String department) {
        this.department = department;
    }

    public Instant getValidityStartDate() {
        return validityStartDate;
    }

    public void setValidityStartDate(Instant validityStartDate) {
        this.validityStartDate = validityStartDate;
    }

    public Instant getValidityEndDate() {
        return validityEndDate;
    }

    public void setValidityEndDate(Instant validityEndDate) {
        this.validityEndDate = validityEndDate;
    }

    public String getRecurringSchedule() {
        return recurringSchedule;
    }

    public void setRecurringSchedule(String recurringSchedule) {
        this.recurringSchedule = recurringSchedule;
    }

    public List<String> getAllowedWeekdays() {
        return allowedWeekdays;
    }

    public void setAllowedWeekdays(List<String> allowedWeekdays) {
        this.allowedWeekdays = allowedWeekdays;
    }

    public String getAllowedEntryStartTime() {
        return allowedEntryStartTime;
    }

    public void setAllowedEntryStartTime(String allowedEntryStartTime) {
        this.allowedEntryStartTime = allowedEntryStartTime;
    }

    public String getAllowedEntryEndTime() {
        return allowedEntryEndTime;
    }

    public void setAllowedEntryEndTime(String allowedEntryEndTime) {
        this.allowedEntryEndTime = allowedEntryEndTime;
    }

    public String getEmergencyContact() {
        return emergencyContact;
    }

    public void setEmergencyContact(String emergencyContact) {
        this.emergencyContact = emergencyContact;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public Instant getCheckInTime() {
        return checkInTime;
    }

    public void setCheckInTime(Instant checkInTime) {
        this.checkInTime = checkInTime;
    }

    public Instant getCheckOutTime() {
        return checkOutTime;
    }

    public void setCheckOutTime(Instant checkOutTime) {
        this.checkOutTime = checkOutTime;
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

    public String getScheduledTimezone() {
        return scheduledTimezone;
    }

    public void setScheduledTimezone(String scheduledTimezone) {
        this.scheduledTimezone = scheduledTimezone;
    }

    public Instant getApprovalExpiresAt() {
        return approvalExpiresAt;
    }

    public void setApprovalExpiresAt(Instant approvalExpiresAt) {
        this.approvalExpiresAt = approvalExpiresAt;
    }

    public boolean isPreApproved() {
        return preApproved;
    }

    public void setPreApproved(boolean preApproved) {
        this.preApproved = preApproved;
    }

    public VisitorStatus getStatus() {
        return status;
    }

    public void setStatus(VisitorStatus status) {
        this.status = status;
    }

    public String getPhotoUrl() {
        return photoUrl;
    }

    public void setPhotoUrl(String photoUrl) {
        this.photoUrl = photoUrl;
    }

    public String getPhotoPublicId() {
        return photoPublicId;
    }

    public void setPhotoPublicId(String photoPublicId) {
        this.photoPublicId = photoPublicId;
    }

    public Instant getApprovedAt() {
        return approvedAt;
    }

    public void setApprovedAt(Instant approvedAt) {
        this.approvedAt = approvedAt;
    }

    public Instant getRejectedAt() {
        return rejectedAt;
    }

    public void setRejectedAt(Instant rejectedAt) {
        this.rejectedAt = rejectedAt;
    }

    public String getApprovedBy() {
        return approvedBy;
    }

    public void setApprovedBy(String approvedBy) {
        this.approvedBy = approvedBy;
    }

    public String getRejectedBy() {
        return rejectedBy;
    }

    public void setRejectedBy(String rejectedBy) {
        this.rejectedBy = rejectedBy;
    }

    public String getRejectionReason() {
        return rejectionReason;
    }

    public void setRejectionReason(String rejectionReason) {
        this.rejectionReason = rejectionReason;
    }

    public Instant getSuspendedAt() {
        return suspendedAt;
    }

    public void setSuspendedAt(Instant suspendedAt) {
        this.suspendedAt = suspendedAt;
    }

    public String getSuspendedBy() {
        return suspendedBy;
    }

    public void setSuspendedBy(String suspendedBy) {
        this.suspendedBy = suspendedBy;
    }

    public String getSuspensionReason() {
        return suspensionReason;
    }

    public void setSuspensionReason(String suspensionReason) {
        this.suspensionReason = suspensionReason;
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

    public List<VisitorStatusHistoryEntry> getStatusHistory() {
        return statusHistory;
    }

    public void setStatusHistory(List<VisitorStatusHistoryEntry> statusHistory) {
        this.statusHistory = statusHistory;
    }

    public String getQrCode() {
        return qrCode;
    }

    public void setQrCode(String qrCode) {
        this.qrCode = qrCode;
    }

    public String getBadgeId() {
        return badgeId;
    }

    public void setBadgeId(String badgeId) {
        this.badgeId = badgeId;
    }

    public String getPassTokenId() {
        return passTokenId;
    }

    public void setPassTokenId(String passTokenId) {
        this.passTokenId = passTokenId;
    }

    public Instant getQrIssuedAt() {
        return qrIssuedAt;
    }

    public void setQrIssuedAt(Instant qrIssuedAt) {
        this.qrIssuedAt = qrIssuedAt;
    }

    public Instant getQrExpiresAt() {
        return qrExpiresAt;
    }

    public void setQrExpiresAt(Instant qrExpiresAt) {
        this.qrExpiresAt = qrExpiresAt;
    }

    public Instant getBadgePrintedAt() {
        return badgePrintedAt;
    }

    public void setBadgePrintedAt(Instant badgePrintedAt) {
        this.badgePrintedAt = badgePrintedAt;
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
