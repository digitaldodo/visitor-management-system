import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { theme } from '../../theme';
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
  errorText?: string | null;
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
  errorText,
}: InternationalPhoneInputProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [countryQuery, setCountryQuery] = useState('');
  const [selectedIso2, setSelectedIso2] = useState<string | null>(null);
  const debouncedCountryQuery = useDebouncedValue(countryQuery.trim(), 120);
  const selectedCountry = COUNTRIES.find((country) => country.iso2 === selectedIso2 && country.dialCode === countryCode)
    ?? COUNTRIES.find((country) => country.dialCode === countryCode)
    ?? COUNTRIES[0];

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
      <View style={styles.phoneHeader}>
        <Text style={styles.label}>{phoneLabel}</Text>
        <View style={[styles.phoneFrame, errorText ? styles.phoneFrameError : null]}>
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
            <Text style={styles.countryCode}>{selectedCountry.dialCode}</Text>
            <Ionicons name={pickerOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textSecondary} />
          </Pressable>
          <TextInput
            accessibilityLabel={phoneLabel}
            value={formatPhoneForDisplay(phone, selectedCountry.iso2)}
            onChangeText={(value) => onPhoneChange(value.replace(/\D/g, '').slice(0, 15))}
            placeholder={selectedCountry.example}
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            maxFontSizeMultiplier={1.12}
            selectionColor={theme.colors.primary}
            style={styles.phoneInput}
          />
        </View>
        {errorText ? (
          <Text maxFontSizeMultiplier={1.1} style={styles.errorText}>{errorText}</Text>
        ) : (
          <Text maxFontSizeMultiplier={1.1} style={styles.helperText}>{`${selectedCountry.flag} ${selectedCountry.dialCode} selected · Example ${selectedCountry.example}`}</Text>
        )}
      </View>

      {pickerOpen ? (
        <View style={styles.pickerPanel}>
          <Text style={styles.label}>{label}</Text>
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
              setSelectedIso2(country.iso2);
              setCountryQuery(country.name);
              setPickerOpen(false);
            }}
            getKey={(country) => country.iso2}
            getTitle={(country) => `${country.flag} ${country.name}`}
            getMeta={(country) => `${country.dialCode} · Example ${country.example}`}
          />
        </View>
      ) : null}
    </View>
  );
}

export function validateInternationalPhone(countryCode: string, phone: string, required = false) {
  const digits = phone.replace(/\D/g, '');
  if (!digits) {
    return required ? 'Enter a reachable phone number.' : null;
  }

  const selectedCountry = COUNTRIES.find((country) => country.dialCode === countryCode) ?? COUNTRIES[0];
  const rule = PHONE_RULES[selectedCountry.iso2] ?? { min: 7, max: 15 };
  if (digits.length < rule.min || digits.length > rule.max) {
    return `${selectedCountry.name} phone numbers should be ${rule.min === rule.max ? rule.min : `${rule.min}-${rule.max}`} digits.`;
  }

  return null;
}

function formatPhoneForDisplay(value: string, iso2: string) {
  const digits = value.replace(/\D/g, '');
  if (!digits) {
    return '';
  }

  if (['US', 'CA'].includes(iso2)) {
    if (digits.length <= 3) {
      return digits;
    }
    if (digits.length <= 6) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    }
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  }

  if (iso2 === 'IN') {
    return [digits.slice(0, 5), digits.slice(5, 10)].filter(Boolean).join(' ');
  }

  if (['AE', 'SA', 'PH', 'ZA'].includes(iso2)) {
    return [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 9), digits.slice(9, 12)].filter(Boolean).join(' ');
  }

  if (['SG', 'QA', 'OM', 'KW', 'BH'].includes(iso2)) {
    return [digits.slice(0, 4), digits.slice(4, 8)].filter(Boolean).join(' ');
  }

  return digits.match(/.{1,3}/g)?.join(' ') ?? digits;
}

const PHONE_RULES: Record<string, { min: number; max: number }> = {
  IN: { min: 10, max: 10 },
  US: { min: 10, max: 10 },
  CA: { min: 10, max: 10 },
  AE: { min: 8, max: 9 },
  GB: { min: 10, max: 10 },
  AU: { min: 9, max: 9 },
  SG: { min: 8, max: 8 },
  SA: { min: 9, max: 9 },
  QA: { min: 8, max: 8 },
  OM: { min: 8, max: 8 },
  KW: { min: 8, max: 8 },
  BH: { min: 8, max: 8 },
  DE: { min: 10, max: 11 },
  FR: { min: 9, max: 9 },
  JP: { min: 10, max: 10 },
  KR: { min: 9, max: 10 },
  MY: { min: 9, max: 10 },
  ID: { min: 9, max: 12 },
  PH: { min: 10, max: 10 },
  ZA: { min: 9, max: 9 },
};

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.sm,
  },
  phoneHeader: {
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
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: theme.spacing.sm,
    alignSelf: 'stretch',
  },
  flag: {
    fontSize: 24,
  },
  countryCode: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '900',
  },
  phoneFrame: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.input,
  },
  phoneFrameError: {
    borderColor: theme.colors.danger,
  },
  phoneInput: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  pickerPanel: {
    gap: theme.spacing.xs,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.surfaceRaised,
    padding: theme.spacing.sm,
  },
  helperText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 13,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.82,
  },
});
