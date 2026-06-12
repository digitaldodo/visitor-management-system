export function normalizeOrganizations(organizations = []) {
  return (Array.isArray(organizations) ? organizations : [])
    .filter((organization) => organization && (organization.companyCode || organization.id))
    .slice()
    .sort((first, second) => String(first.companyName || first.companyCode || "").localeCompare(String(second.companyName || second.companyCode || "")));
}

export function organizationValue(organization, valueField = "companyCode") {
  return String(organization?.[valueField] || organization?.companyCode || "");
}

export function findOrganizationByValue(organizations, value, valueField) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  if (!normalizedValue) {
    return null;
  }
  return organizations.find((organization) => organizationValue(organization, valueField).toLowerCase() === normalizedValue) || null;
}

export function organizationOptionLabel(organization) {
  const name = organization.companyName || organization.name || "Unnamed organization";
  const code = organization.companyCode || organization.code;
  return code ? `${name} (${code})` : name;
}

export function normalizeOrganizationSearch(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}
