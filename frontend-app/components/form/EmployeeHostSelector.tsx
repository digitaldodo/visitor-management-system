import type { HostDirectoryEntry } from '../../types/domain';
import { AutocompleteDropdown } from './AutocompleteDropdown';

type EmployeeHostSelectorProps = {
  value: string;
  onChangeText: (value: string) => void;
  selectedHost: HostDirectoryEntry | null;
  onSelectHost: (host: HostDirectoryEntry) => void;
  onClearHost: () => void;
  hosts: HostDirectoryEntry[];
  loading?: boolean;
  errorText?: string | null;
  onRetry?: () => void;
  label?: string;
  helperText?: string;
};

export function EmployeeHostSelector({
  value,
  onChangeText,
  selectedHost,
  onSelectHost,
  onClearHost,
  hosts,
  loading,
  errorText,
  onRetry,
  label = 'Host employee',
  helperText = 'Search by name, email, username, or department.',
}: EmployeeHostSelectorProps) {
  return (
    <AutocompleteDropdown
      label={label}
      value={value}
      onChangeText={(nextValue) => {
        onChangeText(nextValue);
        if (!nextValue.trim()) {
          onClearHost();
        }
      }}
      placeholder="Search host"
      helperText={helperText}
      minQueryLength={2}
      results={hosts}
      loading={loading}
      errorText={errorText}
      emptyText="No employees found"
      emptyBody="Try a name, email, or department."
      selectedTitle={selectedHost?.fullName ?? null}
      selectedMeta={selectedHost ? [selectedHost.department, selectedHost.email, selectedHost.organizationName].filter(Boolean).join(' · ') : null}
      selectedAvatarText={selectedHost ? initialsFor(selectedHost.fullName) : null}
      resultIconName="person-outline"
      onSelect={(host) => {
        onSelectHost(host);
        onChangeText('');
      }}
      onRetry={onRetry}
      getKey={(host) => host.id}
      getTitle={(host) => host.fullName}
      getMeta={(host) => [host.department, host.email, host.username].filter(Boolean).join(' · ')}
      onClearSelection={() => {
        onClearHost();
        onChangeText('');
      }}
    />
  );
}

function initialsFor(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}
