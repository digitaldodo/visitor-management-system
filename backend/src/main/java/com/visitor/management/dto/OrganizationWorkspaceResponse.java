package com.visitor.management.dto;

import java.util.List;

public record OrganizationWorkspaceResponse(
        OrganizationResponse organization,
        OrganizationSummaryResponse summary,
        List<AdminUserResponse> admins,
        List<DepartmentResponse> departments,
        List<OrganizationVisitorActivityResponse> recentVisitors,
        List<OrganizationAuditLogResponse> auditLogs
) {
}
