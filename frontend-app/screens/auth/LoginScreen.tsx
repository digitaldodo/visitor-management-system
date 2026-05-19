import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';

import { useAuth } from '../../auth/AuthProvider';
import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { AppTextField } from '../../components/form/AppTextField';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { theme } from '../../theme';
import type { LoginPayload, WorkspaceAudience } from '../../types/auth';

const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Username or email is required.'),
  password: z.string().min(8, 'Enter your password.'),
  companyCode: z.string().trim().optional(),
  audience: z.enum(['security', 'employee', 'admin']),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const audienceOptions: Array<{ value: WorkspaceAudience; label: string; description: string }> = [
  { value: 'security', label: 'Security', description: 'Checkpoint, scan, and live access operations' },
  { value: 'employee', label: 'Employee', description: 'Badge, approvals, and presence workflows' },
  { value: 'admin', label: 'Admin', description: 'Admin and super-admin operational access' },
];

export function LoginScreen() {
  const { login, isBusy, lastError } = useAuth();
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const [submitError, setSubmitError] = useState<string | null>(lastError);

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
      audience: 'security',
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView
          alwaysBounceVertical={false}
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.container,
            {
              minHeight: layout.height - insets.top - insets.bottom,
              paddingHorizontal: layout.contentPadding,
              paddingTop: layout.isCompactHeight ? theme.spacing.md : theme.spacing.xl,
              paddingBottom: insets.bottom + theme.spacing.xl,
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
                Native access control for operational teams
              </Text>
              <Text maxFontSizeMultiplier={1.08} style={styles.subtitle}>
                Sign in to scan badges, approve access, and operate your assigned workspace from a phone, tablet, or guard device.
              </Text>
              <View style={styles.proofRow}>
                <Text style={styles.proofChip}>Guard ready</Text>
                <Text style={styles.proofChip}>Employee badge</Text>
                <Text style={styles.proofChip}>Dark ops</Text>
              </View>
            </View>

            <SurfaceCard
              title="Secure sign-in"
              subtitle="Choose the operational workspace, then authenticate against the live AccessFlow backend."
            >
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
                    helperText="Required for organization-scoped security, employee, and most admin accounts."
                    onChangeText={onChange}
                    value={value}
                    errorText={errors.companyCode?.message}
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
                  />
                )}
              />

              {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

              <PrimaryButton label="Continue to workspace" onPress={() => void onSubmit()} loading={isBusy} />
            </SurfaceCard>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
});
