import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';

import { useAuth } from '../../auth/AuthProvider';
import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { AppTextField } from '../../components/form/AppTextField';
import { KeyboardAwareScreen } from '../../components/layout/KeyboardAwareScreen';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { useRegisterVisitorAccountMutation } from '../../hooks/useVisitorWorkspace';
import { theme } from '../../theme';
import type { LoginPayload, VisitorRegisterPayload, WorkspaceAudience } from '../../types/auth';

const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Username or email is required.'),
  password: z.string().min(8, 'Enter your password.'),
  companyCode: z.string().trim().optional(),
  audience: z.enum(['visitor', 'security', 'employee', 'admin']),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const visitorRegisterSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name.'),
  username: z.string().trim().min(4, 'Use at least 4 characters.'),
  email: z.string().trim().email('Enter a valid email.'),
  password: z.string().min(12, 'Use at least 12 characters.'),
  phoneCountryCode: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  companyCode: z.string().trim().optional(),
  companyName: z.string().trim().optional(),
  hostEmployee: z.string().trim().optional(),
  purposeOfVisit: z.string().trim().optional(),
});

type VisitorRegisterFormValues = z.infer<typeof visitorRegisterSchema>;

const audienceOptions: Array<{ value: WorkspaceAudience; label: string; description: string }> = [
  { value: 'visitor', label: 'Visitor', description: 'Register, request access, view pass status' },
  { value: 'security', label: 'Security', description: 'Checkpoint, scan, and live access operations' },
  { value: 'employee', label: 'Employee', description: 'Badge, approvals, and presence workflows' },
  { value: 'admin', label: 'Admin', description: 'Admin and super-admin operational access' },
];

