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

const MIN_ORGANIZATION_QUERY_LENGTH = 2;
const MAX_ORGANIZATION_RESULTS = 8;

export function OrganizationSelector({
  label = 'Organization',
  selectedCode,
  selectedName,
  helperText = 'Type at least 2 characters to find your organization.',
  placeholder = 'Search by organization name',
  onSelect,
  onClear,
}: OrganizationSelectorProps) {
  const [query, setQuery] = useState(selectedName || selectedCode || '');
  const trimmedQuery = query.trim();
  const debouncedQuery = useDebouncedValue(trimmedQuery, 220);
  const queryReady = trimmedQuery.length >= MIN_ORGANIZATION_QUERY_LENGTH;
  const searchPending = queryReady && trimmedQuery !== debouncedQuery;
  const organizations = usePublicOrganizations({ enabled: queryReady || Boolean(selectedCode) });
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
    const normalized = debouncedQuery.toLowerCase().trim();
    if (normalized.length < MIN_ORGANIZATION_QUERY_LENGTH) {
      return [];
    }
    return activeOrganizations
      .filter((item) => [
        item.companyName,
        item.companyCode,
        item.regionCountry,
        item.timezone,
      ].filter(Boolean).join(' ').toLowerCase().includes(normalized))
      .slice(0, MAX_ORGANIZATION_RESULTS);
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
      minQueryLength={MIN_ORGANIZATION_QUERY_LENGTH}
      results={searchPending ? [] : results}
      loading={queryReady && (searchPending || organizations.isLoading || organizations.isFetching)}
      errorText={queryReady && organizations.isError ? errorMessage(organizations.error, 'Organizations could not be loaded.') : null}
      emptyText="No organizations found"
      emptyBody="Try a different organization or facility name."
      selectedTitle={selectedDisplayName}
      selectedMeta={selectedDisplayMeta}
      selectedAvatarText={selectedOrganization?.companyCode ?? selectedCode ?? undefined}
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
