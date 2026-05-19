import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
  type TextInputProps,
  type TextInputSelectionChangeEventData,
} from 'react-native';

import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { theme } from '../../theme';
import { useKeyboardAwareScroll } from '../layout/KeyboardAwareScreen';

type Props = TextInputProps & {
  label: string;
  helperText?: string;
  errorText?: string;
};

const PASSWORD_MASK = '•';
const PASSWORD_REVEAL_MS = 850;

export const AppTextField = forwardRef<TextInput, Props>(function AppTextField(
  {
    label,
    helperText,
    errorText,
    style,
    onFocus,
    onBlur,
    onChangeText,
    onKeyPress,
    onSelectionChange,
    secureTextEntry,
    value,
    autoCapitalize,
    autoCorrect,
    ...props
  },
  ref,
) {
  const hasError = Boolean(errorText);
  const layout = useResponsiveLayout();
  const inputRef = useRef<TextInput>(null);
  const { scrollToInput } = useKeyboardAwareScroll();
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectionRef = useRef({ start: 0, end: 0 });
  const pendingDeletionRef = useRef<{ start: number; end: number } | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [revealedPasswordIndex, setRevealedPasswordIndex] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const isPasswordField = Boolean(secureTextEntry);
  const controlledPasswordValue = isPasswordField && typeof value === 'string' ? value : undefined;
  const maskedPasswordValue = useMemo(() => {
    if (controlledPasswordValue === undefined || passwordVisible) {
      return value;
    }

    return maskPassword(controlledPasswordValue, revealedPasswordIndex);
  }, [controlledPasswordValue, passwordVisible, revealedPasswordIndex, value]);

  useImperativeHandle(ref, () => inputRef.current as TextInput);

  useEffect(() => {
    if (!isPasswordField || passwordVisible || revealedPasswordIndex === null) {
      return undefined;
    }

    revealTimerRef.current = setTimeout(() => {
      setRevealedPasswordIndex(null);
      revealTimerRef.current = null;
    }, PASSWORD_REVEAL_MS);

    return () => {
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    };
  }, [isPasswordField, passwordVisible, revealedPasswordIndex, controlledPasswordValue]);

  const handlePasswordChange = (nextDisplayValue: string) => {
    if (controlledPasswordValue === undefined || passwordVisible) {
      onChangeText?.(nextDisplayValue);
      return;
    }

    const previousDisplayValue = maskPassword(controlledPasswordValue, revealedPasswordIndex);
    const nextPasswordValue = pendingDeletionRef.current && nextDisplayValue.length < previousDisplayValue.length
      ? deriveDeletedPasswordValue(controlledPasswordValue, previousDisplayValue, nextDisplayValue, pendingDeletionRef.current)
      : derivePasswordValue(controlledPasswordValue, previousDisplayValue, nextDisplayValue);
    const revealIndex = findLatestChangedIndex(controlledPasswordValue, nextPasswordValue);
    pendingDeletionRef.current = null;
    setRevealedPasswordIndex(revealIndex);
    onChangeText?.(nextPasswordValue);
  };

  const handlePasswordKeyPress = (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (isPasswordField && !passwordVisible && event.nativeEvent.key === 'Backspace') {
      pendingDeletionRef.current = selectionRef.current;
    }
    onKeyPress?.(event);
  };

  const handleSelectionChange = (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    selectionRef.current = event.nativeEvent.selection;
    onSelectionChange?.(event);
  };

  return (
    <View style={styles.container}>
      <Text maxFontSizeMultiplier={1.1} style={styles.label}>{label}</Text>
      <View
        style={[
          styles.inputFrame,
          { minHeight: layout.touchTarget },
          focused ? styles.inputFocused : null,
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
          secureTextEntry={isPasswordField && controlledPasswordValue === undefined && !passwordVisible}
          textContentType={props.textContentType ?? (isPasswordField ? 'password' : undefined)}
          autoComplete={props.autoComplete ?? (isPasswordField ? 'password' : undefined)}
          autoCapitalize={autoCapitalize ?? (isPasswordField ? 'none' : undefined)}
          autoCorrect={autoCorrect ?? (isPasswordField ? false : undefined)}
          style={[styles.input, props.multiline ? styles.multilineInput : null, isPasswordField ? styles.passwordInput : null]}
          value={maskedPasswordValue}
          onChangeText={isPasswordField ? handlePasswordChange : onChangeText}
          onKeyPress={isPasswordField ? handlePasswordKeyPress : onKeyPress}
          onSelectionChange={isPasswordField ? handleSelectionChange : onSelectionChange}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
            scrollToInput(inputRef.current);
          }}
          onBlur={(event) => {
            setFocused(false);
            setRevealedPasswordIndex(null);
            onBlur?.(event);
          }}
          {...props}
        />
        {isPasswordField ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={passwordVisible ? `Hide ${label}` : `Show ${label}`}
            accessibilityHint="Toggles secure password visibility."
            hitSlop={10}
            onPress={() => {
              setRevealedPasswordIndex(null);
              setPasswordVisible((visible) => !visible);
            }}
            style={({ pressed }) => [styles.visibilityToggle, pressed ? styles.visibilityTogglePressed : null]}
          >
            <Ionicons
              name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
              size={22}
              color={theme.colors.textSecondary}
            />
          </Pressable>
        ) : null}
        {hasError && !isPasswordField ? (
          <View style={styles.errorIcon}>
            <Ionicons name="alert-circle-outline" size={20} color={theme.colors.danger} />
          </View>
        ) : null}
      </View>
      {errorText ? <Text maxFontSizeMultiplier={1.1} style={styles.errorText}>{errorText}</Text> : helperText ? <Text maxFontSizeMultiplier={1.1} style={styles.helperText}>{helperText}</Text> : null}
    </View>
  );
});

