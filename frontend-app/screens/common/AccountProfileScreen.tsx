import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { apiConfig } from '../../api/apiConfig';
import { useAuth } from '../../auth/AuthProvider';
import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { DetailRow } from '../../components/employee/DetailRow';
import { PreferenceSwitchRow } from '../../components/employee/PreferenceSwitchRow';
import { StatusPill } from '../../components/feedback/StatusPill';
import { AppTextField } from '../../components/form/AppTextField';
import { InternationalPhoneInput } from '../../components/form/InternationalPhoneInput';
import { AppScreen } from '../../components/layout/AppScreen';
import {
  useAccountProfile,
  useUpdateAccountPasswordMutation,
  useUpdateAccountProfileMutation,
  useUploadAccountProfilePhotoMutation,
} from '../../hooks/useAccountProfile';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { useOperationalRuntime } from '../../runtime/OperationalRuntimeProvider';
import type { UploadAsset } from '../../services/accountService';
import { theme } from '../../theme';
import type { ActiveWorkspaceRole } from '../../types/auth';
import type { UserProfile } from '../../types/domain';
import { formatDateTime, formatShift } from '../../utils/employeeFormatting';

const LANGUAGE_OPTIONS = [
  { label: 'System', value: '' },
  { label: 'English', value: 'en' },
  { label: 'Hindi', value: 'hi' },
] as const;

type Props = {
  title?: string;
  subtitle?: string;
  roleSummary?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => Promise<unknown> | unknown;
};

type PendingPhoto = UploadAsset & {
  previewUri: string;
};

