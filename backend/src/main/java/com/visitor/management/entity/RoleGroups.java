package com.visitor.management.entity;

import java.util.Set;

public final class RoleGroups {

    public static final Set<Role> EMPLOYEE_WORKSPACE_ROLES = Set.of(
            Role.EMPLOYEE,
            Role.RECEPTION,
            Role.OPERATOR,
            Role.MANAGER
    );

    public static final Set<Role> WORKFORCE_ROLES = Set.of(
            Role.EMPLOYEE,
            Role.SECURITY_GUARD,
            Role.RECEPTION,
            Role.OPERATOR,
            Role.MANAGER
    );

    public static final Set<Role> ORGANIZATION_ROLES = Set.of(
            Role.ADMIN,
            Role.SECURITY_GUARD,
            Role.EMPLOYEE,
            Role.RECEPTION,
            Role.OPERATOR,
            Role.MANAGER,
            Role.VISITOR
    );

    private RoleGroups() {
    }

    public static boolean hasAny(Set<Role> roles, Set<Role> allowedRoles) {
        return roles != null && roles.stream().anyMatch(allowedRoles::contains);
    }

    public static boolean hasEmployeeWorkspaceRole(Set<Role> roles) {
        return hasAny(roles, EMPLOYEE_WORKSPACE_ROLES);
    }

    public static boolean isEmployeeWorkspaceRole(Role role) {
        return role != null && EMPLOYEE_WORKSPACE_ROLES.contains(role);
    }

    public static boolean isWorkforceRole(Role role) {
        return role != null && WORKFORCE_ROLES.contains(role);
    }
}
