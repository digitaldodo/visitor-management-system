import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { theme } from '../../theme';
import { useKeyboardAwareScroll } from '../layout/KeyboardAwareScreen';

type Props = TextInputProps & {
  label: string;
  helperText?: string;
  errorText?: string;
};

export const AppTextField = forwardRef<TextInput, Props>(function AppTextField(
  { label, helperText, errorText, style, onFocus, secureTextEntry, ...props },
  ref,
) {
  const hasError = Boolean(errorText);
  const layout = useResponsiveLayout();
  const inputRef = useRef<TextInput>(null);
  const { scrollToInput } = useKeyboardAwareScroll();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const isPasswordField = Boolean(secureTextEntry);

  useImperativeHandle(ref, () => inputRef.current as TextInput);

  return (
    <View style={styles.container}>
      <Text maxFontSizeMultiplier={1.1} style={styles.label}>{label}</Text>
      <View
        style={[
          styles.inputFrame,
          { minHeight: layout.touchTarget },
          hasError ? styles.inputError : null,
          props.multiline ? styles.multiline : null,
          style,
        ]}
      >
        <TextInput
          ref={inputRef}
          placeholderTextColor={theme.colors.textMuted}
          selectionColor={theme.colors.primary}
          maxFontSizeMultiplier={1.12}
          secureTextEntry={isPasswordField && !passwordVisible}
          textContentType={isPasswordField ? 'password' : props.textContentType}
          autoComplete={isPasswordField ? 'password' : props.autoComplete}
          style={[styles.input, props.multiline ? styles.multilineInput : null, isPasswordField ? styles.passwordInput : null]}
          onFocus={(event) => {
            onFocus?.(event);
            scrollToInput(inputRef.current);
          }}
          {...props}
        />
        {isPasswordField ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={passwordVisible ? `Hide ${label}` : `Show ${label}`}
            accessibilityHint="Toggles secure password visibility."
            hitSlop={8}
            onPress={() => setPasswordVisible((visible) => !visible)}
            style={({ pressed }) => [styles.visibilityToggle, pressed ? styles.visibilityTogglePressed : null]}
          >
            <Ionicons
              name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
              size={22}
              color={theme.colors.textSecondary}
            />
          </Pressable>
        ) : null}
      </View>
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
  inputFrame: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.input,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  multiline: {
    minHeight: 124,
    alignItems: 'flex-start',
  },
  multilineInput: {
    minHeight: 124,
    textAlignVertical: 'top',
  },
  passwordInput: {
    paddingRight: theme.spacing.sm,
  },
  visibilityToggle: {
    width: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visibilityTogglePressed: {
    backgroundColor: theme.colors.primarySoft,
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
