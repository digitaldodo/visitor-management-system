import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';

import { getBiometricReadiness, type BiometricReadiness } from '../../auth/biometricReadiness';
import { useAuth } from '../../auth/AuthProvider';
import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { AppTextField } from '../../components/form/AppTextField';
import { InternationalPhoneInput } from '../../components/form/InternationalPhoneInput';
import { OrganizationSelector } from '../../components/form/OrganizationSelector';
import { KeyboardAwareScreen } from '../../components/layout/KeyboardAwareScreen';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { useLocalization } from '../../localization/LocalizationProvider';
import { useRegisterVisitorAccountMutation } from '../../hooks/useVisitorWorkspace';
import { requestPasswordReset, resetPassword, verifyPasswordResetOtp } from '../../services/authService';
import { theme } from '../../theme';
import type { LoginPayload, VisitorRegisterPayload, WorkspaceAudience } from '../../types/auth';

const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Username or email is required.'),
  password: z.string().min(8, 'Enter your password.'),
  companyCode: z.string().trim().optional(),
  audience: z.enum(['visitor', 'security', 'employee', 'admin']),
  rememberMe: z.boolean(),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const visitorRegisterSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name.'),
  username: z.string().trim().min(4, 'Use at least 4 characters.'),
  email: z.string().trim().email('Enter a valid email.'),
  password: z.string().min(12, 'Use at least 12 characters.'),
  phoneCountryCode: z.string().trim().optional(),
  phone: z.string().trim().optional(),
});

type VisitorRegisterFormValues = z.infer<typeof visitorRegisterSchema>;
type AuthMode = 'login' | 'register' | 'recovery';
type RecoveryStep = 'identify' | 'verify' | 'reset' | 'done';

const audienceOptions: Array<{ value: WorkspaceAudience; label: string; description: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { value: 'visitor', label: 'Visitor', description: 'Pass status and visit requests', icon: 'ticket-outline' },
  { value: 'security', label: 'Security', description: 'Checkpoint and scan operations', icon: 'shield-checkmark-outline' },
  { value: 'employee', label: 'Employee', description: 'Badge, approvals, and presence', icon: 'card-outline' },
  { value: 'admin', label: 'Org Admin', description: 'Organization approvals and visibility', icon: 'settings-outline' },
];

const registerStepFields: Array<Array<keyof VisitorRegisterFormValues>> = [
  ['fullName', 'username', 'email', 'password'],
  ['phoneCountryCode', 'phone'],
];

const registerStepLabels = ['Identity', 'Contact'];

