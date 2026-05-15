package com.visitor.management.entity;

import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.Set;

@Document(collection = "employee_attendance_logs")
public class EmployeeAttendanceLog {

    @Id
    private String id;

    @Indexed
    private String employeeUserId;

    private String employeeId;

    private String employeeName;

    private String department;

    private String designation;

    private String employeeType;

    @Indexed
    private String organizationId;

    private String organizationName;

    private String organizationCode;

    private String timezone;

    @Indexed
    private LocalDate attendanceDate;

    private String shiftName;

    private String shiftStartTime;

    private String shiftEndTime;

    private Integer gracePeriodMinutes;

    private EmployeeAttendanceState state = EmployeeAttendanceState.OUT;

    private EmployeeAttendanceStatus status = EmployeeAttendanceStatus.PRESENT;

    private Set<EmployeeAttendanceStatus> flags = new HashSet<>();

    private Instant checkInTime;

    private Instant checkOutTime;

    private Long workedMinutes;

    private Long overtimeMinutes;

    private boolean manualCheckIn;

    private boolean manualCheckOut;

    private String overrideReason;

    private String securityGuardId;

    private String securityGuardName;

    private String lastAction;

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

    public String getEmployeeUserId() {
        return employeeUserId;
    }

    public void setEmployeeUserId(String employeeUserId) {
        this.employeeUserId = employeeUserId;
    }

    public String getEmployeeId() {
        return employeeId;
    }

    public void setEmployeeId(String employeeId) {
        this.employeeId = employeeId;
    }

    public String getEmployeeName() {
        return employeeName;
    }

    public void setEmployeeName(String employeeName) {
        this.employeeName = employeeName;
    }

    public String getDepartment() {
        return department;
    }

    public void setDepartment(String department) {
        this.department = department;
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

    public String getTimezone() {
        return timezone;
    }

    public void setTimezone(String timezone) {
        this.timezone = timezone;
    }

    public LocalDate getAttendanceDate() {
        return attendanceDate;
    }

    public void setAttendanceDate(LocalDate attendanceDate) {
        this.attendanceDate = attendanceDate;
    }

    public String getShiftName() {
        return shiftName;
    }

    public void setShiftName(String shiftName) {
        this.shiftName = shiftName;
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

    public EmployeeAttendanceState getState() {
        return state;
    }

    public void setState(EmployeeAttendanceState state) {
        this.state = state;
    }

    public EmployeeAttendanceStatus getStatus() {
        return status;
    }

    public void setStatus(EmployeeAttendanceStatus status) {
        this.status = status;
    }

    public Set<EmployeeAttendanceStatus> getFlags() {
        return flags;
    }

    public void setFlags(Set<EmployeeAttendanceStatus> flags) {
        this.flags = flags;
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

    public Long getWorkedMinutes() {
        return workedMinutes;
    }

    public void setWorkedMinutes(Long workedMinutes) {
        this.workedMinutes = workedMinutes;
    }

    public Long getOvertimeMinutes() {
        return overtimeMinutes;
    }

    public void setOvertimeMinutes(Long overtimeMinutes) {
        this.overtimeMinutes = overtimeMinutes;
    }

    public boolean isManualCheckIn() {
        return manualCheckIn;
    }

    public void setManualCheckIn(boolean manualCheckIn) {
        this.manualCheckIn = manualCheckIn;
    }

    public boolean isManualCheckOut() {
        return manualCheckOut;
    }

    public void setManualCheckOut(boolean manualCheckOut) {
        this.manualCheckOut = manualCheckOut;
    }

    public String getOverrideReason() {
        return overrideReason;
    }

    public void setOverrideReason(String overrideReason) {
        this.overrideReason = overrideReason;
    }

    public String getSecurityGuardId() {
        return securityGuardId;
    }

    public void setSecurityGuardId(String securityGuardId) {
        this.securityGuardId = securityGuardId;
    }

    public String getSecurityGuardName() {
        return securityGuardName;
    }

    public void setSecurityGuardName(String securityGuardName) {
        this.securityGuardName = securityGuardName;
    }

    public String getLastAction() {
        return lastAction;
    }

    public void setLastAction(String lastAction) {
        this.lastAction = lastAction;
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
