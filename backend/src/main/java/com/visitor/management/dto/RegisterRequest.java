package com.visitor.management.dto;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public class RegisterRequest {

    @NotBlank
    @Size(min = 2, max = 120)
    private String fullName;

    @NotBlank
    @Pattern(regexp = "^[A-Za-z0-9._-]{3,32}$", message = "Username must be 3-32 characters and use only letters, numbers, dots, underscores, or hyphens.")
    private String username;

    @Email
    @NotBlank
    @Size(max = 160)
    private String email;

    @NotBlank
    @Size(min = 12, max = 128)
    private String password;

    @Size(max = 32)
    private String phone;

    @Size(max = 24)
    private String companyCode;

    @Size(max = 120)
    private String companyName;

    @Size(max = 120)
    private String hostEmployee;

    @Size(max = 160)
    private String purposeOfVisit;

    @JsonAnySetter
    public void rejectUnknownField(String fieldName, Object value) {
        throw new IllegalArgumentException("Public visitor registration does not accept field: " + fieldName);
    }

    public String fullName() {
        return fullName;
    }

    public void setFullName(String fullName) {
        this.fullName = fullName;
    }

    public String username() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String email() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String password() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public String phone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public String companyCode() {
        return companyCode;
    }

    public void setCompanyCode(String companyCode) {
        this.companyCode = companyCode;
    }

    public String companyName() {
        return companyName;
    }

    public void setCompanyName(String companyName) {
        this.companyName = companyName;
    }

    public String hostEmployee() {
        return hostEmployee;
    }

    public void setHostEmployee(String hostEmployee) {
        this.hostEmployee = hostEmployee;
    }

    public String purposeOfVisit() {
        return purposeOfVisit;
    }

    public void setPurposeOfVisit(String purposeOfVisit) {
        this.purposeOfVisit = purposeOfVisit;
    }
}
