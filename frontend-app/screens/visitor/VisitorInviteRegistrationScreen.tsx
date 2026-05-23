import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useRoute } from '@react-navigation/native';

import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { EmptyState } from '../../components/feedback/EmptyState';
import { StatusPill } from '../../components/feedback/StatusPill';
import { AppTextField } from '../../components/form/AppTextField';
import { ArrivalTimeSelector, nearestArrivalTime } from '../../components/form/ArrivalTimeSelector';
import { InternationalPhoneInput, validateInternationalPhone } from '../../components/form/InternationalPhoneInput';
import { AppScreen } from '../../components/layout/AppScreen';
import { PhotoCaptureModal } from '../../components/security/PhotoCaptureModal';
import {
  completeVisitorInviteRegistration,
  getPublicVisitorInvite,
  uploadVisitorInvitePhoto,
} from '../../services/visitorInviteService';
import { theme } from '../../theme';
import type { VisitorInviteRecord } from '../../types/domain';
import { canonicalVisitorInviteStage } from '../../types/workflow';

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
    scheduledStartAt: nearestArrivalTime(),
    expectedDurationMinutes: '60',
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
          scheduledStartAt: parseInviteStart(nextInvite.scheduledStartTime),
          expectedDurationMinutes: String(nextInvite.expectedDurationMinutes ?? 60),
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
    const phoneError = validateInternationalPhone(form.phoneCountryCode, form.phone, true);
    if (phoneError) {
      setError(phoneError);
      return;
    }
    if (Number.isNaN(form.scheduledStartAt.getTime())) {
      setError('Choose a valid arrival date and time.');
      return;
    }
    if (form.scheduledStartAt.getTime() <= Date.now()) {
      setError('Choose a future arrival date and time.');
      return;
    }

    setSubmitting(true);
    try {
      setError(null);
      const photo = await uploadVisitorInvitePhoto(token, photoAsset);
      const duration = Number(form.expectedDurationMinutes) || invite.expectedDurationMinutes || 60;
      const scheduledEndAt = new Date(form.scheduledStartAt.getTime() + duration * 60_000);
      const completed = await completeVisitorInviteRegistration(token, {
        fullName: form.fullName.trim(),
        phoneCountryCode: form.phoneCountryCode.trim() || null,
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        companyName: form.companyName.trim() || null,
        purposeOfVisit: form.purposeOfVisit.trim(),
        scheduledStartTime: form.scheduledStartAt.toISOString(),
        scheduledEndTime: scheduledEndAt.toISOString(),
        expectedDurationMinutes: duration,
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

  const timezone = invite?.timezone || invite?.organizationTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const phoneError = validateInternationalPhone(form.phoneCountryCode, form.phone, true);
  const inviteStage = canonicalVisitorInviteStage(invite?.lifecycleStage || invite?.status, invite?.qrIssuedAt, invite?.arrivedAt);
  const registrationSubmitted = Boolean(invite?.visitorId || invite?.registrationCompletedAt);
  const canCompleteInvite = Boolean(invite && !registrationSubmitted && ['INVITED', 'PRE_REGISTRATION_PENDING'].includes(String(inviteStage)));

  return (
    <>
      <AppScreen
        title="Visitor Invite"
        subtitle="Complete pre-registration before arrival. The QR badge is issued only after host or workplace approval."
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
            <SurfaceCard title="Lifecycle status" subtitle={invite.nextAction || 'AccessFlow is keeping the invite, approval, and badge state synchronized.'}>
              <StatusPill label={invite.lifecycleLabel || invite.status.replaceAll('_', ' ')} tone={inviteStatusTone(invite)} />
              {registrationSubmitted && !invite.pass?.qrImageDataUri ? (
                <Text style={styles.bodyText}>Pending approval. You do not need to submit this form again; AccessFlow will notify you when the approved badge is issued.</Text>
              ) : null}
            </SurfaceCard>

            <SurfaceCard title="Visit details" subtitle={`${invite.organizationName ?? 'AccessFlow site'} · Host ${invite.hostEmployeeName ?? 'assigned'}`}>
              {invite.note ? (
                <View style={styles.notePanel}>
                  <Text style={styles.noteLabel}>Additional note from host</Text>
                  <Text style={styles.bodyText}>{invite.note}</Text>
                </View>
              ) : null}
              <AppTextField label="Full name" value={form.fullName} onChangeText={(fullName) => setForm((current) => ({ ...current, fullName }))} placeholder="Full name" />
              <InternationalPhoneInput
                countryCode={form.phoneCountryCode}
                phone={form.phone}
                errorText={form.phone.trim() ? phoneError : null}
                onCountryCodeChange={(phoneCountryCode) => setForm((current) => ({ ...current, phoneCountryCode }))}
                onPhoneChange={(phone) => setForm((current) => ({ ...current, phone }))}
              />
              <AppTextField label="Email" value={form.email} onChangeText={(email) => setForm((current) => ({ ...current, email }))} placeholder="visitor@company.com" keyboardType="email-address" autoCapitalize="none" />
              <AppTextField label="Organization" value={form.companyName} onChangeText={(companyName) => setForm((current) => ({ ...current, companyName }))} placeholder="Company name" />
              <AppTextField label="Purpose" value={form.purposeOfVisit} onChangeText={(purposeOfVisit) => setForm((current) => ({ ...current, purposeOfVisit }))} placeholder="Purpose of visit" />
              <ArrivalTimeSelector
                value={form.scheduledStartAt}
                durationMinutes={form.expectedDurationMinutes}
                timezone={timezone}
                durationOptions={['30', '60', '120', '240']}
                onChange={(scheduledStartAt) => setForm((current) => ({ ...current, scheduledStartAt }))}
                onDurationChange={(expectedDurationMinutes) => setForm((current) => ({ ...current, expectedDurationMinutes }))}
              />
              <View style={styles.photoRow}>
                {photoAsset ? <Image source={{ uri: photoAsset.uri }} style={styles.photoPreview} /> : <View style={styles.photoPlaceholder}><Text style={styles.bodyText}>Photo required</Text></View>}
                <View style={styles.photoActions}>
                  <PrimaryButton label={photoAsset ? 'Retake photo' : 'Capture photo'} onPress={() => setPhotoVisible(true)} tone="secondary" />
                </View>
              </View>
              <PrimaryButton
                label={registrationSubmitted ? 'Pre-registration submitted' : 'Complete pre-registration'}
                onPress={() => void submitRegistration()}
                loading={submitting}
                disabled={!canCompleteInvite}
              />
            </SurfaceCard>

            <SurfaceCard title="Approved QR badge" subtitle="Security validates the live badge status and expiry at arrival.">
              {invite.pass?.qrImageDataUri ? (
                <View style={styles.qrPanel}>
                  <Image source={{ uri: invite.pass.qrImageDataUri }} style={styles.qrImage} resizeMode="contain" />
                  <StatusPill label={invite.pass.valid ? 'Valid pass' : invite.pass.statusLabel || 'Not valid'} tone={invite.pass.valid ? 'success' : 'warning'} />
                  <Text style={styles.bodyText}>Expires {invite.pass.expiresAt ? new Date(invite.pass.expiresAt).toLocaleString() : 'after the approved access window'}</Text>
                </View>
              ) : (
                <EmptyState title={registrationSubmitted ? 'Pending approval' : 'QR pending'} body={registrationSubmitted ? 'Your registration is submitted. The QR badge will be delivered after approval.' : 'Complete pre-registration first. AccessFlow will not issue a QR badge until approval is granted.'} />
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

function parseInviteStart(value?: string | null) {
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now()) {
      return parsed;
    }
  }
  return nearestArrivalTime();
}

function inviteStatusTone(invite: VisitorInviteRecord): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  const stage = canonicalVisitorInviteStage(invite.lifecycleStage || invite.status, invite.qrIssuedAt, invite.arrivedAt);
  if (['BADGE_ISSUED', 'CHECKED_IN', 'CHECKED_OUT'].includes(String(stage))) {
    return 'success';
  }
  if (['EXPIRED', 'REVOKED', 'REJECTED'].includes(String(stage))) {
    return 'danger';
  }
  if (['PENDING_APPROVAL', 'PRE_REGISTERED'].includes(String(stage))) {
    return 'warning';
  }
  return 'info';
}

const styles = StyleSheet.create({
  bodyText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
  notePanel: {
    gap: theme.spacing.xs,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.md,
  },
  noteLabel: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
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