export function LoginScreen() {
  const { login, isBusy, lastError } = useAuth();
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const [submitError, setSubmitError] = useState<string | null>(lastError);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [registerMessage, setRegisterMessage] = useState<string | null>(null);
  const registerVisitorMutation = useRegisterVisitorAccountMutation();

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      identifier: '',
      password: '',
      companyCode: '',
      audience: 'visitor',
    },
  });

  const {
    control: registerControl,
    handleSubmit: handleRegisterSubmit,
    formState: { errors: registerErrors },
    reset: resetRegister,
  } = useForm<VisitorRegisterFormValues>({
    resolver: zodResolver(visitorRegisterSchema),
    defaultValues: {
      fullName: '',
      username: '',
      email: '',
      password: '',
      phoneCountryCode: '+1',
      phone: '',
      companyCode: '',
      companyName: '',
      hostEmployee: '',
      purposeOfVisit: '',
    },
  });

  const selectedAudience = watch('audience');

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);

    try {
      await login(values as LoginPayload);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Sign in failed.');
    }
  });

  const onRegister = handleRegisterSubmit(async (values) => {
    setSubmitError(null);
    setRegisterMessage(null);

    try {
      await registerVisitorMutation.mutateAsync(values as VisitorRegisterPayload);
      resetRegister({
        fullName: '',
        username: '',
        email: '',
        password: '',
        phoneCountryCode: '+1',
        phone: '',
        companyCode: '',
        companyName: '',
        hostEmployee: '',
        purposeOfVisit: '',
      });
      setAuthMode('login');
      setValue('audience', 'visitor', { shouldValidate: true });
      setRegisterMessage('Visitor account created. Check your email to verify the account, then sign in.');
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Visitor registration failed.');
    }
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAwareScreen
        alwaysBounceVertical={false}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.container,
          {
            minHeight: layout.height - insets.top - insets.bottom,
            paddingHorizontal: layout.contentPadding,
            paddingTop: layout.isCompactHeight ? theme.spacing.md : theme.spacing.xl,
            paddingBottom: insets.bottom + theme.spacing.xxl,
          },
        ]}
      >
        <View style={[styles.frame, layout.isTwoColumn ? styles.frameWide : null, { maxWidth: layout.isLargeTablet ? 1120 : 920 }]}>
            <View style={[styles.hero, layout.isTwoColumn ? styles.heroWide : null]}>
              <View style={styles.brandPanel}>
                <Image source={require('../../assets/brand-wordmark.png')} style={styles.wordmark} resizeMode="contain" />
                <Text style={styles.brandSubline}>AccessFlow Mobile</Text>
              </View>
              <Text maxFontSizeMultiplier={1.12} style={[styles.title, layout.isSmallPhone ? styles.titleCompact : null]}>
                Native access for visitors and operational teams
              </Text>
              <Text maxFontSizeMultiplier={1.08} style={styles.subtitle}>
                Sign in or register to request access, view passes, scan badges, approve visits, and operate your assigned workspace from Android phones and tablets.
              </Text>
              <View style={styles.proofRow}>
                <Text style={styles.proofChip}>Visitor ready</Text>
                <Text style={styles.proofChip}>Guard ready</Text>
                <Text style={styles.proofChip}>Employee badge</Text>
              </View>
            </View>

            <SurfaceCard
              title={authMode === 'login' ? 'Secure sign-in' : 'Visitor registration'}
              subtitle={authMode === 'login' ? 'Choose your workspace, then authenticate against the live AccessFlow backend.' : 'Create a visitor account for access requests, pass status, QR badges, notifications, and history.'}
            >
              <View style={styles.modeRow}>
                {(['login', 'register'] as const).map((mode) => {
                  const selected = authMode === mode;
                  return (
                    <Pressable
                      key={mode}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => {
                        setAuthMode(mode);
                        setSubmitError(null);
                      }}
                      style={[styles.modeButton, selected ? styles.modeButtonSelected : null]}
                    >
                      <Text style={[styles.modeButtonLabel, selected ? styles.modeButtonLabelSelected : null]}>
                        {mode === 'login' ? 'Sign in' : 'Register visitor'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {authMode === 'login' ? (
                <>
                  <View style={styles.audienceRow}>
                    {audienceOptions.map((option) => {
                      const selected = selectedAudience === option.value;
                      return (
                        <Pressable
                          key={option.value}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          onPress={() => setValue('audience', option.value, { shouldValidate: true })}
                          style={[styles.audienceChip, selected ? styles.audienceChipSelected : null]}
                        >
                          <Text style={[styles.audienceLabel, selected ? styles.audienceLabelSelected : null]}>{option.label}</Text>
                          <Text style={[styles.audienceDescription, selected ? styles.audienceDescriptionSelected : null]}>
                            {option.description}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Controller
                    control={control}
                    name="identifier"
                    render={({ field: { onChange, value } }) => (
                      <AppTextField
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="email-address"
                        label="Username or email"
                        onChangeText={onChange}
                        value={value}
                        errorText={errors.identifier?.message}
                        returnKeyType="next"
                      />
                    )}
                  />

                  <Controller
                    control={control}
                    name="companyCode"
                    render={({ field: { onChange, value } }) => (
                      <AppTextField
                        autoCapitalize="characters"
                        autoCorrect={false}
                        label="Organization code"
                        helperText={selectedAudience === 'visitor' ? 'Optional for visitor accounts unless your organization requires it.' : 'Required for organization-scoped security, employee, and most admin accounts.'}
                        onChangeText={onChange}
                        value={value}
                        errorText={errors.companyCode?.message}
                        returnKeyType="next"
                      />
                    )}
                  />

                  <Controller
                    control={control}
                    name="password"
                    render={({ field: { onChange, value } }) => (
                      <AppTextField
                        autoCapitalize="none"
                        autoCorrect={false}
                        label="Password"
                        onChangeText={onChange}
                        secureTextEntry
                        value={value}
                        errorText={errors.password?.message}
                        returnKeyType="go"
                        onSubmitEditing={() => void onSubmit()}
                      />
                    )}
                  />
                </>
              ) : (
                <>
                  <Controller
                    control={registerControl}
                    name="fullName"
                    render={({ field: { onChange, value } }) => (
                      <AppTextField label="Full name" value={value} onChangeText={onChange} placeholder="Your full name" errorText={registerErrors.fullName?.message} returnKeyType="next" />
                    )}
                  />
                  <Controller
                    control={registerControl}
                    name="username"
                    render={({ field: { onChange, value } }) => (
                      <AppTextField label="Username" value={value} onChangeText={onChange} placeholder="visitor_name" autoCapitalize="none" autoCorrect={false} errorText={registerErrors.username?.message} returnKeyType="next" />
                    )}
                  />
                  <Controller
                    control={registerControl}
                    name="email"
                    render={({ field: { onChange, value } }) => (
                      <AppTextField label="Email" value={value} onChangeText={onChange} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} errorText={registerErrors.email?.message} returnKeyType="next" />
                    )}
                  />
                  <Controller
                    control={registerControl}
                    name="password"
                    render={({ field: { onChange, value } }) => (
                      <AppTextField label="Password" value={value} onChangeText={onChange} placeholder="12+ characters" secureTextEntry autoCapitalize="none" errorText={registerErrors.password?.message} returnKeyType="next" />
                    )}
                  />
                  <View style={[styles.inlineFields, layout.fieldStacked ? styles.inlineFieldsStacked : null]}>
                    <Controller
                      control={registerControl}
                      name="phoneCountryCode"
                      render={({ field: { onChange, value } }) => (
                        <View style={[styles.inlineField, layout.fieldStacked ? styles.inlineFieldStacked : null]}>
                          <AppTextField label="Code" value={value} onChangeText={onChange} placeholder="+1" keyboardType="phone-pad" />
                        </View>
                      )}
                    />
                    <Controller
                      control={registerControl}
                      name="phone"
                      render={({ field: { onChange, value } }) => (
                        <View style={styles.inlineFieldWide}>
                          <AppTextField label="Phone" value={value} onChangeText={onChange} placeholder="555 0100" keyboardType="phone-pad" />
                        </View>
                      )}
                    />
                  </View>
                  <Controller
                    control={registerControl}
                    name="companyCode"
                    render={({ field: { onChange, value } }) => (
                      <AppTextField label="Organization code" value={value} onChangeText={onChange} placeholder="Optional" autoCapitalize="characters" />
                    )}
                  />
                  <Controller
                    control={registerControl}
                    name="companyName"
                    render={({ field: { onChange, value } }) => (
                      <AppTextField label="Organization name" value={value} onChangeText={onChange} placeholder="Company or facility" />
                    )}
                  />
                  <Controller
                    control={registerControl}
                    name="hostEmployee"
                    render={({ field: { onChange, value } }) => (
                      <AppTextField label="Host" value={value} onChangeText={onChange} placeholder="Host name, if known" />
                    )}
                  />
                  <Controller
                    control={registerControl}
                    name="purposeOfVisit"
                    render={({ field: { onChange, value } }) => (
                      <AppTextField label="Purpose" value={value} onChangeText={onChange} placeholder="Meeting, interview, service visit" onSubmitEditing={() => void onRegister()} returnKeyType="done" />
                    )}
                  />
                </>
              )}

              {registerMessage ? <Text style={styles.successText}>{registerMessage}</Text> : null}
              {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

              <PrimaryButton
                label={authMode === 'login' ? 'Continue to workspace' : 'Create visitor account'}
                onPress={() => void (authMode === 'login' ? onSubmit() : onRegister())}
                loading={authMode === 'login' ? isBusy : registerVisitorMutation.isPending}
              />
            </SurfaceCard>
          </View>
      </KeyboardAwareScreen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
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
    maxWidth: 1080,
    alignSelf: 'center',
    gap: theme.spacing.xl,
  },
  frameWide: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hero: {
    gap: theme.spacing.md,
    borderRadius: theme.radii.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSubtle,
    padding: theme.spacing.lg,
  },
  heroWide: {
    flex: 1,
    paddingRight: theme.spacing.lg,
  },
  brandPanel: {
    gap: theme.spacing.sm,
  },
  wordmark: {
    width: '100%',
    height: 74,
    maxWidth: 360,
    alignSelf: 'flex-start',
  },
  eyebrow: {
    color: theme.colors.primary,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  brandSubline: {
    alignSelf: 'flex-start',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.primarySoft,
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    textTransform: 'uppercase',
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 28,
    fontWeight: '800',
  },
  titleCompact: {
    fontSize: 24,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
  proofRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  proofChip: {
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 7,
  },
  modeRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  modeButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  modeButtonSelected: {
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.primarySoft,
  },
  modeButtonLabel: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
    textAlign: 'center',
  },
  modeButtonLabelSelected: {
    color: theme.colors.textPrimary,
  },
  audienceRow: {
    gap: theme.spacing.sm,
  },
  audienceChip: {
    minHeight: 58,
    gap: 4,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceMuted,
  },
  audienceChipSelected: {
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.primarySoft,
  },
  audienceLabel: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  audienceLabelSelected: {
    color: theme.colors.textPrimary,
  },
  audienceDescription: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  audienceDescriptionSelected: {
    color: theme.colors.textSecondary,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 14,
  },
  successText: {
    color: theme.colors.success,
    fontSize: 14,
    lineHeight: 20,
  },
  inlineFields: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  inlineFieldsStacked: {
    flexDirection: 'column',
  },
  inlineField: {
    width: 96,
  },
  inlineFieldStacked: {
    width: '100%',
  },
  inlineFieldWide: {
    flex: 1,
  },
});