export function LoginScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const { login, isBusy, lastError } = useAuth();
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const { t } = useLocalization();
  const [submitError, setSubmitError] = useState<string | null>(lastError);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [registerStep, setRegisterStep] = useState(0);
  const [registerMessage, setRegisterMessage] = useState<string | null>(null);
  const [recoveryStep, setRecoveryStep] = useState<RecoveryStep>('identify');
  const [recoveryIdentifier, setRecoveryIdentifier] = useState('');
  const [recoveryOtp, setRecoveryOtp] = useState('');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [biometricReadiness, setBiometricReadiness] = useState<BiometricReadiness | null>(null);
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
      rememberMe: true,
    },
  });

  const {
    control: registerControl,
    handleSubmit: handleRegisterSubmit,
    formState: { errors: registerErrors },
    reset: resetRegister,
    trigger: triggerRegister,
    setValue: setRegisterValue,
    watch: watchRegister,
  } = useForm<VisitorRegisterFormValues>({
    resolver: zodResolver(visitorRegisterSchema),
    defaultValues: {
      fullName: '',
      username: '',
      email: '',
      password: '',
      phoneCountryCode: '+1',
      phone: '',
    },
  });

  useEffect(() => {
    let active = true;
    void getBiometricReadiness().then((readiness) => {
      if (active) {
        setBiometricReadiness(readiness);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const selectedAudience = watch('audience');
  const selectedCompanyCode = watch('companyCode');
  const rememberMe = watch('rememberMe');
  const registerPhoneCountryCode = watchRegister('phoneCountryCode') || '+1';
  const registerPhone = watchRegister('phone') || '';
  const isCompactLandscape = layout.isLandscape && layout.isCompactHeight;
  const requiresOrganizationSelector = selectedAudience === 'employee'
    || selectedAudience === 'security'
    || selectedAudience === 'admin';
  const status = useMemo(() => buildAuthStatus(submitError, recoveryError, recoveryMessage, registerMessage), [
    recoveryError,
    recoveryMessage,
    registerMessage,
    submitError,
  ]);

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    setRegisterMessage(null);

    if (requiresOrganizationSelector && !values.companyCode?.trim()) {
      setSubmitError('Select an organization before signing in to this workspace.');
      return;
    }

    try {
      await login({
        ...values,
        companyCode: requiresOrganizationSelector ? values.companyCode : undefined,
      } as LoginPayload);
    } catch (error) {
      setSubmitError(getErrorMessage(error, 'Sign in failed.'));
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
      });
      setRegisterStep(0);
      setAuthMode('login');
      setValue('audience', 'visitor', { shouldValidate: true });
      setRegisterMessage('Visitor account created. Verify your email, then sign in.');
    } catch (error) {
      setSubmitError(getErrorMessage(error, 'Visitor registration failed.'));
    }
  });

  const advanceRegisterStep = async () => {
    const valid = await triggerRegister(registerStepFields[registerStep]);
    if (valid) {
      setRegisterStep((step) => Math.min(step + 1, registerStepLabels.length - 1));
    }
  };

  const submitRecoveryIdentifier = async () => {
    const identifier = recoveryIdentifier.trim();
    if (identifier.length < 3) {
      setRecoveryError('Enter the email or username for the account.');
      return;
    }

    setRecoveryLoading(true);
    setRecoveryError(null);
    setRecoveryMessage(null);
    try {
      const response = await requestPasswordReset({ identifier });
      setRecoveryStep('verify');
      setRecoveryMessage(`If the account exists, a 6 digit code was sent. ${formatExpiry(response.expiresAt)}`);
    } catch (error) {
      setRecoveryError(getErrorMessage(error, 'Password recovery could not be started.'));
    } finally {
      setRecoveryLoading(false);
    }
  };

  const submitRecoveryOtp = async () => {
    const identifier = recoveryIdentifier.trim();
    const otp = recoveryOtp.trim();
    if (!/^\d{6}$/.test(otp)) {
      setRecoveryError('Enter the 6 digit verification code.');
      return;
    }

    setRecoveryLoading(true);
    setRecoveryError(null);
    setRecoveryMessage(null);
    try {
      const response = await verifyPasswordResetOtp({ identifier, otp });
      setResetToken(response.resetToken);
      setRecoveryStep('reset');
      setRecoveryMessage(`Code verified. Choose a new password. ${formatExpiry(response.expiresAt)}`);
    } catch (error) {
      setRecoveryError(getErrorMessage(error, 'The verification code was rejected or expired.'));
    } finally {
      setRecoveryLoading(false);
    }
  };

  const submitNewPassword = async () => {
    if (!resetToken) {
      setRecoveryError('Restart recovery to request a fresh verification code.');
      setRecoveryStep('identify');
      return;
    }

    if (newPassword.length < 12) {
      setRecoveryError('Use at least 12 characters for the new password.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setRecoveryError('The passwords do not match.');
      return;
    }

    setRecoveryLoading(true);
    setRecoveryError(null);
    setRecoveryMessage(null);
    try {
      await resetPassword({ resetToken, newPassword });
      setRecoveryStep('done');
      setRecoveryOtp('');
      setResetToken(null);
      setNewPassword('');
      setConfirmPassword('');
      setRecoveryMessage('Password updated. Sign in with the new password.');
    } catch (error) {
      setRecoveryError(getErrorMessage(error, 'Password reset failed.'));
    } finally {
      setRecoveryLoading(false);
    }
  };

  const switchMode = (mode: AuthMode) => {
    setAuthMode(mode);
    setSubmitError(null);
    setRecoveryError(null);
    setRecoveryMessage(null);
  };

  useEffect(() => {
    if (!requiresOrganizationSelector && selectedCompanyCode) {
      setValue('companyCode', '', { shouldValidate: true });
    }
  }, [requiresOrganizationSelector, selectedCompanyCode, setValue]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAwareScreen
        alwaysBounceVertical={false}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.container,
          isCompactLandscape ? styles.containerLandscape : null,
          {
            minHeight: layout.height - insets.top - insets.bottom,
            paddingHorizontal: layout.contentPadding,
            paddingTop: isCompactLandscape ? theme.spacing.sm : layout.isCompactHeight ? theme.spacing.md : theme.spacing.xl,
            paddingBottom: insets.bottom + (isCompactLandscape ? theme.spacing.lg : theme.spacing.xxl),
          },
        ]}
      >
        <View
          style={[
            styles.frame,
            layout.isTwoColumn ? styles.frameWide : null,
            isCompactLandscape ? styles.frameLandscape : null,
            { maxWidth: isCompactLandscape ? 820 : layout.isLargeTablet ? 1120 : 940 },
          ]}
        >
          <View style={[styles.hero, layout.isTwoColumn ? styles.heroWide : null, isCompactLandscape ? styles.heroLandscape : null]}>
            <View style={styles.brandPanel}>
              <Image
                source={require('../../assets/brand-wordmark.png')}
                style={[styles.wordmark, isCompactLandscape ? styles.wordmarkLandscape : null]}
                resizeMode="contain"
              />
              <View style={styles.brandBadge}>
                <Ionicons name="lock-closed-outline" size={15} color={theme.colors.info} />
                <Text style={styles.brandSubline}>{t('auth.secureWorkspace')}</Text>
              </View>
            </View>
            {!isCompactLandscape ? (
              <>
                <Text maxFontSizeMultiplier={1.12} style={[styles.title, layout.isSmallPhone ? styles.titleCompact : null]}>
                  Trusted access for every role
                </Text>
                <Text maxFontSizeMultiplier={1.08} style={styles.subtitle}>
                  Sign in, recover access, or onboard as a visitor with role-aware routing, secure session restore, and operational Android ergonomics.
                </Text>
                <View style={styles.proofRow}>
                  <TrustChip icon="finger-print-outline" label={biometricReadiness?.enrolled ? biometricReadiness.label : 'Biometric-ready'} />
                  <TrustChip icon="refresh-circle-outline" label="Refresh-token safe" />
                  <TrustChip icon="business-outline" label="Enterprise roles" />
                </View>
              </>
            ) : null}
          </View>

          <View style={[styles.authCardShell, layout.isTwoColumn ? styles.authCardShellWide : null]}>
            <SurfaceCard title={titleForMode(authMode, recoveryStep, t)} subtitle={subtitleForMode(authMode, recoveryStep, isCompactLandscape)}>
              <View style={styles.modeRow}>
                {(['login', 'register', 'recovery'] as const).map((mode) => (
                  <ModeButton
                    key={mode}
                    label={mode === 'login' ? t('auth.signIn') : mode === 'register' ? t('auth.visitor') : t('auth.recover')}
                    icon={mode === 'login' ? 'log-in-outline' : mode === 'register' ? 'person-add-outline' : 'key-outline'}
                    selected={authMode === mode}
                    onPress={() => switchMode(mode)}
                  />
                ))}
              </View>

            {status ? <StatusPanel status={status} /> : null}

            {authMode === 'login' ? (
              <>
                <View style={styles.audienceGrid}>
                  {audienceOptions.map((option) => {
                    const selected = selectedAudience === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => {
                          setValue('audience', option.value, { shouldValidate: true });
                          if (option.value === 'visitor') {
                            setValue('companyCode', '', { shouldValidate: true });
                          }
                        }}
                        android_ripple={{ color: theme.colors.primarySoft }}
                        style={({ pressed }) => [
                          styles.audienceChip,
                          selected ? styles.audienceChipSelected : null,
                          pressed ? styles.pressed : null,
                        ]}
                      >
                        <View style={styles.audienceHeader}>
                          <Ionicons name={option.icon} size={20} color={selected ? theme.colors.info : theme.colors.textSecondary} />
                          <Text style={[styles.audienceLabel, selected ? styles.audienceLabelSelected : null]}>{option.label}</Text>
                        </View>
                        <Text style={styles.audienceDescription}>{option.description}</Text>
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
                      autoComplete="username"
                      textContentType="username"
                      keyboardType="email-address"
                      label={t('auth.usernameEmail')}
                      onChangeText={onChange}
                      value={value}
                      errorText={errors.identifier?.message}
                      returnKeyType="next"
                    />
                  )}
                />

                {requiresOrganizationSelector ? (
                  <OrganizationSelector
                    selectedCode={selectedCompanyCode}
                    helperText="Start typing to search. The organization list stays hidden until then."
                    onSelect={(organization) => setValue('companyCode', organization.companyCode, { shouldValidate: true, shouldDirty: true })}
                    onClear={() => setValue('companyCode', '', { shouldValidate: true, shouldDirty: true })}
                  />
                ) : null}

                <Controller
                  control={control}
                  name="password"
                  render={({ field: { onChange, value } }) => (
                    <AppTextField
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="current-password"
                      textContentType="password"
                      label={t('auth.password')}
                      onChangeText={onChange}
                      secureTextEntry
                      value={value}
                      errorText={errors.password?.message}
                      returnKeyType="go"
                      onSubmitEditing={() => void onSubmit()}
                    />
                  )}
                />

                <View style={[styles.authOptionsRow, layout.fieldStacked ? styles.authOptionsStacked : null]}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: rememberMe }}
                    onPress={() => setValue('rememberMe', !rememberMe, { shouldDirty: true })}
                    style={styles.rememberRow}
                    hitSlop={8}
                  >
                    <View style={[styles.checkbox, rememberMe ? styles.checkboxSelected : null]}>
                      {rememberMe ? <Ionicons name="checkmark" size={16} color={theme.colors.textInverse} /> : null}
                    </View>
                    <View style={styles.rememberCopy}>
                      <Text style={styles.rememberLabel}>{t('auth.rememberDevice')}</Text>
                      <Text style={styles.rememberHelp}>Stores only tokens in secure device storage.</Text>
                    </View>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => switchMode('recovery')} hitSlop={8} style={styles.linkButton}>
                    <Text style={styles.linkText}>{t('auth.forgotPassword')}</Text>
                  </Pressable>
                </View>

                <PrimaryButton
                  label={t('auth.continue')}
                  onPress={() => void onSubmit()}
                  loading={isBusy}
                />
              </>
            ) : authMode === 'register' ? (
              <>
                <ProgressHeader step={registerStep} />
                {registerStep === 0 ? (
                  <>
                    <Controller
                      control={registerControl}
                      name="fullName"
                      render={({ field: { onChange, value } }) => (
                        <AppTextField label="Full name" value={value} onChangeText={onChange} placeholder="Your full name" errorText={registerErrors.fullName?.message} returnKeyType="next" textContentType="name" />
                      )}
                    />
                    <Controller
                      control={registerControl}
                      name="username"
                      render={({ field: { onChange, value } }) => (
                        <AppTextField label="Username" value={value} onChangeText={onChange} placeholder="visitor_name" autoCapitalize="none" autoCorrect={false} autoComplete="username-new" errorText={registerErrors.username?.message} returnKeyType="next" />
                      )}
                    />
                    <Controller
                      control={registerControl}
                      name="email"
                      render={({ field: { onChange, value } }) => (
                        <AppTextField label="Email" value={value} onChangeText={onChange} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" errorText={registerErrors.email?.message} returnKeyType="next" />
                      )}
                    />
                    <Controller
                      control={registerControl}
                      name="password"
                      render={({ field: { onChange, value } }) => (
                        <AppTextField label="Password" value={value} onChangeText={onChange} placeholder="12+ characters" secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" errorText={registerErrors.password?.message} returnKeyType="next" />
                      )}
                    />
                  </>
                ) : (
                  <>
                    <Controller
                      control={registerControl}
                      name="phone"
                      render={() => (
                        <InternationalPhoneInput
                          countryCode={registerPhoneCountryCode}
                          phone={registerPhone}
                          onCountryCodeChange={(value) => setRegisterValue('phoneCountryCode', value, { shouldDirty: true, shouldValidate: true })}
                          onPhoneChange={(value) => setRegisterValue('phone', value, { shouldDirty: true, shouldValidate: true })}
                        />
                      )}
                    />
                    <View style={styles.onboardingNote}>
                      <Ionicons name="mail-unread-outline" size={20} color={theme.colors.info} />
                      <Text style={styles.onboardingText}>After registration, AccessFlow sends a verification email. Organization and host selection happens later when you request access.</Text>
                    </View>
                  </>
                )}
                <View style={styles.navigationRow}>
                  <PrimaryButton
                    label="Back"
                    tone="secondary"
                    disabled={registerStep === 0 || registerVisitorMutation.isPending}
                    onPress={() => setRegisterStep((step) => Math.max(step - 1, 0))}
                  />
                  <View style={styles.navigationPrimary}>
                    {registerStep < registerStepLabels.length - 1 ? (
                      <PrimaryButton label="Next" onPress={() => void advanceRegisterStep()} />
                    ) : (
                      <PrimaryButton label="Create visitor account" onPress={() => void onRegister()} loading={registerVisitorMutation.isPending} />
                    )}
                  </View>
                </View>
              </>
            ) : (
              <RecoveryFlow
                step={recoveryStep}
                identifier={recoveryIdentifier}
                otp={recoveryOtp}
                newPassword={newPassword}
                confirmPassword={confirmPassword}
                loading={recoveryLoading}
                onIdentifierChange={setRecoveryIdentifier}
                onOtpChange={setRecoveryOtp}
                onNewPasswordChange={setNewPassword}
                onConfirmPasswordChange={setConfirmPassword}
                onIdentify={() => void submitRecoveryIdentifier()}
                onVerify={() => void submitRecoveryOtp()}
                onReset={() => void submitNewPassword()}
                onRestart={() => {
                  setRecoveryStep('identify');
                  setRecoveryOtp('');
                  setResetToken(null);
                  setNewPassword('');
                  setConfirmPassword('');
                  setRecoveryError(null);
                  setRecoveryMessage(null);
                }}
                onReturnToLogin={() => switchMode('login')}
              />
            )}
            </SurfaceCard>
            <View style={styles.legalLinks}>
              <Pressable accessibilityRole="link" onPress={() => navigation.navigate('Legal', { type: 'privacy' })} hitSlop={8}>
                <Text style={styles.legalLinkText}>Privacy Policy</Text>
              </Pressable>
              <Text style={styles.legalDivider}>/</Text>
              <Pressable accessibilityRole="link" onPress={() => navigation.navigate('Legal', { type: 'terms' })} hitSlop={8}>
                <Text style={styles.legalLinkText}>Terms & Conditions</Text>
              </Pressable>
              <Text style={styles.legalDivider}>/</Text>
              <Pressable accessibilityRole="button" onPress={() => navigation.navigate('Onboarding')} hitSlop={8}>
                <Text style={styles.legalLinkText}>Replay onboarding</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAwareScreen>
    </SafeAreaView>
  );
}

