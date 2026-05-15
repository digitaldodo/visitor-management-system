package com.visitor.management.entity;

import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;

@Document(collection = "users")
public class User {

    @Id
    private String id;

    @Indexed(unique = true)
    private String email;

    @Indexed(unique = true, sparse = true)
    private String username;

    private String fullName;

    private String passwordHash;

    private String department;

    private String departmentId;

    @Indexed(sparse = true)
    private String employeeId;

    private String designation;

    private String employeeType;

    private String employeePhotoUrl;

    private String shiftName;

    private Set<String> workingDays = new HashSet<>();

    private String shiftStartTime;

    private String shiftEndTime;

    private Integer gracePeriodMinutes;

    private String overtimePolicy;

    @Indexed(unique = true, sparse = true)
    private String employeeQrToken;

    private Instant employeeQrIssuedAt;

    private Instant employeeQrRevokedAt;

    private String phone;

    private String phoneCountryCode;

    @Indexed
    private String organizationId;

    private String organizationName;

    @Indexed
    private String organizationCode;

    private String organizationTimezone;

    private String organizationRegionCountry;

    private Set<Role> roles = new HashSet<>();

    private boolean active = true;

    private AccountStatus accountStatus = AccountStatus.ACTIVE;

    private Instant passwordChangedAt;

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

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getFullName() {
        return fullName;
    }

    public void setFullName(String fullName) {
        this.fullName = fullName;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public String getDepartment() {
        return department;
    }

    public void setDepartment(String department) {
        this.department = department;
    }

    public String getDepartmentId() {
        return departmentId;
    }

    public void setDepartmentId(String departmentId) {
        this.departmentId = departmentId;
    }

    public String getEmployeeId() {
        return employeeId;
    }

    public void setEmployeeId(String employeeId) {
        this.employeeId = employeeId;
    }

    public String getDesignation() {
        return designation;
    }

    public void setDesignation(String designation) {
        this.designation = designation;
    }

    public String getEmployeeType() {
        return employeeType;
    }

    public void setEmployeeType(String employeeType) {
        this.employeeType = employeeType;
    }

    public String getEmployeePhotoUrl() {
        return employeePhotoUrl;
    }

    public void setEmployeePhotoUrl(String employeePhotoUrl) {
        this.employeePhotoUrl = employeePhotoUrl;
    }

    public String getShiftName() {
        return shiftName;
    }

    public void setShiftName(String shiftName) {
        this.shiftName = shiftName;
    }

    public Set<String> getWorkingDays() {
        return workingDays;
    }

    public void setWorkingDays(Set<String> workingDays) {
        this.workingDays = workingDays;
    }

    public String getShiftStartTime() {
        return shiftStartTime;
    }

    public void setShiftStartTime(String shiftStartTime) {
        this.shiftStartTime = shiftStartTime;
    }

    public String getShiftEndTime() {
        return shiftEndTime;
    }

    public void setShiftEndTime(String shiftEndTime) {
        this.shiftEndTime = shiftEndTime;
    }

    public Integer getGracePeriodMinutes() {
        return gracePeriodMinutes;
    }

    public void setGracePeriodMinutes(Integer gracePeriodMinutes) {
        this.gracePeriodMinutes = gracePeriodMinutes;
    }

    public String getOvertimePolicy() {
        return overtimePolicy;
    }

    public void setOvertimePolicy(String overtimePolicy) {
        this.overtimePolicy = overtimePolicy;
    }

    public String getEmployeeQrToken() {
        return employeeQrToken;
    }

    public void setEmployeeQrToken(String employeeQrToken) {
        this.employeeQrToken = employeeQrToken;
    }

    public Instant getEmployeeQrIssuedAt() {
        return employeeQrIssuedAt;
    }

    public void setEmployeeQrIssuedAt(Instant employeeQrIssuedAt) {
        this.employeeQrIssuedAt = employeeQrIssuedAt;
    }

    public Instant getEmployeeQrRevokedAt() {
        return employeeQrRevokedAt;
    }

    public void setEmployeeQrRevokedAt(Instant employeeQrRevokedAt) {
        this.employeeQrRevokedAt = employeeQrRevokedAt;
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

    public Set<Role> getRoles() {
        return roles;
    }

    public void setRoles(Set<Role> roles) {
        this.roles = roles;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }

    public AccountStatus getAccountStatus() {
        return accountStatus;
    }

    public void setAccountStatus(AccountStatus accountStatus) {
        this.accountStatus = accountStatus;
    }

    public Instant getPasswordChangedAt() {
        return passwordChangedAt;
    }

    public void setPasswordChangedAt(Instant passwordChangedAt) {
        this.passwordChangedAt = passwordChangedAt;
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
