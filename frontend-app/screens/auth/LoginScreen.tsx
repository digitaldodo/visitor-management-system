import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';

import { useAuth } from '../../auth/AuthProvider';
import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { AppTextField } from '../../components/form/AppTextField';
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
        <View style={styles.container}>
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>AccessFlow Mobile</Text>
            <Text style={styles.title}>Operational access on Android-first field devices</Text>
            <Text style={styles.subtitle}>
              This mobile client keeps backend policy, JWT rules, and role authorization server-side. Sign in to the
              workspace you operate from most often.
            </Text>
          </View>

          <SurfaceCard title="Secure sign-in" subtitle="Choose the operational workspace, then authenticate against the live AccessFlow backend.">
            <View style={styles.audienceRow}>
              {audienceOptions.map((option) => {
                const selected = selectedAudience === option.value;
                return (
                  <Pressable
                    key={option.value}
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
    flex: 1,
    justifyContent: 'center',
    gap: theme.spacing.xl,
    padding: theme.spacing.lg,
  },
  hero: {
    gap: theme.spacing.sm,
  },
  eyebrow: {
    color: theme.colors.primary,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 32,
    fontWeight: '800',
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
  audienceRow: {
    gap: theme.spacing.sm,
  },
  audienceChip: {
    gap: 4,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceMuted,
  },
  audienceChipSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  audienceLabel: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  audienceLabelSelected: {
    color: theme.colors.primary,
  },
  audienceDescription: {
    color: theme.colors.textSecondary,
    fontSize: 13,
  },
  audienceDescriptionSelected: {
    color: theme.colors.primary,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 14,
  },
});
