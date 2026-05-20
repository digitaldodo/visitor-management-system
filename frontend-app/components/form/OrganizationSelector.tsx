import { useCallback, useEffect, useState } from 'react';

import { useOperationalSnackbar } from '../feedback/OperationalSnackbar';
import { useOperationalAutocomplete } from '../../hooks/useOperationalAutocomplete';
import { getPublicOrganizations, type OrganizationOption } from '../../services/organizationService';
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
  const { showSnackbar } = useOperationalSnackbar();
  const [query, setQuery] = useState(selectedName || selectedCode || '');
  const [selectedOrganization, setSelectedOrganization] = useState<OrganizationOption | null>(null);
  const trimmedQuery = query.trim();
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

  useEffect(() => {
    if (!selectedCode || selectedOrganization?.companyCode === selectedCode) {
      return;
    }

    setSelectedOrganization(null);
  }, [selectedCode, selectedOrganization?.companyCode]);

  const searchOrganizations = useCallback(async (nextQuery: string, signal: AbortSignal) => {
    const normalized = nextQuery.toLowerCase().trim();
    const organizations = await getPublicOrganizations(signal);

    return organizations
      .filter((item) => item.activeStatus !== false)
      .filter((item) => [
        item.companyName,
        item.companyCode,
        item.regionCountry,
        item.timezone,
      ].filter(Boolean).join(' ').toLowerCase().includes(normalized))
      .slice(0, MAX_ORGANIZATION_RESULTS);
  }, []);

  const organizationSearch = useOperationalAutocomplete({
    query: trimmedQuery,
    enabled: !selectedDisplayName,
    minQueryLength: MIN_ORGANIZATION_QUERY_LENGTH,
    debounceMs: 220,
    search: searchOrganizations,
  });

  useEffect(() => {
    if (organizationSearch.isError && organizationSearch.error) {
      showSnackbar({ message: 'Unable to load organizations', tone: 'danger' });
    }
  }, [organizationSearch.error, organizationSearch.isError, showSnackbar]);

  return (
    <AutocompleteDropdown
      label={label}
      value={query}
      onChangeText={(value) => {
        setQuery(value);
        if (!value.trim()) {
          setSelectedOrganization(null);
          onClear?.();
        }
      }}
      placeholder={placeholder}
      helperText={helperText}
      minQueryLength={MIN_ORGANIZATION_QUERY_LENGTH}
      results={organizationSearch.results}
      loading={organizationSearch.isLoading}
      errorText={organizationSearch.isError ? errorMessage(organizationSearch.error, 'Organizations could not be loaded.') : null}
      emptyText="No matching organizations found"
      emptyBody="Try a different organization or facility name."
      selectedTitle={selectedDisplayName}
      selectedMeta={selectedDisplayMeta}
      selectedAvatarText={selectedOrganization?.companyCode ?? selectedCode ?? undefined}
      resultIconName="business-outline"
      onSelect={(organization) => {
        setSelectedOrganization(organization);
        setQuery(organization.companyName);
        onSelect(organization);
      }}
      onRetry={organizationSearch.retry}
      getKey={(organization) => organization.id || organization.companyCode}
      getTitle={(organization) => organization.companyName}
      getMeta={(organization) => [organization.regionCountry, organization.timezone].filter(Boolean).join(' · ')}
      onClearSelection={onClear ? () => {
        setSelectedOrganization(null);
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