export function AccountProfileScreen({
  title = 'Profile',
  subtitle = 'Manage your identity, secure account settings, and role-scoped AccessFlow workspace.',
  roleSummary,
  refreshing,
  onRefresh,
}: Props) {
  const queryClient = useQueryClient();
  const layout = useResponsiveLayout();
  const { session, logout, isBusy, refreshSession } = useAuth();
  const runtime = useOperationalRuntime();
  const profile = useAccountProfile();
  const updateProfileMutation = useUpdateAccountProfileMutation();
  const updatePasswordMutation = useUpdateAccountPasswordMutation();
  const uploadPhotoMutation = useUploadAccountProfilePhotoMutation();

  const [username, setUsername] = useState('');
  const [phoneCountryCode, setPhoneCountryCode] = useState('+1');
  const [phone, setPhone] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState('');
  const [notificationEmailEnabled, setNotificationEmailEnabled] = useState(true);
  const [notificationInAppEnabled, setNotificationInAppEnabled] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhoto | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const identity = profile.data;
  const role = session?.user.activeRole ?? identity?.roles?.[0] ?? 'EMPLOYEE';
  const photoUri = pendingPhoto?.previewUri || identity?.employeePhotoUrl || session?.user.employeePhotoUrl || null;
  const status = identity?.accountStatus || session?.user.accountStatus || (identity?.active === false ? 'INACTIVE' : 'ACTIVE');
  const statusTone = status === 'ACTIVE' ? 'success' : status === 'UNVERIFIED' ? 'warning' : 'danger';
  const headerName = identity?.fullName || session?.user.fullName || roleLabel(role);

  const passwordValidation = useMemo(() => validatePassword(newPassword), [newPassword]);

  useEffect(() => {
    if (!identity) {
      return;
    }
    hydrateEditableFields(identity);
  }, [identity]);

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['account', 'profile'] }),
      queryClient.invalidateQueries({ queryKey: ['employee', 'profile'] }),
      queryClient.invalidateQueries({ queryKey: ['employee', 'badge'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    ]);
    await profile.refetch();
    await refreshSession();
    await Promise.resolve(onRefresh?.());
  };

  const saveProfile = async () => {
    const normalizedUsername = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,32}$/.test(normalizedUsername)) {
      Alert.alert('Check username', 'Use 3-32 lowercase letters, numbers, or underscores.');
      return;
    }

    try {
      await updateProfileMutation.mutateAsync({
        username: normalizedUsername,
        phoneCountryCode: phoneCountryCode.trim() || null,
        phone: phone.trim() || null,
        emergencyContact: emergencyContact.trim() || null,
        preferredLanguage: preferredLanguage || null,
        notificationEmailEnabled,
        notificationInAppEnabled,
      });
      await refreshAll();
      Alert.alert('Profile saved', 'Your personal account details were updated.');
    } catch (error) {
      Alert.alert('Profile update failed', error instanceof Error ? error.message : 'Your account profile could not be updated.');
    }
  };

  const choosePhoto = async (source: 'camera' | 'gallery') => {
    try {
      const asset = await pickProfilePhoto(source);
      if (!asset) {
        return;
      }
      setPendingPhoto({ ...asset, previewUri: asset.uri });
    } catch (error) {
      Alert.alert('Photo unavailable', error instanceof Error ? error.message : 'The photo picker could not be opened.');
    }
  };

  const applyPhoto = async () => {
    if (!pendingPhoto) {
      return;
    }

    try {
      const uploadedPhoto = await uploadPhotoMutation.mutateAsync(pendingPhoto);
      await updateProfileMutation.mutateAsync({ employeePhotoUrl: uploadedPhoto.url });
      setPendingPhoto(null);
      await refreshAll();
      Alert.alert('Photo updated', 'Your profile and credential photo were refreshed.');
    } catch (error) {
      Alert.alert('Photo update failed', error instanceof Error ? error.message : 'Your profile photo could not be updated.');
    }
  };

  const removePhoto = async () => {
    if (pendingPhoto) {
      setPendingPhoto(null);
      return;
    }

    Alert.alert('Remove profile photo?', 'This clears the user-managed profile photo while organization credentials remain controlled by AccessFlow.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await updateProfileMutation.mutateAsync({ employeePhotoUrl: '' });
              await refreshAll();
            } catch (error) {
              Alert.alert('Photo removal failed', error instanceof Error ? error.message : 'The photo could not be removed.');
            }
          })();
        },
      },
    ]);
  };

  const changePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Missing details', 'Enter the current password, a new password, and confirmation.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Confirm the new password exactly before saving.');
      return;
    }
    if (passwordValidation) {
      Alert.alert('Password is not strong enough', passwordValidation);
      return;
    }

    try {
      await updatePasswordMutation.mutateAsync({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Password updated', 'For security, AccessFlow will sign you out because active refresh tokens were revoked.', [
        {
          text: 'Continue',
          onPress: () => {
            void logout();
          },
        },
      ]);
    } catch (error) {
      Alert.alert('Password update failed', error instanceof Error ? error.message : 'The password could not be updated.');
    }
  };

  return (
    <AppScreen
      title={title}
      subtitle={subtitle}
      contentMaxWidth={layout.isLargeTablet ? 1180 : undefined}
      refreshing={Boolean(refreshing || profile.isRefetching)}
      onRefresh={refreshAll}
    >
      <SurfaceCard>
        <View style={[styles.identityHeader, layout.isTwoColumn ? styles.identityHeaderWide : null]}>
          <View style={styles.avatarWrap}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarFallbackLabel}>{initialsFor(headerName)}</Text>
              </View>
            )}
            <StatusPill label={statusLabel(status)} tone={statusTone} />
          </View>
          <View style={styles.identityCopy}>
            <View style={styles.nameBlock}>
              <Text maxFontSizeMultiplier={1.12} style={styles.nameText}>{headerName}</Text>
              <Text maxFontSizeMultiplier={1.1} style={styles.metaText}>@{identity?.username || session?.user.username || 'account'}</Text>
            </View>
            <View style={styles.pillRow}>
              <StatusPill label={roleLabel(role)} tone="info" />
              <StatusPill label={identity?.employeePhotoUrl ? 'Photo on file' : 'Photo pending'} tone={identity?.employeePhotoUrl ? 'success' : 'warning'} />
            </View>
            <Text style={styles.helperText}>{identity?.email || session?.user.email || 'Verified email pending'}</Text>
            <Text style={styles.helperText}>Last sync: {session?.lastSyncedAt ? formatDateTime(session.lastSyncedAt) : 'Unknown'}</Text>
          </View>
        </View>
      </SurfaceCard>

      <SurfaceCard title="Profile photo" subtitle="Capture or select a square profile photo. Preview it before applying it to your account and credential surfaces.">
        <View style={[styles.photoTools, layout.fieldStacked ? styles.photoToolsStacked : null]}>
          <IconAction icon="camera-outline" label="Camera" onPress={() => void choosePhoto('camera')} disabled={uploadPhotoMutation.isPending} />
          <IconAction icon="images-outline" label="Gallery" onPress={() => void choosePhoto('gallery')} disabled={uploadPhotoMutation.isPending} />
          <IconAction icon={pendingPhoto ? 'refresh-outline' : 'trash-outline'} label={pendingPhoto ? 'Retake' : 'Remove'} onPress={() => void removePhoto()} disabled={uploadPhotoMutation.isPending || (!photoUri && !pendingPhoto)} danger={!pendingPhoto} />
        </View>
        {pendingPhoto ? (
          <View style={styles.pendingPanel}>
            <Image source={{ uri: pendingPhoto.previewUri }} style={styles.pendingPhoto} />
            <View style={styles.pendingCopy}>
              <Text style={styles.panelTitle}>Preview ready</Text>
              <Text style={styles.helperText}>Review the crop before replacing the current account photo.</Text>
              <PrimaryButton label="Apply photo" onPress={() => void applyPhoto()} loading={uploadPhotoMutation.isPending || updateProfileMutation.isPending} />
            </View>
          </View>
        ) : null}
      </SurfaceCard>

      <SurfaceCard title="Editable account details" subtitle="These fields belong to you. Organization-controlled identity and access fields stay locked below.">
        <AppTextField
          label="Username"
          value={username}
          onChangeText={(value) => setUsername(value.toLowerCase())}
          placeholder="username"
          autoCapitalize="none"
          autoCorrect={false}
          helperText="Lowercase letters, numbers, and underscores only."
        />
        <InternationalPhoneInput
          countryCode={phoneCountryCode}
          phone={phone}
          onCountryCodeChange={setPhoneCountryCode}
          onPhoneChange={setPhone}
        />
        <AppTextField
          label="Emergency contact"
          value={emergencyContact}
          onChangeText={setEmergencyContact}
          placeholder="Emergency contact number or note"
        />
        <View style={styles.languageRow}>
          <Text style={styles.sectionLabel}>Preferred language</Text>
          <View style={styles.segmentRow}>
            {LANGUAGE_OPTIONS.map((option) => (
              <Pressable
                key={option.label}
                onPress={() => setPreferredLanguage(option.value)}
                style={[styles.segment, preferredLanguage === option.value ? styles.segmentActive : null]}
              >
                <Text style={[styles.segmentLabel, preferredLanguage === option.value ? styles.segmentLabelActive : null]}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <PreferenceSwitchRow
          label="In-app alerts"
          helperText="Receive account, approval, pass, and operational notifications inside AccessFlow."
          value={notificationInAppEnabled}
          onValueChange={setNotificationInAppEnabled}
        />
        <PreferenceSwitchRow
          label="Email alerts"
          helperText="Receive operational notifications by email when delivery is enabled for your organization."
          value={notificationEmailEnabled}
          onValueChange={setNotificationEmailEnabled}
        />
        <PrimaryButton label="Save account changes" onPress={() => void saveProfile()} loading={updateProfileMutation.isPending} />
      </SurfaceCard>

      <SurfaceCard title="Organization-managed identity" subtitle="These fields are read-only on mobile and remain controlled by authorized organization administrators.">
        <DetailRow label="Full name" value={identity?.fullName || session?.user.fullName || 'Provisioned account'} />
        <DetailRow label="Email" value={identity?.email || session?.user.email || 'Managed by organization'} />
        <DetailRow label="Organization" value={identity?.organizationName || identity?.organizationCode || session?.user.organizationName || session?.user.organizationCode || 'Platform scope'} />
        <DetailRow label="Role / workspace" value={roleLabel(role)} />
        <DetailRow label="Employee ID" value={identity?.employeeId || session?.user.employeeId || 'Not assigned'} muted={!identity?.employeeId && !session?.user.employeeId} />
        <DetailRow label="Department" value={identity?.department || session?.user.department || 'Not assigned'} muted={!identity?.department && !session?.user.department} />
        <DetailRow label="Designation" value={identity?.designation || session?.user.designation || 'Not assigned'} muted={!identity?.designation && !session?.user.designation} />
        <DetailRow label="Shift" value={formatShift(identity?.shiftName, identity?.shiftStartTime, identity?.shiftEndTime)} />
      </SurfaceCard>

      {roleSummary}

      <SurfaceCard title="Password and security" subtitle="Sensitive account updates are validated by the backend and refresh-token state is cleared after password changes.">
        <AppTextField
          label="Current password"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          placeholder="Current password"
          secureTextEntry
          autoCapitalize="none"
        />
        <AppTextField
          label="New password"
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="12+ chars with upper, lower, number, symbol"
          secureTextEntry
          autoCapitalize="none"
          errorText={newPassword && passwordValidation ? passwordValidation : undefined}
        />
        <AppTextField
          label="Confirm new password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Confirm new password"
          secureTextEntry
          autoCapitalize="none"
          errorText={confirmPassword && newPassword !== confirmPassword ? 'Passwords do not match.' : undefined}
        />
        <PreferenceSwitchRow
          label="Biometric unlock"
          helperText="Device biometric unlock is prepared for policy enablement and remains controlled by organization security."
          value={false}
          onValueChange={() => Alert.alert('Managed setting', 'Biometric unlock will become available when your organization enables the mobile policy.')}
        />
        <PrimaryButton label="Update password" onPress={() => void changePassword()} loading={updatePasswordMutation.isPending} />
      </SurfaceCard>

      <SurfaceCard>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Toggle app diagnostics"
          onPress={() => setAdvancedOpen((open) => !open)}
          style={styles.advancedHeader}
        >
          <View style={styles.advancedTitle}>
            <Ionicons name="construct-outline" size={20} color={theme.colors.info} />
            <Text style={styles.panelTitle}>App diagnostics</Text>
          </View>
          <Ionicons name={advancedOpen ? 'chevron-up-outline' : 'chevron-down-outline'} size={22} color={theme.colors.textSecondary} />
        </Pressable>
        {advancedOpen ? (
          <View style={styles.detailStack}>
            <DetailRow label="Environment" value={apiConfig.environment} />
            <DetailRow label="Distribution" value={apiConfig.distributionChannel} />
            <DetailRow label="API base" value={apiConfig.apiBaseUrl} />
            <DetailRow label="App version" value={apiConfig.appVersion} />
            <DetailRow label="Runtime version" value={apiConfig.runtimeVersion} />
            <DetailRow label="Build ID" value={apiConfig.buildId} />
            <DetailRow label="Push permission" value={runtime.pushPermissionStatus || 'Unknown'} />
            <DetailRow label="Runtime health" value={runtime.runtimeHealth} />
          </View>
        ) : null}
      </SurfaceCard>

      <View style={[styles.sessionActions, layout.isTwoColumn ? styles.sessionActionsWide : null]}>
        <PrimaryButton label="Log out" onPress={() => void logout()} tone="secondary" disabled={isBusy} />
      </View>
    </AppScreen>
  );

  function hydrateEditableFields(nextProfile: UserProfile) {
    setUsername(nextProfile.username || session?.user.username || '');
    setPhoneCountryCode(nextProfile.phoneCountryCode || '+1');
    setPhone(nextProfile.phone || '');
    setEmergencyContact(nextProfile.emergencyContact || '');
    setPreferredLanguage(nextProfile.preferredLanguage || '');
    setNotificationEmailEnabled(nextProfile.notificationEmailEnabled ?? true);
    setNotificationInAppEnabled(nextProfile.notificationInAppEnabled ?? true);
  }
}

function IconAction({
  icon,
  label,
  onPress,
  disabled,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconAction,
        danger ? styles.iconActionDanger : null,
        disabled ? styles.iconActionDisabled : pressed ? styles.iconActionPressed : null,
      ]}
    >
      <Ionicons name={icon} size={22} color={danger ? theme.colors.danger : theme.colors.textPrimary} />
      <Text style={[styles.iconActionLabel, danger ? styles.iconActionLabelDanger : null]}>{label}</Text>
    </Pressable>
  );
}

