package com.visitor.management.dto;

import java.util.List;
import java.util.Map;

public record AdminUserDetailResponse(
        AdminUserResponse user,
        List<Map<String, String>> recentActivity
) {
}
