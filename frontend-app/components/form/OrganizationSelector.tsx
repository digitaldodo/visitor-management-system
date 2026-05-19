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
  helperText = 'Search by organization name or code.',
  placeholder = 'Search organization',
  onSelect,
  onClear,
}: OrganizationSelectorProps) {
  const organizations = usePublicOrganizations();
  const [query, setQuery] = useState(selectedName || selectedCode || '');
  const debouncedQuery = useDebouncedValue(query.trim(), 180);

  useEffect(() => {
    if (selectedName || selectedCode) {
      setQuery([selectedName, selectedCode].filter(Boolean).join(' · '));
    }
  }, [selectedCode, selectedName]);

  const results = useMemo(() => {
    const normalized = debouncedQuery.toLowerCase();
    const all = (organizations.data ?? []).filter((item) => item.activeStatus !== false);
    if (!normalized) {
      return all.slice(0, 8);
    }
    return all
      .filter((item) => [
        item.companyName,
        item.companyCode,
        item.regionCountry,
        item.timezone,
      ].filter(Boolean).join(' ').toLowerCase().includes(normalized))
      .slice(0, 8);
  }, [debouncedQuery, organizations.data]);

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
      selectedTitle={selectedName || null}
      selectedMeta={[selectedCode, selectedName ? undefined : 'Selected organization'].filter(Boolean).join(' · ') || null}
      onSelect={(organization) => {
        setQuery(`${organization.companyName} · ${organization.companyCode}`);
        onSelect(organization);
      }}
      onRetry={() => {
        void organizations.refetch();
      }}
      getKey={(organization) => organization.id || organization.companyCode}
      getTitle={(organization) => organization.companyName}
      getMeta={(organization) => [organization.companyCode, organization.regionCountry, organization.timezone].filter(Boolean).join(' · ')}
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