function maskPassword(value: string, revealedIndex: number | null) {
  return Array.from(value, (character, index) => (index === revealedIndex ? character : PASSWORD_MASK)).join('');
}

function derivePasswordValue(previousValue: string, previousDisplayValue: string, nextDisplayValue: string) {
  let prefixLength = 0;
  const shortestLength = Math.min(previousDisplayValue.length, nextDisplayValue.length);

  while (
    prefixLength < shortestLength
    && previousDisplayValue[prefixLength] === nextDisplayValue[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < previousDisplayValue.length - prefixLength
    && suffixLength < nextDisplayValue.length - prefixLength
    && previousDisplayValue[previousDisplayValue.length - 1 - suffixLength] === nextDisplayValue[nextDisplayValue.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  const replacement = nextDisplayValue.slice(prefixLength, nextDisplayValue.length - suffixLength);
  const preservedPrefix = previousValue.slice(0, prefixLength);
  const preservedSuffix = suffixLength > 0 ? previousValue.slice(previousValue.length - suffixLength) : '';
  return `${preservedPrefix}${replacement.replaceAll(PASSWORD_MASK, '')}${preservedSuffix}`;
}

function deriveDeletedPasswordValue(
  previousValue: string,
  previousDisplayValue: string,
  nextDisplayValue: string,
  selection: { start: number; end: number },
) {
  const deletedCount = previousDisplayValue.length - nextDisplayValue.length;
  const selectedCount = Math.max(0, selection.end - selection.start);
  const deleteStart = selectedCount > 0 ? selection.start : Math.max(0, selection.start - deletedCount);
  const deleteEnd = Math.min(previousValue.length, selectedCount > 0 ? selection.end : selection.start);

  if (deleteEnd <= deleteStart) {
    return derivePasswordValue(previousValue, previousDisplayValue, nextDisplayValue);
  }

  return `${previousValue.slice(0, deleteStart)}${previousValue.slice(deleteEnd)}`;
}

function findLatestChangedIndex(previousValue: string, nextValue: string) {
  if (nextValue.length <= previousValue.length) {
    return null;
  }

  let index = 0;
  while (index < previousValue.length && previousValue[index] === nextValue[index]) {
    index += 1;
  }

  return Math.min(nextValue.length - 1, index + (nextValue.length - previousValue.length) - 1);
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
  inputFrame: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.input,
    overflow: 'hidden',
  },
  inputFocused: {
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.surfaceSubtle,
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
    width: 56,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visibilityTogglePressed: {
    backgroundColor: theme.colors.primarySoft,
  },
  inputError: {
    borderColor: theme.colors.danger,
  },
  errorIcon: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
