import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { apiConfig } from '../../api/apiConfig';
import {
  authenticateDeviceUnlock,
  bindTrustedDeviceLocally,
  clearLocalDeviceTrustProfile,
  collectDeviceIntegritySignals,
  getCurrentDeviceDescriptor,
  readLocalDeviceTrustProfile,
  writeLocalDeviceTrustProfile,
  type LocalDeviceTrustProfile,
} from '../../auth/deviceTrust';
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
import { getObservabilitySnapshot } from '../../runtime/observability';
import type { UploadAsset } from '../../services/accountService';
import {
  listTrustedDevices,
  logoutTrustedDevice,
  registerTrustedDevice,
  revokeTrustedDevice,
  updateTrustedDevice,
} from '../../services/operationalService';
import { theme } from '../../theme';
import type { ActiveWorkspaceRole } from '../../types/auth';
import type { UserProfile } from '../../types/domain';
import type { TrustedDeviceCategory, TrustedDeviceRecord, TrustedOperationalRole } from '../../types/runtime';
import { formatDateTime, formatShift } from '../../utils/employeeFormatting';

const LANGUAGE_OPTIONS = [
  { labelKey: 'common.system', value: '' },
  { labelKey: 'common.english', value: 'en' },
  { labelKey: 'common.hindi', value: 'hi' },
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
  const { preference, setLanguagePreference, t } = useLocalization();
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
  const [legalOpen, setLegalOpen] = useState<LegalDocumentType | null>(null);
  const [securityCenterOpen, setSecurityCenterOpen] = useState(true);
  const [trustedDevices, setTrustedDevices] = useState<TrustedDeviceRecord[]>([]);
  const [devicePolicyDrafts, setDevicePolicyDrafts] = useState<Record<string, { deviceName: string; checkpointName: string; operationalZone: string }>>({});
  const [localTrustProfile, setLocalTrustProfile] = useState<LocalDeviceTrustProfile | null>(null);
  const [securityCenterBusy, setSecurityCenterBusy] = useState(false);
  const [observabilitySnapshot, setObservabilitySnapshot] = useState<Awaited<ReturnType<typeof getObservabilitySnapshot>> | null>(null);

  const identity = profile.data;
  const role = session?.user.activeRole ?? identity?.roles?.[0] ?? 'EMPLOYEE';
  const photoUri = pendingPhoto?.previewUri || identity?.employeePhotoUrl || session?.user.employeePhotoUrl || null;
  const status = identity?.accountStatus || session?.user.accountStatus || (identity?.active === false ? 'INACTIVE' : 'ACTIVE');
  const statusTone = status === 'ACTIVE' ? 'success' : status === 'UNVERIFIED' ? 'warning' : 'danger';
  const headerName = identity?.fullName || session?.user.fullName || roleLabel(role);
  const canManageTrustedDevices = Boolean(session?.user.roles?.some((nextRole) => nextRole === 'ADMIN' || nextRole === 'SUPER_ADMIN'));

  const passwordValidation = useMemo(() => validatePassword(newPassword), [newPassword]);

  useEffect(() => {
    if (!identity) {
      return;
    }
    hydrateEditableFields(identity);
  }, [identity]);

  useEffect(() => {
    if (!identity?.preferredLanguage || preference) {
      return;
    }
    if (identity.preferredLanguage === 'en' || identity.preferredLanguage === 'hi') {
      void setLanguagePreference(identity.preferredLanguage);
    }
  }, [identity?.preferredLanguage, preference, setLanguagePreference]);

  const loadSecurityCenter = useCallback(async () => {
    if (!session) {
      return;
    }

    try {
      const [profile, descriptor] = await Promise.all([
        readLocalDeviceTrustProfile(),
        getCurrentDeviceDescriptor(),
      ]);
      setLocalTrustProfile(profile);
      const response = await listTrustedDevices(descriptor.deviceId);
      setTrustedDevices(response.devices);
    } catch {
      setTrustedDevices([]);
    }
  }, [session]);

  useEffect(() => {
    void loadSecurityCenter();
  }, [loadSecurityCenter]);

  useEffect(() => {
    setDevicePolicyDrafts((current) => {
      const nextDrafts = { ...current };
      trustedDevices.forEach((device) => {
        if (!nextDrafts[device.id]) {
          nextDrafts[device.id] = {
            deviceName: device.deviceName || '',
            checkpointName: device.checkpointName || '',
            operationalZone: device.operationalZone || '',
          };
        }
      });
      return nextDrafts;
    });
  }, [trustedDevices]);

  useEffect(() => {
    if (!advancedOpen) {
      return;
    }
    void getObservabilitySnapshot().then(setObservabilitySnapshot).catch(() => setObservabilitySnapshot(null));
  }, [advancedOpen, runtime.runtimeHealth, runtime.syncConnection.status, runtime.offlineOperationalQueueSize]);

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['account', 'profile'] }),
      queryClient.invalidateQueries({ queryKey: ['employee', 'profile'] }),
      queryClient.invalidateQueries({ queryKey: ['employee', 'badge'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    ]);
    await profile.refetch();
    await refreshSession();
    await loadSecurityCenter();
    await Promise.resolve(onRefresh?.());
  };

  const setBiometricUnlock = async (enabled: boolean) => {
    if (!session) {
      return;
    }

    setSecurityCenterBusy(true);
    try {
      const currentProfile = localTrustProfile ?? await bindTrustedDeviceLocally(session, false);
      if (enabled) {
        const unlock = await authenticateDeviceUnlock('enable');
        if (!unlock.success) {
          Alert.alert('Biometric unlock unavailable', 'Enroll fingerprint, face unlock, or device PIN before enabling secure workspace unlock.');
          return;
        }
      }

      const nextProfile = {
        ...currentProfile,
        biometricEnabled: enabled,
        trusted: true,
      };
      await writeLocalDeviceTrustProfile(nextProfile);

      const [descriptor, integritySignals] = await Promise.all([
        getCurrentDeviceDescriptor(),
        collectDeviceIntegritySignals(),
      ]);
      await registerTrustedDevice({
        ...descriptor,
        biometricEnabled: enabled,
        integritySignals,
      });
      await loadSecurityCenter();
      Alert.alert('Security updated', enabled ? 'Biometric unlock is enabled for this trusted device.' : 'Biometric unlock was disabled for this device.');
    } catch (error) {
      Alert.alert('Security update failed', error instanceof Error ? error.message : 'AccessFlow could not update trusted-device settings.');
    } finally {
      setSecurityCenterBusy(false);
    }
  };

  const revokeDeviceAccess = (device: TrustedDeviceRecord) => {
    Alert.alert(
      device.currentDevice ? 'Revoke this device?' : 'Revoke trusted device?',
      device.currentDevice
        ? 'This clears the local trusted session and you will need to sign in again.'
        : 'This device will be blocked from restoring its AccessFlow session.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setSecurityCenterBusy(true);
              try {
                await revokeTrustedDevice(device.id);
                if (device.currentDevice) {
                  await clearLocalDeviceTrustProfile();
                  await logout();
                  return;
                }
                await loadSecurityCenter();
              } catch (error) {
                Alert.alert('Revocation failed', error instanceof Error ? error.message : 'The device could not be revoked.');
              } finally {
                setSecurityCenterBusy(false);
              }
            })();
          },
        },
      ],
    );
  };

  const logoutDeviceAccess = (device: TrustedDeviceRecord) => {
    Alert.alert('Log out device?', 'This invalidates the selected trusted-device session record.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setSecurityCenterBusy(true);
            try {
              await logoutTrustedDevice(device.id);
              if (device.currentDevice) {
                await clearLocalDeviceTrustProfile();
                await logout();
                return;
              }
              await loadSecurityCenter();
            } catch (error) {
              Alert.alert('Logout failed', error instanceof Error ? error.message : 'The device could not be logged out.');
            } finally {
              setSecurityCenterBusy(false);
            }
          })();
        },
      },
    ]);
  };

  const updateDeviceDraft = (deviceId: string, key: 'deviceName' | 'checkpointName' | 'operationalZone', value: string) => {
    setDevicePolicyDrafts((current) => ({
      ...current,
      [deviceId]: {
        deviceName: current[deviceId]?.deviceName ?? '',
        checkpointName: current[deviceId]?.checkpointName ?? '',
        operationalZone: current[deviceId]?.operationalZone ?? '',
        [key]: value,
      },
    }));
  };

  const saveDeviceOperationalPolicy = async (device: TrustedDeviceRecord, category: TrustedDeviceCategory) => {
    const draft = devicePolicyDrafts[device.id] ?? { deviceName: '', checkpointName: '', operationalZone: '' };
    const operational = category !== 'PERSONAL_DEVICE';
    setSecurityCenterBusy(true);
    try {
      await updateTrustedDevice(device.id, {
        deviceName: draft.deviceName.trim() || device.deviceName || null,
        deviceCategory: category,
        operationalRole: roleForDeviceCategory(category),
        checkpointName: draft.checkpointName.trim() || null,
        operationalZone: draft.operationalZone.trim() || null,
        trusted: operational ? true : device.trusted,
        active: true,
        trustStatus: operational ? 'TRUSTED' : device.trustStatus === 'DISABLED' ? 'TRUSTED' : device.trustStatus,
        sharedOperationalDevice: operational,
        scannerFirst: operational,
        restrictedNavigation: operational,
        autoRestoreScanner: operational,
        inactivityTimeoutSeconds: operational ? 300 : null,
        reason: operational ? 'Assigned from mobile trusted-device management.' : 'Returned to personal mobile mode.',
      });
      await loadSecurityCenter();
    } catch (error) {
      Alert.alert('Device policy failed', error instanceof Error ? error.message : 'The device policy could not be saved.');
    } finally {
      setSecurityCenterBusy(false);
    }
  };

  const disableOperationalDevice = async (device: TrustedDeviceRecord) => {
    Alert.alert('Disable device?', 'This immediately removes operational trust and forces the device out of shared checkpoint mode.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disable',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setSecurityCenterBusy(true);
            try {
              await updateTrustedDevice(device.id, {
                trusted: false,
                active: false,
                trustStatus: 'DISABLED',
                sharedOperationalDevice: false,
                scannerFirst: false,
                restrictedNavigation: false,
                autoRestoreScanner: false,
                reason: 'Disabled from mobile trusted-device management.',
              });
              await loadSecurityCenter();
            } catch (error) {
              Alert.alert('Disable failed', error instanceof Error ? error.message : 'The device could not be disabled.');
            } finally {
              setSecurityCenterBusy(false);
            }
          })();
        },
      },
    ]);
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
      await setLanguagePreference(preferredLanguage === 'en' || preferredLanguage === 'hi' ? preferredLanguage : '');
      await refreshAll();
      Alert.alert('Profile saved', t('settings.languageSavedBody'));
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
          <Text style={styles.sectionLabel}>{t('settings.languageTitle')}</Text>
          <Text style={styles.helperText}>{t('settings.languageSubtitle')}</Text>
          <View style={styles.segmentRow}>
            {LANGUAGE_OPTIONS.map((option) => (
              <Pressable
                key={option.value || 'system'}
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
            <Text style={styles.panelTitle}>Security center</Text>
          </View>
          <Ionicons name={securityCenterOpen ? 'chevron-up-outline' : 'chevron-down-outline'} size={22} color={theme.colors.textSecondary} />
        </Pressable>
        {securityCenterOpen ? (
          <View style={styles.securityCenter}>
            <View style={styles.securityGrid}>
              <SecurityStatusTile label="Current device" value={localTrustProfile?.trusted ? 'Trusted' : 'Not trusted'} tone={localTrustProfile?.trusted ? 'success' : 'warning'} />
              <SecurityStatusTile label="Biometric unlock" value={localTrustProfile?.biometricEnabled ? 'Enabled' : 'Disabled'} tone={localTrustProfile?.biometricEnabled ? 'success' : 'default'} />
              <SecurityStatusTile label="Session timeout" value={`${Math.round(runtime.sessionLock.inactivityTimeoutMs / 60000)} min`} tone="info" />
              <SecurityStatusTile label="Active devices" value={String(trustedDevices.filter((device) => device.active).length)} tone="info" />
            </View>
            <PreferenceSwitchRow
              label="Biometric unlock"
              helperText="Use fingerprint, face unlock, or device PIN to unlock this trusted AccessFlow session after app restarts or inactivity."
              value={Boolean(localTrustProfile?.biometricEnabled)}
              onValueChange={(enabled) => void setBiometricUnlock(enabled)}
            />
            <View style={styles.securityActions}>
              <PrimaryButton label="Refresh security status" tone="secondary" onPress={() => void loadSecurityCenter()} loading={securityCenterBusy} />
              <PrimaryButton label="Quick secure logout" tone="danger" onPress={() => void logout()} disabled={isBusy || securityCenterBusy} />
            </View>
            <View style={styles.deviceList}>
              {trustedDevices.length ? trustedDevices.map((device) => (
                <TrustedDeviceItem
                  key={device.id}
                  device={device}
                  busy={securityCenterBusy}
                  canManage={canManageTrustedDevices}
                  draft={devicePolicyDrafts[device.id]}
                  onDraftChange={(key, value) => updateDeviceDraft(device.id, key, value)}
                  onAssignSharedGuard={() => void saveDeviceOperationalPolicy(device, 'SHARED_GUARD_DEVICE')}
                  onAssignReception={() => void saveDeviceOperationalPolicy(device, 'RECEPTION_KIOSK')}
                  onAssignScanner={() => void saveDeviceOperationalPolicy(device, 'CHECKPOINT_SCANNER')}
                  onAssignStation={() => void saveDeviceOperationalPolicy(device, 'TABLET_SECURITY_STATION')}
                  onPersonalMode={() => void saveDeviceOperationalPolicy(device, 'PERSONAL_DEVICE')}
                  onDisable={() => disableOperationalDevice(device)}
                  onLogout={() => logoutDeviceAccess(device)}
                  onRevoke={() => revokeDeviceAccess(device)}
                />
              )) : (
                <Text style={styles.helperText}>No trusted devices are registered for this account yet.</Text>
              )}
            </View>
          </View>
        ) : null}
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
            <DetailRow label="App version" value={apiConfig.appVersion} />
            <DetailRow label="Runtime version" value={apiConfig.runtimeVersion} />
            <DetailRow label="Build ID" value={apiConfig.buildId} />
            <DetailRow label="Release channel" value={apiConfig.releaseChannel} />
            <DetailRow label="OTA status" value={runtime.otaUpdate.updateDownloaded ? 'downloaded' : runtime.otaUpdate.updateAvailable ? 'available' : runtime.otaUpdate.enabled ? 'enabled' : 'disabled'} />
            <DetailRow label="Crash reporting" value={observabilitySnapshot?.crashReportingAvailable ? 'enabled' : observabilitySnapshot?.crashReportingEnabled ? 'configured' : 'disabled'} />
            <DetailRow label="Native Firebase" value={observabilitySnapshot?.crashReportingNativeAvailable ? 'available' : 'not loaded'} />
            <DetailRow label="Previous crash" value={observabilitySnapshot?.didCrashPreviously ? 'detected' : 'none'} />
            <DetailRow label="Unsent crash reports" value={observabilitySnapshot?.hasUnsentCrashReports ? 'pending' : 'none'} />
            <DetailRow label="Sync health" value={`${runtime.syncConnection.status}${runtime.syncConnection.reconnectAttempt ? ` (${runtime.syncConnection.reconnectAttempt} retries)` : ''}`} />
            <DetailRow label="API reachable" value={runtime.networkState.isApiReachable ? 'yes' : 'no'} />
            <DetailRow label="Network" value={runtime.offlineOperationalMode} />
            <DetailRow label="Offline queue" value={`${runtime.offlineOperationalQueueSize} operation${runtime.offlineOperationalQueueSize === 1 ? '' : 's'}`} />
            <DetailRow label="Last offline sync" value={runtime.offlineLastSyncAt ? formatDateTime(runtime.offlineLastSyncAt) : 'Not recorded'} />
            <DetailRow label="Push permission" value={runtime.pushPermissionStatus || 'Unknown'} />
            <DetailRow label="Runtime health" value={runtime.runtimeHealth} />
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
    setPreferredLanguage(nextProfile.preferredLanguage || preference || '');
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

function SecurityStatusTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'success' | 'warning' | 'info' | 'default';
}) {
  const color = tone === 'success'
    ? theme.colors.success
    : tone === 'warning'
      ? theme.colors.warning
      : tone === 'info'
        ? theme.colors.info
        : theme.colors.textPrimary;

  return (
    <View style={styles.securityTile}>
      <Text style={styles.securityTileLabel}>{label}</Text>
      <Text style={[styles.securityTileValue, { color }]}>{value}</Text>
    </View>
  );
}

function TrustedDeviceItem({
  device,
  busy,
  canManage,
  draft,
  onDraftChange,
  onAssignSharedGuard,
  onAssignReception,
  onAssignScanner,
  onAssignStation,
  onPersonalMode,
  onDisable,
  onLogout,
  onRevoke,
}: {
  device: TrustedDeviceRecord;
  busy: boolean;
  canManage: boolean;
  draft?: { deviceName: string; checkpointName: string; operationalZone: string };
  onDraftChange: (key: 'deviceName' | 'checkpointName' | 'operationalZone', value: string) => void;
  onAssignSharedGuard: () => void;
  onAssignReception: () => void;
  onAssignScanner: () => void;
  onAssignStation: () => void;
  onPersonalMode: () => void;
  onDisable: () => void;
  onLogout: () => void;
  onRevoke: () => void;
}) {
  const statusTone = device.trustStatus === 'TRUSTED' && device.active
    ? 'success'
    : device.trustStatus === 'SUSPICIOUS'
      ? 'warning'
      : 'danger';

  return (
    <View style={styles.deviceItem}>
      <View style={styles.deviceIcon}>
        <Ionicons
          name={device.deviceType === 'tablet' ? 'tablet-landscape-outline' : 'phone-portrait-outline'}
          size={22}
          color={theme.colors.info}
        />
      </View>
      <View style={styles.deviceCopy}>
        <View style={styles.deviceTitleRow}>
          <Text style={styles.deviceTitle}>{device.deviceName || 'Mobile device'}</Text>
          {device.currentDevice ? <StatusPill label="Current" tone="info" /> : null}
          <StatusPill label={device.trustStatus.toLowerCase()} tone={statusTone} />
        </View>
        <Text style={styles.helperText}>
          {[device.platform, device.deviceType, device.appVersion ? `v${device.appVersion}` : null].filter(Boolean).join(' · ')}
        </Text>
        <Text style={styles.helperText}>
          Last active: {device.lastActiveAt ? formatDateTime(device.lastActiveAt) : 'Not recorded'}
        </Text>
        <Text style={styles.helperText}>
          Biometric unlock: {device.biometricEnabled ? 'enabled' : 'disabled'}
          {device.suspicious ? ' · Review device posture' : ''}
        </Text>
        <Text style={styles.helperText}>
          {[device.deviceCategory.replaceAll('_', ' '), device.checkpointName, device.operationalZone].filter(Boolean).join(' · ')}
        </Text>
        {canManage ? (
          <View style={styles.devicePolicyPanel}>
            <AppTextField
              label="Device name"
              value={draft?.deviceName ?? ''}
              onChangeText={(value) => onDraftChange('deviceName', value)}
              placeholder="Gate 2 tablet, Main reception kiosk"
            />
            <AppTextField
              label="Checkpoint"
              value={draft?.checkpointName ?? ''}
              onChangeText={(value) => onDraftChange('checkpointName', value)}
              placeholder="Gate 2 Security, Main Reception"
            />
            <AppTextField
              label="Operational zone"
              value={draft?.operationalZone ?? ''}
              onChangeText={(value) => onDraftChange('operationalZone', value)}
              placeholder="Contractor Entry, Lobby, Loading Dock"
            />
            <View style={styles.deviceActions}>
              <PrimaryButton label="Guard" tone="secondary" onPress={onAssignSharedGuard} disabled={busy} />
              <PrimaryButton label="Reception" tone="secondary" onPress={onAssignReception} disabled={busy} />
              <PrimaryButton label="Scanner" tone="secondary" onPress={onAssignScanner} disabled={busy} />
              <PrimaryButton label="Station" tone="secondary" onPress={onAssignStation} disabled={busy} />
              <PrimaryButton label="Personal" tone="secondary" onPress={onPersonalMode} disabled={busy} />
              <PrimaryButton label="Disable" tone="danger" onPress={onDisable} disabled={busy} />
            </View>
          </View>
        ) : null}
        <View style={styles.deviceActions}>
          <PrimaryButton label="Log out" tone="secondary" onPress={onLogout} disabled={busy} />
          <PrimaryButton label="Revoke" tone="danger" onPress={onRevoke} disabled={busy} />
        </View>
      </View>
    </View>
  );
}

function roleForDeviceCategory(category: TrustedDeviceCategory): TrustedOperationalRole {
  switch (category) {
    case 'SHARED_GUARD_DEVICE':
      return 'SECURITY_GUARD';
    case 'RECEPTION_KIOSK':
      return 'RECEPTION';
    case 'CHECKPOINT_SCANNER':
      return 'CHECKPOINT_OPERATOR';
    case 'TABLET_SECURITY_STATION':
      return 'SECURITY_GUARD';
    default:
      return 'PERSONAL';
  }
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