function TrustChip({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.trustChip}>
      <Ionicons name={icon} size={16} color={theme.colors.info} />
      <Text style={styles.trustChipText}>{label}</Text>
    </View>
  );
}

function ModeButton({
  icon,
  label,
  selected,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      android_ripple={{ color: theme.colors.primarySoft }}
      style={({ pressed }) => [styles.modeButton, selected ? styles.modeButtonSelected : null, pressed ? styles.pressed : null]}
    >
      <Ionicons name={icon} size={18} color={selected ? theme.colors.info : theme.colors.textSecondary} />
      <Text style={[styles.modeButtonLabel, selected ? styles.modeButtonLabelSelected : null]}>{label}</Text>
    </Pressable>
  );
}

function ProgressHeader({ step }: { step: number }) {
  return (
    <View style={styles.progressBlock}>
      <View style={styles.progressTrack}>
        {registerStepLabels.map((label, index) => {
          const active = index <= step;
          return (
            <View key={label} style={styles.progressItem}>
              <View style={[styles.progressDot, active ? styles.progressDotActive : null]}>
                <Text style={[styles.progressNumber, active ? styles.progressNumberActive : null]}>{index + 1}</Text>
              </View>
              <Text style={[styles.progressLabel, active ? styles.progressLabelActive : null]}>{label}</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${((step + 1) / registerStepLabels.length) * 100}%` }]} />
      </View>
    </View>
  );
}

function RecoveryFlow({
  step,
  identifier,
  otp,
  newPassword,
  confirmPassword,
  loading,
  onIdentifierChange,
  onOtpChange,
  onNewPasswordChange,
  onConfirmPasswordChange,
  onIdentify,
  onVerify,
  onReset,
  onRestart,
  onReturnToLogin,
}: {
  step: RecoveryStep;
  identifier: string;
  otp: string;
  newPassword: string;
  confirmPassword: string;
  loading: boolean;
  onIdentifierChange: (value: string) => void;
  onOtpChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onIdentify: () => void;
  onVerify: () => void;
  onReset: () => void;
  onRestart: () => void;
  onReturnToLogin: () => void;
}) {
  if (step === 'done') {
    return (
      <>
        <View style={styles.recoveryDone}>
          <Ionicons name="checkmark-circle-outline" size={42} color={theme.colors.success} />
          <Text style={styles.recoveryDoneTitle}>Account access restored</Text>
          <Text style={styles.recoveryDoneBody}>All refresh sessions were revoked by the backend. Sign in again with the new password.</Text>
        </View>
        <PrimaryButton label="Return to sign in" onPress={onReturnToLogin} />
      </>
    );
  }

  return (
    <>
      <View style={styles.recoverySteps}>
        <RecoveryStepItem active={step === 'identify'} complete={step !== 'identify'} label="Email" />
        <RecoveryStepItem active={step === 'verify'} complete={step === 'reset'} label="Code" />
        <RecoveryStepItem active={step === 'reset'} complete={false} label="Password" />
      </View>

      {step === 'identify' ? (
        <>
          <AppTextField
            label="Email or username"
            value={identifier}
            onChangeText={onIdentifierChange}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="username"
            returnKeyType="send"
            onSubmitEditing={onIdentify}
          />
          <PrimaryButton label="Send verification code" onPress={onIdentify} loading={loading} />
        </>
      ) : step === 'verify' ? (
        <>
          <AppTextField
            label="6 digit code"
            value={otp}
            onChangeText={(value) => onOtpChange(value.replace(/[^\d]/g, '').slice(0, 6))}
            keyboardType="number-pad"
            placeholder="000000"
            maxLength={6}
            returnKeyType="done"
            onSubmitEditing={onVerify}
          />
          <View style={styles.navigationRow}>
            <PrimaryButton label="Resend" tone="secondary" onPress={onIdentify} disabled={loading} />
            <View style={styles.navigationPrimary}>
              <PrimaryButton label="Verify code" onPress={onVerify} loading={loading} />
            </View>
          </View>
        </>
      ) : (
        <>
          <AppTextField
            label="New password"
            value={newPassword}
            onChangeText={onNewPasswordChange}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            helperText="Use 12 or more characters. Existing sessions will be revoked."
            returnKeyType="next"
          />
          <AppTextField
            label="Confirm password"
            value={confirmPassword}
            onChangeText={onConfirmPasswordChange}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="done"
            onSubmitEditing={onReset}
          />
          <PrimaryButton label="Update password" onPress={onReset} loading={loading} />
        </>
      )}

      <Pressable accessibilityRole="button" onPress={onRestart} hitSlop={8} style={styles.secondaryLink}>
        <Text style={styles.secondaryLinkText}>Restart recovery</Text>
      </Pressable>
    </>
  );
}

function RecoveryStepItem({ active, complete, label }: { active: boolean; complete: boolean; label: string }) {
  return (
    <View style={[styles.recoveryStepItem, active ? styles.recoveryStepItemActive : null]}>
      <Ionicons
        name={complete ? 'checkmark-circle' : active ? 'radio-button-on' : 'ellipse-outline'}
        size={16}
        color={complete ? theme.colors.success : active ? theme.colors.info : theme.colors.textMuted}
      />
      <Text style={[styles.recoveryStepLabel, active ? styles.recoveryStepLabelActive : null]}>{label}</Text>
    </View>
  );
}

function StatusPanel({ status }: { status: { tone: 'danger' | 'success' | 'warning' | 'info'; title: string; body: string } }) {
  const toneStyles = {
    danger: { icon: 'alert-circle-outline' as const, color: theme.colors.danger, backgroundColor: theme.colors.dangerSoft },
    success: { icon: 'checkmark-circle-outline' as const, color: theme.colors.success, backgroundColor: theme.colors.successSoft },
    warning: { icon: 'warning-outline' as const, color: theme.colors.warning, backgroundColor: theme.colors.warningSoft },
    info: { icon: 'information-circle-outline' as const, color: theme.colors.info, backgroundColor: theme.colors.infoSoft },
  }[status.tone];

  return (
    <View style={[styles.statusPanel, { backgroundColor: toneStyles.backgroundColor }]}>
      <Ionicons name={toneStyles.icon} size={22} color={toneStyles.color} />
      <View style={styles.statusCopy}>
        <Text style={styles.statusTitle}>{status.title}</Text>
        <Text style={styles.statusBody}>{status.body}</Text>
      </View>
    </View>
  );
}

function buildAuthStatus(
  submitError: string | null,
  recoveryError: string | null,
  recoveryMessage: string | null,
  registerMessage: string | null,
) {
  if (recoveryError) {
    return classifyError(recoveryError);
  }
  if (submitError) {
    return classifyError(submitError);
  }
  if (recoveryMessage) {
    return { tone: 'info' as const, title: 'Recovery in progress', body: recoveryMessage };
  }
  if (registerMessage) {
    return { tone: 'success' as const, title: 'Visitor onboarding started', body: registerMessage };
  }
  return null;
}

function classifyError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes('locked')) {
    return { tone: 'warning' as const, title: 'Account locked', body: `${message} Contact an administrator or use recovery when available.` };
  }
  if (normalized.includes('expired') || normalized.includes('revoked') || normalized.includes('invalid session')) {
    return { tone: 'warning' as const, title: 'Session expired', body: message };
  }
  if (normalized.includes('network') || normalized.includes('could not reach') || normalized.includes('timeout')) {
    return { tone: 'warning' as const, title: 'Connection issue', body: `${message} Check connectivity, then retry.` };
  }
  if (normalized.includes('server') || normalized.includes('backend') || normalized.includes('503') || normalized.includes('502')) {
    return { tone: 'danger' as const, title: 'Service unavailable', body: `${message} Retry once the backend is reachable.` };
  }
  if (normalized.includes('super admin')) {
    return { tone: 'warning' as const, title: 'Mobile access unavailable', body: message };
  }
  if (normalized.includes('credential') || normalized.includes('password') || normalized.includes('unauthorized') || normalized.includes('invalid')) {
    return { tone: 'danger' as const, title: 'Sign in was not accepted', body: `${message} You can retry or recover the account.` };
  }
  return { tone: 'danger' as const, title: 'Action failed', body: message };
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

function titleForMode(mode: AuthMode, recoveryStep: RecoveryStep, t: ReturnType<typeof useLocalization>['t']) {
  if (mode === 'register') {
    return t('auth.visitorOnboarding');
  }
  if (mode === 'recovery') {
    return recoveryStep === 'done' ? 'Recovery complete' : t('auth.recovery');
  }
  return t('auth.secureSignIn');
}

function subtitleForMode(mode: AuthMode, recoveryStep: RecoveryStep, compact = false) {
  if (compact) {
    if (mode === 'register') {
      return 'Create a verified visitor account.';
    }
    if (mode === 'recovery') {
      return recoveryStep === 'done' ? 'Password reset complete.' : 'Verify and reset your password.';
    }
    return 'Choose a workspace and sign in.';
  }

  if (mode === 'register') {
    return 'Create a verified visitor account with clear steps and less mobile form friction.';
  }
  if (mode === 'recovery') {
    return recoveryStep === 'done'
      ? 'Your password has been reset and previous sessions were cleared.'
      : 'Verify your email code, then set a new password without exposing saved credentials.';
  }
  return 'Choose your workspace, authenticate, and optionally restore this session on future launches.';
}

function formatExpiry(expiresAt?: string | null) {
  if (!expiresAt) {
    return '';
  }
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return `Code expires at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`;
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
  containerLandscape: {
    justifyContent: 'flex-start',
  },
  frame: {
    width: '100%',
    alignSelf: 'center',
    gap: theme.spacing.xl,
  },
  frameWide: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  frameLandscape: {
    gap: theme.spacing.md,
  },
  authCardShell: {
    width: '100%',
    alignSelf: 'center',
  },
  authCardShellWide: {
    flex: 1,
    maxWidth: 520,
  },
  legalLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingTop: theme.spacing.md,
  },
  legalLinkText: {
    color: theme.colors.info,
    fontSize: 13,
    fontWeight: '800',
  },
  legalDivider: {
    color: theme.colors.textMuted,
    fontSize: 13,
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
  heroLandscape: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
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
  wordmarkLandscape: {
    height: 46,
    maxWidth: 220,
  },
  brandBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 7,
  },
  brandSubline: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 29,
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
  trustChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 8,
  },
  trustChipText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  modeRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  modeButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
  },
  modeButtonSelected: {
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.primarySoft,
  },
  modeButtonLabel: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  modeButtonLabelSelected: {
    color: theme.colors.textPrimary,
  },
  pressed: {
    opacity: 0.82,
  },
  audienceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  audienceChip: {
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 76,
    gap: theme.spacing.xs,
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
  audienceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
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
  authOptionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  authOptionsStacked: {
    alignItems: 'stretch',
    flexDirection: 'column',
  },
  rememberRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: 52,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.input,
  },
  checkboxSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  rememberCopy: {
    flex: 1,
    gap: 2,
  },
  rememberLabel: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  rememberHelp: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  linkButton: {
    minHeight: 44,
    justifyContent: 'center',
  },
  linkText: {
    color: theme.colors.info,
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryLink: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  secondaryLinkText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '800',
  },
  statusPanel: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
  },
  statusCopy: {
    flex: 1,
    gap: 3,
  },
  statusTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  statusBody: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  progressBlock: {
    gap: theme.spacing.sm,
  },
  progressTrack: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  progressItem: {
    flex: 1,
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  progressDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceMuted,
  },
  progressDotActive: {
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.primarySoft,
  },
  progressNumber: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  progressNumberActive: {
    color: theme.colors.textPrimary,
  },
  progressLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  progressLabelActive: {
    color: theme.colors.textPrimary,
  },
  progressBar: {
    height: 4,
    overflow: 'hidden',
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.surfaceMuted,
  },
  progressFill: {
    height: 4,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.primary,
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
  onboardingNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.primarySoft,
    padding: theme.spacing.md,
  },
  onboardingText: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  navigationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  navigationPrimary: {
    flex: 1,
  },
  recoverySteps: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  recoveryStepItem: {
    flex: 1,
    minHeight: 42,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
  },
  recoveryStepItemActive: {
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.primarySoft,
  },
  recoveryStepLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  recoveryStepLabelActive: {
    color: theme.colors.textPrimary,
  },
  recoveryDone: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
  },
  recoveryDoneTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.heading.fontSize,
    fontWeight: theme.typography.heading.fontWeight,
    textAlign: 'center',
  },
  recoveryDoneBody: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
    textAlign: 'center',
  },
});
