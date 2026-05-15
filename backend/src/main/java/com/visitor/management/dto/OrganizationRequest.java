package com.visitor.management.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;

public record OrganizationRequest(
        @NotBlank @Size(min = 2, max = 120) String companyName,
        @NotBlank @Pattern(regexp = "^[A-Za-z0-9_-]{2,24}$", message = "Company code must be 2-24 letters, numbers, underscores, or hyphens.") String companyCode,
        @Size(max = 240) String address,
        @Email @Size(max = 160) String contactEmail,
        @NotBlank @Size(min = 2, max = 120) String regionCountry,
        @NotBlank @Size(max = 80) String timezone,
        Boolean activeStatus,
        List<@Size(max = 80) String> departmentNames
) {
}
