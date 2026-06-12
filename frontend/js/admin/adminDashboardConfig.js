export const ROUTE_ALIASES = {
  analytics: "dashboard",
  users: "employees",
  departments: "departments",
  organizations: "organizations",
  reports: "reports",
  monitoring: "system-monitoring",
  "runtime-status": "system-monitoring",
  "api-health": "system-monitoring",
  emergency: "emergency-ops",
  incidents: "emergency-ops",
  visitors: "visitor-access",
  "visitor-access": "visitor-access",
  "workforce-approvals": "workforce-approvals",
  "homepage-settings": "platform-settings",
  "homepage-controls": "platform-settings",
};

export const DEFAULT_DEPARTMENT_PRESETS = [
  "Operations",
  "Security",
  "HR",
  "IT",
  "Reception",
  "Facilities",
  "Management",
];

export const ORGANIZATION_TIMEZONES = [
  "Asia/Kolkata",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/Berlin",
  "Asia/Singapore",
  "Asia/Dubai",
  "Australia/Sydney",
  "UTC",
];

export const INTERNAL_ROLE_DEPARTMENT_RULES = {
  EMPLOYEE: {
    mode: "manual",
    label: "Department",
    meta: "Choose an organization department or enter a new one.",
    placeholder: "Search or add a department",
    department: "",
  },
  RECEPTION: {
    mode: "manual",
    label: "Department",
    meta: "Reception users default to front desk but can be assigned to any organization team.",
    placeholder: "Reception",
    department: "Reception",
  },
  OPERATOR: {
    mode: "manual",
    label: "Department",
    meta: "Operator users default to Operations but can be assigned to any organization team.",
    placeholder: "Operations",
    department: "Operations",
  },
  MANAGER: {
    mode: "manual",
    label: "Department",
    meta: "Manager users default to Management but can be assigned to any organization team.",
    placeholder: "Management",
    department: "Management",
  },
  SECURITY_GUARD: {
    mode: "locked",
    label: "Department",
    meta: "Security portal access is always assigned to the Security department.",
    placeholder: "Security",
    department: "Security",
  },
  ADMIN: {
    mode: "locked",
    label: "Department",
    meta: "Administration portal access is always assigned to the Administration department.",
    placeholder: "Administration",
    department: "Administration",
  },
};
