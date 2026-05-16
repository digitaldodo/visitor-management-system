import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '../../auth/AuthProvider';
import { apiConfig } from '../../api/apiConfig';
import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { DetailRow } from '../../components/employee/DetailRow';
import { PreferenceSwitchRow } from '../../components/employee/PreferenceSwitchRow';
import { StatusPill } from '../../components/feedback/StatusPill';
import { AppTextField } from '../../components/form/AppTextField';
import { AppScreen } from '../../components/layout/AppScreen';
import {
  useEmployeeBadge,
  useEmployeeProfile,
  useUpdateEmployeePasswordMutation,
  useUpdateEmployeeProfileMutation,
  useUploadEmployeeProfilePhotoMutation,
} from '../../hooks/useEmployeeWorkspace';
import { theme } from '../../theme';
import type { UserProfile } from '../../types/domain';
import { formatDateTime, formatShift } from '../../utils/employeeFormatting';

const LANGUAGE_OPTIONS = [
  { label: 'System', value: '' },
  { label: 'English', value: 'en' },
  { label: 'Hindi', value: 'hi' },
] as const;

export function SettingsScreen() {
  const queryClient = useQueryClient();
  const { session, logout, isBusy, refreshSession } = useAuth();
  const profile = useEmployeeProfile();
  const badge = useEmployeeBadge();

  const updateProfileMutation = useUpdateEmployeeProfileMutation();
  const updatePasswordMutation = useUpdateEmployeePasswordMutation();
  const uploadPhotoMutation = useUploadEmployeeProfilePhotoMutation();

  const [phoneCountryCode, setPhoneCountryCode] = useState('+1');
  const [phone, setPhone] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState('');
  const [notificationEmailEnabled, setNotificationEmailEnabled] = useState(true);
  const [notificationInAppEnabled, setNotificationInAppEnabled] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (!profile.data) {
      return;
    }

    hydrateEditableFields(profile.data);
  }, [profile.data]);

  const saveProfile = async () => {
    try {
      await updateProfileMutation.mutateAsync({
        phoneCountryCode: phoneCountryCode.trim() || null,
        phone: phone.trim() || null,
        emergencyContact: emergencyContact.trim() || null,
        preferredLanguage: preferredLanguage || null,
        notificationEmailEnabled,
        notificationInAppEnabled,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['employee', 'profile'] }),
        queryClient.invalidateQueries({ queryKey: ['employee', 'notifications'] }),
      ]);
      await refreshSession();
      Alert.alert('Profile updated', 'Your employee contact preferences were saved.');
    } catch (error) {
      Alert.alert('Update failed', error instanceof Error ? error.message : 'The employee profile could not be updated.');
    }
  };

  const updatePhoto = async (source: 'camera' | 'gallery') => {
    try {
      const asset = await pickProfilePhoto(source);
      if (!asset) {
        return;
      }

      const uploadedPhoto = await uploadPhotoMutation.mutateAsync(asset);
      await updateProfileMutation.mutateAsync({
        employeePhotoUrl: uploadedPhoto.url,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['employee', 'badge'] }),
        queryClient.invalidateQueries({ queryKey: ['employee', 'profile'] }),
      ]);
      await refreshSession();
      Alert.alert('Photo updated', 'Your profile photo was refreshed and the badge preview has been regenerated without rotating your static QR.');
    } catch (error) {
      Alert.alert('Photo update failed', error instanceof Error ? error.message : 'The profile photo could not be updated.');
    }
  };

  const changePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Missing details', 'Enter the current password, a new password, and the confirmation.');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Confirm the new password exactly before saving.');
      return;
    }

    try {
      await updatePasswordMutation.mutateAsync({
        currentPassword,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert(
        'Password updated',
        'For security, AccessFlow will sign you out now because the backend revokes previous refresh tokens after a password change.',
        [
          {
            text: 'Continue',
            onPress: () => {
              void logout();
            },
          },
        ],
      );
    } catch (error) {
      Alert.alert('Password update failed', error instanceof Error ? error.message : 'The password could not be updated.');
    }
  };

  const isSavingProfile = updateProfileMutation.isPending || uploadPhotoMutation.isPending;
  const identityProfile = profile.data;

  return (
    <AppScreen
      title="Settings"
      subtitle="Manage contact preferences, password, and badge photo while identity authority stays with the backend."
      refreshing={profile.isRefetching || badge.isRefetching}
      onRefresh={() => {
        void profile.refetch();
        void badge.refetch();
      }}
    >
      <SurfaceCard title="Credential photo" subtitle="Your photo updates the badge preview, but the static QR identity remains unchanged until the backend revokes it.">
        <View style={styles.photoRow}>
          {identityProfile?.employeePhotoUrl ? (
            <Image source={{ uri: identityProfile.employeePhotoUrl }} style={styles.avatar} />
          ) : (
            <AvatarFallback fullName={identityProfile?.fullName || session?.user.fullName || 'AccessFlow Employee'} />
          )}
          <View style={styles.photoCopy}>
            <Text style={styles.photoTitle}>{identityProfile?.fullName || session?.user.fullName || 'Employee'}</Text>
            <Text style={styles.photoHelper}>Camera and gallery updates are compressed for mobile upload, then the badge preview is refreshed safely.</Text>
            <View style={styles.photoActions}>
              <PrimaryButton
                label="Take photo"
                onPress={() => void updatePhoto('camera')}
                tone="secondary"
                loading={uploadPhotoMutation.isPending}
              />
              <PrimaryButton
                label="Choose photo"
                onPress={() => void updatePhoto('gallery')}
                tone="secondary"
                disabled={uploadPhotoMutation.isPending}
              />
            </View>
          </View>
        </View>
      </SurfaceCard>

      <SurfaceCard title="Editable profile" subtitle="Only the operational fields below can be changed from the employee app.">
        <View style={styles.inlineFields}>
          <View style={styles.inlineField}>
            <AppTextField label="Country code" value={phoneCountryCode} onChangeText={setPhoneCountryCode} placeholder="+1" />
          </View>
          <View style={styles.inlineFieldWide}>
            <AppTextField label="Phone number" value={phone} onChangeText={setPhone} placeholder="Phone number" keyboardType="phone-pad" />
          </View>
        </View>
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
          helperText="Receive visitor, badge, and approval status updates inside the employee app."
          value={notificationInAppEnabled}
          onValueChange={setNotificationInAppEnabled}
        />
        <PreferenceSwitchRow
          label="Email alerts"
          helperText="Receive the same operational alerts through email when backend email delivery is enabled."
          value={notificationEmailEnabled}
          onValueChange={setNotificationEmailEnabled}
        />
        <PrimaryButton label="Save profile changes" onPress={() => void saveProfile()} loading={isSavingProfile} />
      </SurfaceCard>

      <SurfaceCard title="Protected identity" subtitle="These identity fields are backend-managed and intentionally read-only in the employee app.">
        <DetailRow label="Name" value={identityProfile?.fullName || session?.user.fullName || 'Assigned'} />
        <DetailRow label="Employee ID" value={identityProfile?.employeeId || session?.user.employeeId || 'Provisioning pending'} />
        <DetailRow label="Organization" value={identityProfile?.organizationCode || identityProfile?.organizationName || session?.user.organizationCode || 'Assigned'} />
        <DetailRow label="Role" value={session?.user.activeRole || 'EMPLOYEE'} />
        <DetailRow label="Department" value={identityProfile?.department || session?.user.department || 'Assigned'} muted={!identityProfile?.department && !session?.user.department} />
        <DetailRow label="Designation" value={identityProfile?.designation || session?.user.designation || 'Assigned'} muted={!identityProfile?.designation && !session?.user.designation} />
        <DetailRow label="Shift" value={formatShift(identityProfile?.shiftName, identityProfile?.shiftStartTime, identityProfile?.shiftEndTime)} />
        <DetailRow label="Credential QR" value={badge.data?.active ? 'Static QR issued and active' : 'Unavailable or revoked'} muted={!badge.data?.active} />
      </SurfaceCard>

      <SurfaceCard title="Credential status" subtitle="Quick operational context for checkpoint presentation and runtime recovery.">
        <StatusPill label={badge.data?.active ? 'Badge active' : 'Badge unavailable'} tone={badge.data?.active ? 'success' : 'danger'} />
        <DetailRow label="Badge issued" value={badge.data?.issuedAt ? formatDateTime(badge.data.issuedAt, badge.data.organizationTimezone) : 'Not issued yet'} muted={!badge.data?.issuedAt} />
        <DetailRow label="Org timezone" value={identityProfile?.organizationTimezone || session?.user.organizationTimezone || 'Not assigned'} muted={!identityProfile?.organizationTimezone && !session?.user.organizationTimezone} />
        <DetailRow label="Last sync" value={session?.lastSyncedAt ? formatDateTime(session.lastSyncedAt) : 'Unknown'} muted={!session?.lastSyncedAt} />
      </SurfaceCard>

      <SurfaceCard title="Password" subtitle="Use a strong password. The app will sign you out after a password change to avoid stale refresh-token state.">
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
        />
        <AppTextField
          label="Confirm new password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Confirm new password"
          secureTextEntry
          autoCapitalize="none"
        />
        <PrimaryButton label="Update password" onPress={() => void changePassword()} loading={updatePasswordMutation.isPending} />
      </SurfaceCard>

      <SurfaceCard title="Session and runtime">
        <DetailRow label="API base" value={apiConfig.apiBaseUrl} />
        <DetailRow label="App version" value={apiConfig.appVersion} />
        <DetailRow label="Runtime version" value={apiConfig.runtimeVersion} />
        <View style={styles.sessionActions}>
          <PrimaryButton label="Refresh session" onPress={() => void refreshSession()} loading={isBusy} />
          <PrimaryButton label="Log out" onPress={() => void logout()} tone="secondary" disabled={isBusy} />
        </View>
      </SurfaceCard>
    </AppScreen>
  );

  function hydrateEditableFields(nextProfile: UserProfile) {
    setPhoneCountryCode(nextProfile.phoneCountryCode || '+1');
    setPhone(nextProfile.phone || '');
    setEmergencyContact(nextProfile.emergencyContact || '');
    setPreferredLanguage(nextProfile.preferredLanguage || '');
    setNotificationEmailEnabled(nextProfile.notificationEmailEnabled ?? true);
    setNotificationInAppEnabled(nextProfile.notificationInAppEnabled ?? true);
  }
}

