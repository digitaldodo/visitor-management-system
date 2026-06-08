import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '../../auth/AuthProvider';
import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { DetailRow } from '../../components/employee/DetailRow';
import { PreferenceSwitchRow } from '../../components/employee/PreferenceSwitchRow';
import { StatusPill } from '../../components/feedback/StatusPill';
import { AppTextField } from '../../components/form/AppTextField';
import { InternationalPhoneInput } from '../../components/form/InternationalPhoneInput';
import { LegalDocument, type LegalDocumentType } from '../../components/legal/LegalDocument';
import { AppScreen } from '../../components/layout/AppScreen';
import {
  useAccountProfile,
  useUpdateAccountPasswordMutation,
  useUpdateAccountProfileMutation,
  useUploadAccountProfilePhotoMutation,
} from '../../hooks/useAccountProfile';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { useLocalization } from '../../localization/LocalizationProvider';
import { showPermissionEducation } from '../../permissions/permissionEducation';
import { useOperationalRuntime } from '../../runtime/OperationalRuntimeProvider';
import type { UploadAsset } from '../../services/accountService';
import { theme } from '../../theme';
import type { ActiveWorkspaceRole } from '../../types/auth';
import type { UserProfile } from '../../types/domain';
import { enterpriseStatusLabel } from '../../types/workflow';
import { formatShift } from '../../utils/employeeFormatting';

const LANGUAGE_OPTIONS = [
  { labelKey: 'common.english', value: 'en' },
  { labelKey: 'common.hindi', value: 'hi' },
] as const;