async function pickProfilePhoto(source: 'camera' | 'gallery') {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Camera permission is required to capture a profile photo.');
    }
  } else {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Gallery permission is required to choose a profile photo.');
    }
  }

  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.72,
      })
    : await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.72,
      });

  if (result.canceled || !result.assets.length) {
    return null;
  }

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.fileName || `account-photo-${Date.now()}.jpg`,
    type: asset.mimeType || 'image/jpeg',
  };
}

function validatePassword(value: string) {
  if (!value) {
    return null;
  }
  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,128}$/.test(value)) {
    return 'Use 12-128 characters with uppercase, lowercase, number, and symbol.';
  }
  return null;
}

function initialsFor(fullName: string) {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'AF';
}

function roleLabel(role: ActiveWorkspaceRole | string) {
  const labels: Record<string, string> = {
    ADMIN: 'Admin workspace',
    EMPLOYEE: 'Employee workspace',
    SECURITY_GUARD: 'Security workspace',
    VISITOR: 'Visitor workspace',
  };
  return labels[String(role)] || String(role).replaceAll('_', ' ');
}

function statusLabel(status?: string | null) {
  return String(status || 'ACTIVE').replaceAll('_', ' ');
}

const styles = StyleSheet.create({
  identityHeader: {
    gap: theme.spacing.md,
  },
  identityHeaderWide: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrap: {
    gap: theme.spacing.sm,
    alignItems: 'flex-start',
  },
  avatar: {
    width: 112,
    height: 112,
    borderRadius: 28,
    backgroundColor: theme.colors.surfaceMuted,
  },
  avatarFallback: {
    width: 112,
    height: 112,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.primarySoft,
  },
  avatarFallbackLabel: {
    color: theme.colors.textPrimary,
    fontSize: 32,
    fontWeight: '800',
  },
  identityCopy: {
    flex: 1,
    gap: theme.spacing.sm,
  },
  nameBlock: {
    gap: 2,
  },
  nameText: {
    color: theme.colors.textPrimary,
    fontSize: 26,
    fontWeight: '800',
  },
  metaText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    fontWeight: theme.typography.body.fontWeight,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  helperText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
  photoTools: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  photoToolsStacked: {
    flexDirection: 'column',
  },
  iconAction: {
    minHeight: 52,
    flex: 1,
    minWidth: 112,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
    paddingHorizontal: theme.spacing.md,
  },
  iconActionDanger: {
    borderColor: theme.colors.dangerSoft,
    backgroundColor: theme.colors.surfaceMuted,
  },
  iconActionPressed: {
    backgroundColor: theme.colors.primarySoft,
  },
  iconActionDisabled: {
    opacity: 0.45,
  },
  iconActionLabel: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  iconActionLabelDanger: {
    color: theme.colors.danger,
  },
  pendingPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.primarySoft,
    padding: theme.spacing.md,
  },
  pendingPhoto: {
    width: 92,
    height: 92,
    borderRadius: 24,
    backgroundColor: theme.colors.surfaceMuted,
  },
  pendingCopy: {
    flex: 1,
    gap: theme.spacing.sm,
  },
  panelTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  languageRow: {
    gap: theme.spacing.sm,
  },
  sectionLabel: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  segment: {
    minHeight: 44,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.primarySoft,
  },
  segmentLabel: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  segmentLabelActive: {
    color: theme.colors.textPrimary,
  },
  advancedHeader: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  advancedTitle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  detailStack: {
    gap: theme.spacing.sm,
  },
  sessionActions: {
    gap: theme.spacing.sm,
  },
  sessionActionsWide: {
    flexDirection: 'row',
  },
});