function AvatarFallback({ fullName }: { fullName: string }) {
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <View style={styles.avatarFallback}>
      <Text style={styles.avatarFallbackLabel}>{initials || 'AF'}</Text>
    </View>
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

  const pickerResult = source === 'camera'
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

  if (pickerResult.canceled || !pickerResult.assets.length) {
    return null;
  }

  const asset = pickerResult.assets[0];
  return {
    uri: asset.uri,
    name: asset.fileName || `employee-photo-${Date.now()}.jpg`,
    type: asset.mimeType || 'image/jpeg',
  };
}

const styles = StyleSheet.create({
  photoRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'center',
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: theme.colors.surfaceMuted,
  },
  avatarFallback: {
    width: 96,
    height: 96,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#15344D',
  },
  avatarFallbackLabel: {
    color: theme.colors.textInverse,
    fontSize: 28,
    fontWeight: '800',
  },
  photoCopy: {
    flex: 1,
    gap: theme.spacing.sm,
  },
  photoTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  photoHelper: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
  photoActions: {
    gap: theme.spacing.sm,
  },
  inlineFields: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  inlineField: {
    width: 96,
  },
  inlineFieldWide: {
    flex: 1,
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
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: theme.colors.primary,
  },
  segmentLabel: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  segmentLabelActive: {
    color: theme.colors.textInverse,
  },
  sessionActions: {
    gap: theme.spacing.sm,
  },
});