type Props = {
  title?: string;
  subtitle?: string;
  roleSummary?: ReactNode;
  visitorSummary?: {
    passStatus?: string;
    nextVisit?: string | null;
    timezone?: string;
  };
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
  visitorSummary,
  refreshing,
  onRefresh,
}: Props) {
  const queryClient = useQueryClient();
  const layout = useResponsiveLayout();
  const { language, setLanguagePreference, t, tText } = useLocalization();
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
  const [preferredLanguage, setPreferredLanguage] = useState<'en' | 'hi'>('en');
  const [notificationEmailEnabled, setNotificationEmailEnabled] = useState(true);
  const [notificationInAppEnabled, setNotificationInAppEnabled] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhoto | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [legalOpen, setLegalOpen] = useState<LegalDocumentType | null>(null);
  const [securityCenterOpen, setSecurityCenterOpen] = useState(true);

  const identity = profile.data;
  const role = session?.user.activeRole ?? identity?.roles?.[0] ?? 'EMPLOYEE';
  const photoUri = pendingPhoto?.previewUri || identity?.employeePhotoUrl || session?.user.employeePhotoUrl || null;
  const status = identity?.accountStatus || session?.user.accountStatus || (identity?.active === false ? 'INACTIVE' : 'ACTIVE');
  const statusTone = status === 'ACTIVE' ? 'success' : status === 'UNVERIFIED' ? 'warning' : 'danger';
  const headerName = identity?.fullName || session?.user.fullName || roleLabel(role);
  const headerInitials = initialsFor(headerName);
  const isVisitorProfile = String(role) === 'VISITOR';

  const passwordValidation = useMemo(() => validatePassword(newPassword), [newPassword]);

  useEffect(() => {
    if (!identity) {
      return;
    }
    hydrateEditableFields(identity);
  }, [identity]);

  useEffect(() => {
    setPreferredLanguage(language === 'hi' ? 'hi' : 'en');
  }, [language]);

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
      Alert.alert(tText('Check username'), tText('Use 3-32 lowercase letters, numbers, or underscores.'));
      return;
    }

    try {
      await updateProfileMutation.mutateAsync({
        username: normalizedUsername,
        phoneCountryCode: phoneCountryCode.trim() || null,
        phone: phone.trim() || null,
        emergencyContact: emergencyContact.trim() || null,
        preferredLanguage,
        notificationEmailEnabled,
        notificationInAppEnabled,
      });
      await setLanguagePreference(preferredLanguage);
      await refreshAll();
      Alert.alert(tText('Profile updated'), tText('Your account profile was updated.'));
    } catch (error) {
      Alert.alert(tText('Profile update failed'), error instanceof Error ? error.message : tText('Your account profile could not be updated.'));
    }
  };

  const choosePhoto = async (source: 'camera' | 'gallery') => {
    try {
      const asset = await pickProfilePhoto(source);
      if (!asset) {
        return;
      }
      setPhotoError(null);
      setPendingPhoto({ ...asset, previewUri: asset.uri });
    } catch (error) {
      const message = error instanceof Error ? error.message : tText('The photo picker could not be opened. Check permission settings and try again.');
      setPhotoError(message);
      Alert.alert(tText('Photo unavailable'), message);
    }
  };

  const applyPhoto = async () => {
    if (!pendingPhoto) {
      return;
    }

    try {
      const uploadedPhoto = await uploadPhotoMutation.mutateAsync(pendingPhoto);
      await updateProfileMutation.mutateAsync({ employeePhotoUrl: uploadedPhoto.url });
      setPhotoError(null);
      setPendingPhoto(null);
      await refreshAll();
      Alert.alert(tText('Photo updated'), tText('Your profile and credential photo were updated.'));
    } catch (error) {
      const message = error instanceof Error ? error.message : tText('Your profile photo could not be updated.');
      setPhotoError(message);
      Alert.alert(tText('Photo update failed'), message);
    }
  };

  const removePhoto = async () => {
    if (pendingPhoto) {
      setPendingPhoto(null);
      setPhotoError(null);
      return;
    }

    Alert.alert(tText('Remove profile photo?'), tText('This clears the user-managed profile photo while organization credentials remain controlled by AccessFlow.'), [
      { text: tText('Cancel'), style: 'cancel' },
      {
        text: tText('Remove'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await updateProfileMutation.mutateAsync({ employeePhotoUrl: '' });
              await refreshAll();
            } catch (error) {
              Alert.alert(tText('Photo removal failed'), error instanceof Error ? error.message : tText('The photo could not be removed.'));
            }
          })();
        },
      },
    ]);
  };

  const changePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert(tText('Missing details'), tText('Enter the current password, a new password, and confirmation.'));
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert(tText('Passwords do not match'), tText('Confirm the new password exactly before saving.'));
      return;
    }
    if (passwordValidation) {
      Alert.alert(tText('Password is not strong enough'), tText(passwordValidation));
      return;
    }

    try {
      await updatePasswordMutation.mutateAsync({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert(tText('Password updated'), tText('For security, AccessFlow will sign you out because active sessions were cleared.'), [
        {
          text: tText('Continue'),
          onPress: () => {
            void logout();
          },
        },
      ]);
    } catch (error) {
      Alert.alert(tText('Password update failed'), error instanceof Error ? error.message : tText('The password could not be updated.'));
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
                <Text
                  adjustsFontSizeToFit
                  allowFontScaling={false}
                  minimumFontScale={0.62}
                  numberOfLines={1}
                  style={[styles.avatarFallbackLabel, headerInitials.length >= 3 ? styles.avatarFallbackLabelCompact : null]}
                >
                  {headerInitials}
                </Text>
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
          </View>
        </View>
      </SurfaceCard>

      <SurfaceCard title="Profile photo" subtitle="Capture or select a square profile photo. Preview it before applying it to your account and credential surfaces.">
        <View style={[styles.photoUploadCard, photoError ? styles.photoUploadCardError : null, pendingPhoto ? styles.photoUploadCardReady : null]}>
          <View style={styles.photoUploadPreview}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photoUploadImage} />
            ) : (
              <Ionicons name="cloud-upload-outline" size={30} color={theme.colors.info} />
            )}
          </View>
          <View style={styles.photoUploadCopy}>
            <Text style={styles.panelTitle}>{pendingPhoto ? tText('Preview ready') : tText('Upload profile photo')}</Text>
            <Text style={styles.helperText}>
              {photoError
                ? photoError
                : pendingPhoto
                  ? tText('Review the image, then apply it to your profile.')
                  : tText('Tap to use camera or gallery. PNG, JPG up to 5MB.')}
            </Text>
          </View>
          <View style={[styles.photoTools, layout.fieldStacked ? styles.photoToolsStacked : null]}>
            <IconAction icon="camera-outline" label="Camera" onPress={() => void choosePhoto('camera')} disabled={uploadPhotoMutation.isPending} />
            <IconAction icon="images-outline" label="Gallery" onPress={() => void choosePhoto('gallery')} disabled={uploadPhotoMutation.isPending} />
            <IconAction icon={pendingPhoto ? 'refresh-outline' : 'trash-outline'} label={pendingPhoto ? 'Clear' : 'Remove'} onPress={() => void removePhoto()} disabled={uploadPhotoMutation.isPending || (!photoUri && !pendingPhoto)} danger={!pendingPhoto} />
          </View>
          {pendingPhoto ? (
            <View style={styles.photoApplyRow}>
              <PrimaryButton label={photoError ? 'Retry upload' : 'Apply photo'} onPress={() => void applyPhoto()} loading={uploadPhotoMutation.isPending || updateProfileMutation.isPending} />
            </View>
          ) : null}
        </View>
        {pendingPhoto ? (
          <View style={styles.pendingPanel}>
            <Image source={{ uri: pendingPhoto.previewUri }} style={styles.pendingPhoto} />
            <View style={styles.pendingCopy}>
              <Text style={styles.panelTitle}>{photoError ? tText('Ready to retry') : tText('Preview preserved')}</Text>
              <Text style={styles.helperText}>{photoError ? tText('Your selected image is still available.') : tText('This image is queued for your account photo.')}</Text>
            </View>
          </View>
        ) : null}
      </SurfaceCard>

      <SurfaceCard title="Language" subtitle={t('settings.languageSubtitle')}>
        <View style={styles.segmentRow}>
          {LANGUAGE_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityLabel={t(option.labelKey)}
              onPress={() => {
                setPreferredLanguage(option.value);
                void setLanguagePreference(option.value);
              }}
              style={[styles.segment, preferredLanguage === option.value ? styles.segmentActive : null]}
            >
              <Text style={[styles.segmentLabel, preferredLanguage === option.value ? styles.segmentLabelActive : null]}>{t(option.labelKey)}</Text>
            </Pressable>
          ))}
        </View>
      </SurfaceCard>

      <SurfaceCard title="Editable account details" subtitle={isVisitorProfile ? 'These fields belong to you. Visit access details stay read-only below.' : 'These fields belong to you. Organization-controlled identity and access fields stay locked below.'}>
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
        {runtime.pushPermissionStatus === 'DENIED' || runtime.pushPermissionStatus === 'PERMANENTLY_DENIED' ? (
          <PrimaryButton
            label={runtime.pushPermissionStatus === 'PERMANENTLY_DENIED' ? 'Open Android notification settings' : 'Enable notifications'}
            tone="secondary"
            onPress={() => {
              if (runtime.pushPermissionStatus === 'PERMANENTLY_DENIED') {
                void Linking.openSettings();
                return;
              }
              void runtime.requestPushRegistration({ forcePrompt: true });
            }}
          />
        ) : null}
        <PrimaryButton label="Save account changes" onPress={() => void saveProfile()} loading={updateProfileMutation.isPending} />
      </SurfaceCard>

      {isVisitorProfile ? (
        <SurfaceCard title="Visitor profile summary" subtitle="Visitor account">
          <DetailRow label="Visitor" value={identity?.fullName || session?.user.fullName || 'Visitor account'} />
          <DetailRow label="Pass status" value={visitorSummary?.passStatus || 'No active pass'} />
          {visitorSummary?.nextVisit ? <DetailRow label="Next visit" value={visitorSummary.nextVisit} /> : null}
          <DetailRow label="Timezone" value={visitorSummary?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone} />
        </SurfaceCard>
      ) : (
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
      )}

      {roleSummary}

      <SurfaceCard title="Password and security" subtitle="Sensitive account updates are verified by AccessFlow and active sessions are cleared after password changes.">
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
        <PrimaryButton label="Update password" onPress={() => void changePassword()} loading={updatePasswordMutation.isPending} />
      </SurfaceCard>

      <SurfaceCard>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Toggle security center"
          onPress={() => setSecurityCenterOpen((open) => !open)}
          style={styles.advancedHeader}
        >
          <View style={styles.advancedTitle}>
            <Ionicons name="shield-checkmark-outline" size={20} color={theme.colors.info} />
            <Text style={styles.panelTitle}>{tText('Security center')}</Text>
          </View>
          <Ionicons name={securityCenterOpen ? 'chevron-up-outline' : 'chevron-down-outline'} size={22} color={theme.colors.textSecondary} />
        </Pressable>
        {securityCenterOpen ? (
          <View style={styles.securityCenter}>
            <View style={styles.securityGrid}>
              <SecurityStatusTile label="Session" value={runtime.runtimeHealth === 'healthy' ? 'Active' : 'Review needed'} tone={runtime.runtimeHealth === 'healthy' ? 'success' : 'warning'} />
              <SecurityStatusTile label="Protection" value="Encrypted access" tone="info" />
              <SecurityStatusTile label="Updates" value="Automatic" tone="info" />
              <SecurityStatusTile label="Notifications" value={runtime.pushToken ? 'Enabled' : notificationStatusLabel(runtime.pushPermissionStatus)} tone="info" />
            </View>
            <View style={styles.securityActions}>
              <PrimaryButton label="Secure account" tone="secondary" onPress={() => void refreshSession()} loading={isBusy} />
              <PrimaryButton label="Log out" tone="danger" onPress={() => void logout()} disabled={isBusy} />
            </View>
          </View>
        ) : null}
      </SurfaceCard>

      <SurfaceCard title="Legal and compliance" subtitle="Review the mobile policy experience from settings at any time.">
        <View style={[styles.legalActionRow, layout.fieldStacked ? styles.legalActionRowStacked : null]}>
          <PrimaryButton
            label="Privacy Policy"
            tone={legalOpen === 'privacy' ? 'primary' : 'secondary'}
            onPress={() => setLegalOpen((current) => (current === 'privacy' ? null : 'privacy'))}
          />
          <PrimaryButton
            label="Terms & Conditions"
            tone={legalOpen === 'terms' ? 'primary' : 'secondary'}
            onPress={() => setLegalOpen((current) => (current === 'terms' ? null : 'terms'))}
          />
        </View>
        {legalOpen ? <LegalDocument type={legalOpen} embedded /> : null}
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
    setPreferredLanguage(language === 'hi' ? 'hi' : 'en');
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
  const { tText } = useLocalization();
  const translatedLabel = tText(label);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={translatedLabel}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconAction,
        danger ? styles.iconActionDanger : null,
        disabled ? styles.iconActionDisabled : pressed ? styles.iconActionPressed : null,
      ]}
    >
      <Ionicons name={icon} size={22} color={danger ? theme.colors.danger : theme.colors.textPrimary} />
      <Text style={[styles.iconActionLabel, danger ? styles.iconActionLabelDanger : null]}>{translatedLabel}</Text>
    </Pressable>
  );
}

function SecurityStatusTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'success' | 'warning' | 'info' | 'default';
}) {
  const { tText } = useLocalization();
  const color = tone === 'success'
    ? theme.colors.success
    : tone === 'warning'
      ? theme.colors.warning
      : tone === 'info'
        ? theme.colors.info
        : theme.colors.textPrimary;

  return (
    <View style={styles.securityTile}>
      <Text style={styles.securityTileLabel}>{tText(label)}</Text>
      <Text style={[styles.securityTileValue, { color }]}>{tText(value)}</Text>
    </View>
  );
}

async function pickProfilePhoto(source: 'camera' | 'gallery') {
  if (source === 'camera') {
    const accepted = await showPermissionEducation('camera');
    if (!accepted) {
      return null;
    }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Camera permission is required to capture a profile photo.');
    }
  } else {
    const accepted = await showPermissionEducation('files');
    if (!accepted) {
      return null;
    }
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
  if (typeof asset.fileSize === 'number' && asset.fileSize > 5 * 1024 * 1024) {
    throw new Error('Choose a PNG or JPG image up to 5MB.');
  }
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
    .slice(0, 3)
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
  return enterpriseStatusLabel(status || 'ACTIVE', 'workforce');
}

function notificationStatusLabel(status?: string | null) {
  if (status === 'GRANTED') {
    return 'Enabled';
  }
  if (status === 'DENIED' || status === 'PERMANENTLY_DENIED') {
    return 'Action needed';
  }
  return 'Available';
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
    borderRadius: 56,
    backgroundColor: theme.colors.surfaceMuted,
    overflow: 'hidden',
  },
  avatarFallback: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: theme.spacing.sm,
  },
  avatarFallbackLabel: {
    color: theme.colors.textPrimary,
    fontSize: 32,
    fontWeight: '800',
    includeFontPadding: false,
    textAlign: 'center',
  },
  avatarFallbackLabelCompact: {
    fontSize: 28,
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
  photoUploadCard: {
    gap: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.md,
  },
  photoUploadCardReady: {
    backgroundColor: theme.colors.primarySoft,
  },
  photoUploadCardError: {
    borderColor: theme.colors.danger,
  },
  photoUploadPreview: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.infoSoft,
  },
  photoUploadImage: {
    width: '100%',
    height: '100%',
  },
  photoUploadCopy: {
    gap: theme.spacing.xs,
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
  photoApplyRow: {
    gap: theme.spacing.sm,
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
  securityCenter: {
    gap: theme.spacing.md,
  },
  securityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  securityTile: {
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 70,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    justifyContent: 'center',
    gap: 4,
    padding: theme.spacing.md,
  },
  securityTileLabel: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  securityTileValue: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  securityActions: {
    gap: theme.spacing.sm,
  },
  deviceList: {
    gap: theme.spacing.sm,
  },
  deviceItem: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.md,
  },
  deviceIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.infoSoft,
  },
  deviceCopy: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  deviceTitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  deviceTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  deviceActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  devicePolicyPanel: {
    gap: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
    padding: theme.spacing.sm,
  },
  legalActionRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  legalActionRowStacked: {
    flexDirection: 'column',
  },
  sessionActions: {
    gap: theme.spacing.sm,
  },
  sessionActionsWide: {
    flexDirection: 'row',
  },
});
