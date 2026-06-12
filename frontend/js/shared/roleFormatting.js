export const ROLE_LABELS = Object.freeze({
  SUPER_ADMIN: "Super admin",
  ADMIN: "Admin",
  EMPLOYEE: "Employee",
  SECURITY_GUARD: "Security guard",
  RECEPTION: "Reception",
  OPERATOR: "Operator",
  MANAGER: "Manager",
  VISITOR: "Visitor",
});

export function roleLabel(role) {
  const normalized = String(role || "").trim().toUpperCase();
  return ROLE_LABELS[normalized] || "Team member";
}
