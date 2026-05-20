import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useRoute } from '@react-navigation/native';

import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { EmptyState } from '../../components/feedback/EmptyState';
import { StatusPill } from '../../components/feedback/StatusPill';
import { AppTextField } from '../../components/form/AppTextField';
import { AppScreen } from '../../components/layout/AppScreen';
import { PhotoCaptureModal } from '../../components/security/PhotoCaptureModal';
import {
  completeVisitorInviteRegistration,
  getPublicVisitorInvite,
  uploadVisitorInvitePhoto,
} from '../../services/visitorInviteService';
import { theme } from '../../theme';
import type { VisitorInviteRecord } from '../../types/domain';

type RouteParams = {
  token?: string;
};

export function VisitorInviteRegistrationScreen() {
  const route = useRoute<{ key: string; name: string; params?: RouteParams }>();
  const token = String(route.params?.token ?? '');
  const [invite, setInvite] = useState<VisitorInviteRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [photoVisible, setPhotoVisible] = useState(false);
  const [photoAsset, setPhotoAsset] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    fullName: '',
    phoneCountryCode: '+1',
    phone: '',
    email: '',
    companyName: '',
    purposeOfVisit: '',
    scheduledStartTime: '',
  });

  useEffect(() => {
    if (!token) {
      setError('Invite token is missing.');
      return;
    }

    setLoading(true);
    getPublicVisitorInvite(token)
      .then((nextInvite) => {
        setInvite(nextInvite);
        setForm({
          fullName: nextInvite.visitorName ?? '',
          phoneCountryCode: nextInvite.phoneCountryCode ?? '+1',
          phone: nextInvite.visitorPhone ?? '',
          email: nextInvite.visitorEmail ?? '',
          companyName: nextInvite.companyName ?? '',
          purposeOfVisit: nextInvite.purposeOfVisit ?? '',
          scheduledStartTime: nextInvite.scheduledStartTime ?? '',
        });
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Unable to load invite.'))
      .finally(() => setLoading(false));
  }, [token]);

  const submitRegistration = async () => {
    if (!token || !invite || !photoAsset) {
      setError('Complete the invite details and capture a photo before submitting.');
      return;
    }
    if (!form.fullName.trim() || !form.phone.trim() || !form.purposeOfVisit.trim()) {
      setError('Name, phone, and purpose are required.');
      return;
    }

    setSubmitting(true);
    try {
      setError(null);
      const photo = await uploadVisitorInvitePhoto(token, photoAsset);
      const completed = await completeVisitorInviteRegistration(token, {
        fullName: form.fullName.trim(),
        phoneCountryCode: form.phoneCountryCode.trim() || null,
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        companyName: form.companyName.trim() || null,
        purposeOfVisit: form.purposeOfVisit.trim(),
        scheduledStartTime: form.scheduledStartTime ? new Date(form.scheduledStartTime).toISOString() : invite.scheduledStartTime,
        expectedDurationMinutes: invite.expectedDurationMinutes ?? 60,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        photoUrl: photo.url,
        photoPublicId: photo.publicId,
      });
      setInvite(completed);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to complete registration.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <AppScreen
        title="Visitor Invite"
        subtitle="Complete pre-registration before arrival and keep your temporary QR pass ready for security."
        sensitive={Boolean(invite?.pass?.qrImageDataUri)}
        sensitiveReason="visitor-invite-pass"
        refreshing={loading}
      >
        {error ? (
          <SurfaceCard title="Invite status">
            <StatusPill label="Attention" tone="danger" />
            <Text style={styles.bodyText}>{error}</Text>
          </SurfaceCard>
        ) : null}

        {invite ? (
          <>
            <SurfaceCard title="Visit details" subtitle={`${invite.organizationName ?? 'AccessFlow site'} · Host ${invite.hostEmployeeName ?? 'assigned'}`}>
              <AppTextField label="Full name" value={form.fullName} onChangeText={(fullName) => setForm((current) => ({ ...current, fullName }))} placeholder="Full name" />
              <AppTextField label="Phone country code" value={form.phoneCountryCode} onChangeText={(phoneCountryCode) => setForm((current) => ({ ...current, phoneCountryCode }))} placeholder="+1" keyboardType="phone-pad" />
              <AppTextField label="Phone" value={form.phone} onChangeText={(phone) => setForm((current) => ({ ...current, phone }))} placeholder="Phone number" keyboardType="phone-pad" />
              <AppTextField label="Email" value={form.email} onChangeText={(email) => setForm((current) => ({ ...current, email }))} placeholder="visitor@company.com" keyboardType="email-address" autoCapitalize="none" />
              <AppTextField label="Organization" value={form.companyName} onChangeText={(companyName) => setForm((current) => ({ ...current, companyName }))} placeholder="Company name" />
              <AppTextField label="Purpose" value={form.purposeOfVisit} onChangeText={(purposeOfVisit) => setForm((current) => ({ ...current, purposeOfVisit }))} placeholder="Purpose of visit" />
              <AppTextField label="Arrival time" value={form.scheduledStartTime} onChangeText={(scheduledStartTime) => setForm((current) => ({ ...current, scheduledStartTime }))} placeholder="2026-05-20T14:30" />
              <View style={styles.photoRow}>
                {photoAsset ? <Image source={{ uri: photoAsset.uri }} style={styles.photoPreview} /> : <View style={styles.photoPlaceholder}><Text style={styles.bodyText}>Photo required</Text></View>}
                <View style={styles.photoActions}>
                  <PrimaryButton label={photoAsset ? 'Retake photo' : 'Capture photo'} onPress={() => setPhotoVisible(true)} tone="secondary" />
                </View>
              </View>
              <PrimaryButton
                label={invite.pass?.qrImageDataUri ? 'Registration completed' : 'Complete pre-registration'}
                onPress={() => void submitRegistration()}
                loading={submitting}
                disabled={Boolean(invite.pass?.qrImageDataUri)}
              />
            </SurfaceCard>

            <SurfaceCard title="Temporary QR pass" subtitle="Security validates the pass status and expiry at arrival.">
              {invite.pass?.qrImageDataUri ? (
                <View style={styles.qrPanel}>
                  <Image source={{ uri: invite.pass.qrImageDataUri }} style={styles.qrImage} resizeMode="contain" />
                  <StatusPill label={invite.pass.valid ? 'Valid pass' : invite.pass.statusLabel || 'Not valid'} tone={invite.pass.valid ? 'success' : 'warning'} />
                  <Text style={styles.bodyText}>Expires {invite.pass.expiresAt ? new Date(invite.pass.expiresAt).toLocaleString() : 'after the approved access window'}</Text>
                </View>
              ) : (
                <EmptyState title="QR pending" body={invite.approvalRequired ? 'Your host must approve before a QR pass is issued.' : 'Submit registration to issue your temporary QR pass.'} />
              )}
            </SurfaceCard>
          </>
        ) : loading ? (
          <SurfaceCard title="Loading invite">
            <Text style={styles.bodyText}>Loading secure visitor invite...</Text>
          </SurfaceCard>
        ) : null}
      </AppScreen>

      <PhotoCaptureModal
        visible={photoVisible}
        title="Capture visitor photo"
        onCancel={() => setPhotoVisible(false)}
        onCapture={(asset) => {
          setPhotoAsset(asset);
          setPhotoVisible(false);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  bodyText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  photoPreview: {
    width: 96,
    height: 96,
    borderRadius: theme.radii.md,
  },
  photoPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.sm,
  },
  photoActions: {
    flex: 1,
  },
  qrPanel: {
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  qrImage: {
    width: 220,
    height: 220,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceRaised,
  },
});
