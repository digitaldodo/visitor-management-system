import { useEffect, useMemo, useState } from 'react';

import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { usePublicOrganizations } from '../../hooks/useOrganizations';
import type { OrganizationOption } from '../../services/organizationService';
import { AutocompleteDropdown } from './AutocompleteDropdown';

type OrganizationSelectorProps = {
  label?: string;
  selectedCode?: string | null;
  selectedName?: string | null;
  helperText?: string;
  placeholder?: string;
  onSelect: (organization: OrganizationOption) => void;
  onClear?: () => void;
};

export function OrganizationSelector({
  label = 'Organization',
  selectedCode,
  selectedName,
  helperText = 'Search by organization name.',
  placeholder = 'Search by organization name',
  onSelect,
  onClear,
}: OrganizationSelectorProps) {
  const organizations = usePublicOrganizations();
  const [query, setQuery] = useState(selectedName || selectedCode || '');
  const debouncedQuery = useDebouncedValue(query.trim(), 180);
  const activeOrganizations = useMemo(() => (organizations.data ?? []).filter((item) => item.activeStatus !== false), [organizations.data]);
  const selectedOrganization = useMemo(
    () => activeOrganizations.find((organization) => organization.companyCode === selectedCode) ?? null,
    [activeOrganizations, selectedCode],
  );
  const selectedDisplayName = selectedName || selectedOrganization?.companyName || (selectedCode ? 'Organization selected' : null);
  const selectedDisplayMeta = [
    selectedOrganization?.regionCountry,
    selectedOrganization?.timezone,
    selectedCode && selectedOrganization ? `Org code ${selectedCode}` : null,
  ].filter(Boolean).join(' · ') || null;

  useEffect(() => {
    if (selectedDisplayName) {
      setQuery(selectedOrganization?.companyName || selectedName || '');
    }
  }, [selectedDisplayName, selectedName, selectedOrganization?.companyName]);

  const results = useMemo(() => {
    const normalized = debouncedQuery.toLowerCase();
    if (!normalized) {
      return activeOrganizations.slice(0, 8);
    }
    return activeOrganizations
      .filter((item) => [
        item.companyName,
        item.companyCode,
        item.regionCountry,
        item.timezone,
      ].filter(Boolean).join(' ').toLowerCase().includes(normalized))
      .slice(0, 8);
  }, [activeOrganizations, debouncedQuery]);

  return (
    <AutocompleteDropdown
      label={label}
      value={query}
      onChangeText={(value) => {
        setQuery(value);
        if (!value.trim()) {
          onClear?.();
        }
      }}
      placeholder={placeholder}
      helperText={helperText}
      minQueryLength={0}
      results={results}
      loading={organizations.isLoading || organizations.isFetching}
      errorText={organizations.isError ? errorMessage(organizations.error, 'Organizations could not be loaded.') : null}
      emptyText="No organizations found"
      emptyBody="Try a different organization or facility name."
      selectedTitle={selectedDisplayName}
      selectedMeta={selectedDisplayMeta}
      resultIconName="business-outline"
      onSelect={(organization) => {
        setQuery(organization.companyName);
        onSelect(organization);
      }}
      onRetry={() => {
        void organizations.refetch();
      }}
      getKey={(organization) => organization.id || organization.companyCode}
      getTitle={(organization) => organization.companyName}
      getMeta={(organization) => [organization.regionCountry, organization.timezone].filter(Boolean).join(' · ')}
      onClearSelection={onClear ? () => {
        setQuery('');
        onClear();
      } : undefined}
    />
  );
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}
