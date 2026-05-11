package com.visitor.management.dto;

public record EmployeeDirectoryEntryResponse(
        String id,
        String fullName,
        String email,
        String username,
        String department,
        String organizationName
) {
}
