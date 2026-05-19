import { forwardRef } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { theme } from '../../theme';

type Props = TextInputProps & {
  label: string;
  helperText?: string;
  errorText?: string;
};

export const AppTextField = forwardRef<TextInput, Props>(function AppTextField(
  { label, helperText, errorText, style, ...props },
  ref,
) {
  const hasError = Boolean(errorText);
  const layout = useResponsiveLayout();

  return (
    <View style={styles.container}>
      <Text maxFontSizeMultiplier={1.1} style={styles.label}>{label}</Text>
      <TextInput
        ref={ref}
        placeholderTextColor={theme.colors.textMuted}
        selectionColor={theme.colors.primary}
        maxFontSizeMultiplier={1.12}
        style={[
          styles.input,
          { minHeight: layout.touchTarget },
          hasError ? styles.inputError : null,
          props.multiline ? styles.multiline : null,
          style,
        ]}
        {...props}
      />
      {errorText ? <Text maxFontSizeMultiplier={1.1} style={styles.errorText}>{errorText}</Text> : helperText ? <Text maxFontSizeMultiplier={1.1} style={styles.helperText}>{helperText}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.xs,
  },
  label: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  input: {
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  multiline: {
    minHeight: 124,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: theme.colors.danger,
  },
  helperText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 13,
  },
});
