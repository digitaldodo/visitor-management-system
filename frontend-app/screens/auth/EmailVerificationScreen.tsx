import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute, type NavigationProp, type ParamListBase, type RouteProp } from '@react-navigation/native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { AppTextField } from '../../components/form/AppTextField';
import { KeyboardAwareScreen } from '../../components/layout/KeyboardAwareScreen';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { resendEmailVerification, verifyEmail } from '../../services/authService';
import { theme } from '../../theme';

type EmailVerificationRoute = RouteProp<{
  VerifyEmail: {
    token?: string;
    email?: string;
    identifier?: string;
  };
}, 'VerifyEmail'>;

type VerificationState = 'idle' | 'verifying' | 'verified' | 'failed';

export function EmailVerificationScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const route = useRoute<EmailVerificationRoute>();
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const initialIdentifier = String(route.params?.email || route.params?.identifier || '').trim();
  const token = String(route.params?.token || '').trim();
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [state, setState] = useState<VerificationState>(token ? 'verifying' : 'idle');
  const [message, setMessage] = useState<string | null>(token ? 'Checking the verification link.' : null);
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    let active = true;
    if (!token) {
      return undefined;
    }

    setState('verifying');
    setError(null);
    setMessage('Checking the verification link.');
    verifyEmail(token)
      .then((response) => {
        if (!active) {
          return;
        }
        setState('verified');
        setMessage(response.emailVerified
          ? `Email verified${response.email ? ` for ${response.email}` : ''}. You can sign in now.`
          : 'Verification completed. You can sign in now.');
      })
      .catch((verificationError) => {
        if (!active) {
          return;
        }
        setState('failed');
        setError(getErrorMessage(verificationError, 'This verification link is invalid or expired.'));
        setMessage(null);
      });

    return () => {
      active = false;
    };
  }, [token]);

  const status = useMemo(() => {
    if (state === 'verified') {
      return {
        icon: 'checkmark-circle-outline' as const,
        tone: theme.colors.success,
        title: 'Email verified',
        body: message || 'Your visitor account is active.',
      };
    }
    if (state === 'failed') {
      return {
        icon: 'alert-circle-outline' as const,
        tone: theme.colors.warning,
        title: 'Verification needs a fresh link',
        body: error || 'Request a new verification email and open the latest link.',
      };
    }
    if (state === 'verifying') {
      return {
        icon: 'sync-circle-outline' as const,
        tone: theme.colors.info,
        title: 'Verifying email',
        body: message || 'Checking this account activation link.',
      };
    }
    return {
      icon: 'mail-unread-outline' as const,
      tone: theme.colors.info,
      title: 'Verify visitor email',
      body: message || 'Open the link from your inbox, or request a fresh verification email.',
    };
  }, [error, message, state]);

  const resend = async () => {
    const lookup = identifier.trim();
    if (lookup.length < 3) {
      setError('Enter the email or username for the visitor account.');
      setMessage(null);
      setState('failed');
      return;
    }

    setResending(true);
    setError(null);
    try {
      const response = await resendEmailVerification({ identifier: lookup });
      setState('idle');
      setMessage(formatResendMessage(response.resendAvailableAt));
    } catch (resendError) {
      setState('failed');
      setError(getErrorMessage(resendError, 'A verification email could not be sent right now.'));
      setMessage(null);
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAwareScreen
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.container,
          {
            minHeight: layout.height - insets.top - insets.bottom,
            paddingHorizontal: layout.contentPadding,
            paddingTop: theme.spacing.xl,
            paddingBottom: insets.bottom + theme.spacing.xxl,
          },
        ]}
      >
        <View style={[styles.frame, { maxWidth: layout.isLargeTablet ? 560 : 520 }]}>
          <SurfaceCard title="Email verification" subtitle="Activate a visitor account before signing in.">
            <View style={styles.statusBlock}>
              <Ionicons name={status.icon} size={44} color={status.tone} />
              <View style={styles.statusCopy}>
                <Text style={[styles.statusTitle, { color: status.tone }]}>{status.title}</Text>
                <Text style={styles.statusBody}>{status.body}</Text>
              </View>
            </View>

            {state === 'verified' ? (
              <PrimaryButton label="Continue to sign in" onPress={() => navigation.navigate('Login')} />
            ) : (
              <>
                <AppTextField
                  label="Email or username"
                  value={identifier}
                  onChangeText={setIdentifier}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  autoComplete="email"
                  returnKeyType="send"
                  onSubmitEditing={() => void resend()}
                />
                <PrimaryButton label="Resend verification email" onPress={() => void resend()} loading={resending} />
                <PrimaryButton label="Back to sign in" tone="secondary" onPress={() => navigation.navigate('Login')} />
              </>
            )}

            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => navigation.navigate('Login')} style={styles.linkButton}>
              <Text style={styles.linkText}>Use a different account</Text>
            </Pressable>
          </SurfaceCard>
        </View>
      </KeyboardAwareScreen>
    </SafeAreaView>
  );
}

function formatResendMessage(resendAvailableAt?: string | null) {
  const retryAt = formatTime(resendAvailableAt);
  return retryAt
    ? `If the account is waiting for verification, a fresh link was sent. Another resend is available at ${retryAt}.`
    : 'If the account is waiting for verification, a fresh link was sent.';
}

function formatTime(value?: string | null) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.canvas,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    backgroundColor: theme.colors.canvas,
  },
  frame: {
    width: '100%',
    alignSelf: 'center',
  },
  statusBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  statusCopy: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  statusTitle: {
    fontSize: theme.typography.heading.fontSize,
    fontWeight: theme.typography.heading.fontWeight,
  },
  statusBody: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
  linkButton: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  linkText: {
    color: theme.colors.info,
    fontSize: 14,
    fontWeight: '800',
  },
});
