import { Ionicons } from '@expo/vector-icons';
import {
  Keyboard,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';

import { theme } from '../../theme';
import { AppTextField } from './AppTextField';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type AutocompleteDropdownProps<T> = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  helperText?: string;
  minQueryLength?: number;
  results: T[];
  loading?: boolean;
  errorText?: string | null;
  emptyText?: string;
  emptyBody?: string;
  selectedTitle?: string | null;
  selectedMeta?: string | null;
  selectedAvatarText?: string | null;
  resultIconName?: keyof typeof Ionicons.glyphMap;
  onSelect: (item: T) => void;
  onRetry?: () => void;
  getKey: (item: T) => string;
  getTitle: (item: T) => string;
  getMeta?: (item: T) => string | null | undefined;
  onClearSelection?: () => void;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
};

export function AutocompleteDropdown<T>({
  label,
  value,
  onChangeText,
  placeholder,
  helperText,
  minQueryLength = 2,
  results,
  loading,
  errorText,
  emptyText = 'No matches found.',
  emptyBody = 'Try a different search.',
  selectedTitle,
  selectedMeta,
  selectedAvatarText,
  resultIconName = 'search',
  onSelect,
  onRetry,
  getKey,
  getTitle,
  getMeta,
  onClearSelection,
  keyboardType = 'default',
  autoCapitalize = 'none',
}: AutocompleteDropdownProps<T>) {
  const hasSelection = Boolean(selectedTitle);
  const queryReady = value.trim().length >= minQueryLength;
  const showResults = !hasSelection && queryReady;

  const animate = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };

  return (
    <View style={styles.container}>
      {hasSelection ? (
        <>
          <Text maxFontSizeMultiplier={1.1} style={styles.label}>{label}</Text>
          <View style={styles.selectedPanel}>
            <View style={styles.selectedIcon}>
              {selectedAvatarText ? (
                <Text maxFontSizeMultiplier={1} style={styles.selectedAvatarText}>{selectedAvatarText}</Text>
              ) : (
                <Ionicons name="checkmark" size={18} color={theme.colors.success} />
              )}
            </View>
            <View style={styles.selectedCopy}>
              <Text maxFontSizeMultiplier={1.08} style={styles.selectedTitle}>{selectedTitle}</Text>
              {selectedMeta ? <Text maxFontSizeMultiplier={1.08} style={styles.metaText}>{selectedMeta}</Text> : null}
            </View>
            {onClearSelection ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Clear ${label}`}
                hitSlop={8}
                onPress={() => {
                  animate();
                  onClearSelection();
                }}
                style={styles.clearButton}
              >
                <Ionicons name="close" size={18} color={theme.colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>
        </>
      ) : (
        <AppTextField
          label={label}
          value={value}
          onChangeText={(nextValue) => {
            animate();
            onChangeText(nextValue);
          }}
          placeholder={placeholder}
          helperText={helperText}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
        />
      )}

      {showResults ? (
        <View style={styles.resultsPanel}>
          {loading ? (
            <StateRow icon="sync-outline" title="Searching" body="Loading matching records..." />
          ) : errorText ? (
            <View style={styles.stateWithAction}>
              <StateRow icon="alert-circle-outline" title="Could not load results" body={errorText} tone="danger" />
              {onRetry ? (
                <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retryButton}>
                  <Ionicons name="refresh" size={17} color={theme.colors.textPrimary} />
                  <Text style={styles.retryText}>Retry</Text>
                </Pressable>
              ) : null}
            </View>
          ) : results.length ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              style={styles.resultsScroll}
            >
              {results.slice(0, 8).map((item) => (
                <Pressable
                  key={getKey(item)}
                  accessibilityRole="button"
                  onPress={() => {
                    animate();
                    Keyboard.dismiss();
                    onSelect(item);
                  }}
                  android_ripple={{ color: theme.colors.primarySoft }}
                  style={({ pressed }) => [styles.resultRow, pressed ? styles.pressed : null]}
                >
                  <View style={styles.resultIcon}>
                    <Ionicons name={resultIconName} size={17} color={theme.colors.info} />
                  </View>
                  <View style={styles.resultCopy}>
                    <Text maxFontSizeMultiplier={1.08} style={styles.resultTitle}>{getTitle(item)}</Text>
                    {getMeta?.(item) ? <Text maxFontSizeMultiplier={1.08} style={styles.metaText}>{getMeta(item)}</Text> : null}
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <StateRow icon="file-tray-outline" title={emptyText} body={emptyBody} />
          )}
        </View>
      ) : null}
    </View>
  );
}

function StateRow({
  icon,
  title,
  body,
  tone = 'default',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  tone?: 'default' | 'danger';
}) {
  return (
    <View style={styles.stateRow}>
      <Ionicons name={icon} size={18} color={tone === 'danger' ? theme.colors.danger : theme.colors.textSecondary} />
      <View style={styles.resultCopy}>
        <Text style={styles.resultTitle}>{title}</Text>
        <Text style={styles.metaText}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.sm,
  },
  label: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  selectedPanel: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  selectedIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.successSoft,
  },
  selectedAvatarText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  selectedCopy: {
    flex: 1,
    gap: 2,
  },
  selectedTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  clearButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceMuted,
  },
  resultsPanel: {
    maxHeight: 292,
    overflow: 'hidden',
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
  },
  resultsScroll: {
    maxHeight: 292,
  },
  resultRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  resultIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.infoSoft,
  },
  resultCopy: {
    flex: 1,
    gap: 2,
  },
  resultTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  metaText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  stateRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  stateWithAction: {
    gap: theme.spacing.xs,
    paddingBottom: theme.spacing.sm,
  },
  retryButton: {
    minHeight: 44,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginHorizontal: theme.spacing.md,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: theme.spacing.md,
  },
  retryText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.82,
  },
});
