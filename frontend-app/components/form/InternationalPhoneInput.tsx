import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { theme } from '../../theme';
import { AppTextField } from './AppTextField';
import { AutocompleteDropdown } from './AutocompleteDropdown';

type CountryOption = {
  name: string;
  iso2: string;
  dialCode: string;
  flag: string;
  example: string;
};

const COUNTRIES: CountryOption[] = [
  { name: 'India', iso2: 'IN', dialCode: '+91', flag: '🇮🇳', example: '98765 43210' },
  { name: 'United States', iso2: 'US', dialCode: '+1', flag: '🇺🇸', example: '555 0100' },
  { name: 'United Arab Emirates', iso2: 'AE', dialCode: '+971', flag: '🇦🇪', example: '50 123 4567' },
  { name: 'United Kingdom', iso2: 'GB', dialCode: '+44', flag: '🇬🇧', example: '7400 123456' },
  { name: 'Canada', iso2: 'CA', dialCode: '+1', flag: '🇨🇦', example: '416 555 0100' },
  { name: 'Australia', iso2: 'AU', dialCode: '+61', flag: '🇦🇺', example: '412 345 678' },
  { name: 'Singapore', iso2: 'SG', dialCode: '+65', flag: '🇸🇬', example: '8123 4567' },
  { name: 'Saudi Arabia', iso2: 'SA', dialCode: '+966', flag: '🇸🇦', example: '50 123 4567' },
  { name: 'Qatar', iso2: 'QA', dialCode: '+974', flag: '🇶🇦', example: '3312 3456' },
  { name: 'Oman', iso2: 'OM', dialCode: '+968', flag: '🇴🇲', example: '9212 3456' },
  { name: 'Kuwait', iso2: 'KW', dialCode: '+965', flag: '🇰🇼', example: '500 12345' },
  { name: 'Bahrain', iso2: 'BH', dialCode: '+973', flag: '🇧🇭', example: '3600 1234' },
  { name: 'Germany', iso2: 'DE', dialCode: '+49', flag: '🇩🇪', example: '1512 3456789' },
  { name: 'France', iso2: 'FR', dialCode: '+33', flag: '🇫🇷', example: '6 12 34 56 78' },
  { name: 'Japan', iso2: 'JP', dialCode: '+81', flag: '🇯🇵', example: '90 1234 5678' },
  { name: 'South Korea', iso2: 'KR', dialCode: '+82', flag: '🇰🇷', example: '10 1234 5678' },
  { name: 'Malaysia', iso2: 'MY', dialCode: '+60', flag: '🇲🇾', example: '12 345 6789' },
  { name: 'Indonesia', iso2: 'ID', dialCode: '+62', flag: '🇮🇩', example: '812 3456 7890' },
  { name: 'Philippines', iso2: 'PH', dialCode: '+63', flag: '🇵🇭', example: '917 123 4567' },
  { name: 'South Africa', iso2: 'ZA', dialCode: '+27', flag: '🇿🇦', example: '71 123 4567' },
];

type InternationalPhoneInputProps = {
  countryCode: string;
  phone: string;
  onCountryCodeChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  label?: string;
  phoneLabel?: string;
  helperText?: string;
  required?: boolean;
};

export function InternationalPhoneInput({
  countryCode,
  phone,
  onCountryCodeChange,
  onPhoneChange,
  label = 'Country',
  phoneLabel = 'Phone number',
  helperText = 'Search country, then enter the local number.',
}: InternationalPhoneInputProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [countryQuery, setCountryQuery] = useState('');
  const debouncedCountryQuery = useDebouncedValue(countryQuery.trim(), 120);
  const selectedCountry = COUNTRIES.find((country) => country.dialCode === countryCode) ?? COUNTRIES[0];

  const countryResults = useMemo(() => {
    const normalized = debouncedCountryQuery.toLowerCase();
    if (!normalized) {
      return COUNTRIES.slice(0, 8);
    }
    return COUNTRIES.filter((country) => [
      country.name,
      country.iso2,
      country.dialCode,
    ].join(' ').toLowerCase().includes(normalized)).slice(0, 8);
  }, [debouncedCountryQuery]);

  return (
    <View style={styles.container}>
      <View style={styles.countryHeader}>
        <Text style={styles.label}>{label}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Select country code"
          onPress={() => {
            setPickerOpen((open) => !open);
            setCountryQuery(selectedCountry.name);
          }}
          style={({ pressed }) => [styles.countryButton, pressed ? styles.pressed : null]}
        >
          <Text style={styles.flag}>{selectedCountry.flag}</Text>
          <View style={styles.countryCopy}>
            <Text style={styles.countryName}>{selectedCountry.name}</Text>
            <Text style={styles.countryCode}>{selectedCountry.dialCode}</Text>
          </View>
        </Pressable>
      </View>

      {pickerOpen ? (
        <AutocompleteDropdown
          label="Search country"
          value={countryQuery}
          onChangeText={setCountryQuery}
          placeholder="India, USA, UAE"
          helperText={helperText}
          minQueryLength={0}
          results={countryResults}
          selectedTitle={null}
          onSelect={(country) => {
            onCountryCodeChange(country.dialCode);
            setCountryQuery(country.name);
            setPickerOpen(false);
          }}
          getKey={(country) => country.iso2}
          getTitle={(country) => `${country.flag} ${country.name}`}
          getMeta={(country) => `${country.dialCode} · Example ${country.example}`}
        />
      ) : null}

      <AppTextField
        label={phoneLabel}
        value={formatPhoneForDisplay(phone)}
        onChangeText={(value) => onPhoneChange(value.replace(/[^\d\s()-]/g, '').slice(0, 24))}
        placeholder={selectedCountry.example}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        helperText={`${selectedCountry.flag} ${selectedCountry.dialCode} selected`}
      />
    </View>
  );
}

function formatPhoneForDisplay(value: string) {
  return value.replace(/\s{2,}/g, ' ');
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.sm,
  },
  countryHeader: {
    gap: theme.spacing.xs,
  },
  label: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  countryButton: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.input,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  flag: {
    fontSize: 24,
  },
  countryCopy: {
    flex: 1,
    gap: 2,
  },
  countryName: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  countryCode: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.82,
  },
});
