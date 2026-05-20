import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '../../auth/AuthProvider';
import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { MetricCard } from '../../components/cards/MetricCard';
import { RecordCard } from '../../components/cards/RecordCard';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { StatusPill } from '../../components/feedback/StatusPill';
import { AppTextField } from '../../components/form/AppTextField';
import { AppScreen } from '../../components/layout/AppScreen';
import { ReasonCaptureModal } from '../../components/security/ReasonCaptureModal';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import {
  useClearLockdownMutation,
  useEmergencyBroadcastMutation,
  useEmergencyEvacuationRegister,
  useEmergencyFeed,
  useEmergencyPanicMutation,
  useEmergencyState,
  useFlagSuspiciousVisitorMutation,
  useFlagSuspiciousWorkforceMutation,
  useStartLockdownMutation,
} from '../../hooks/useEmergencyWorkspace';
import { theme } from '../../theme';
import type { EmergencyIncident, EmergencyIncidentSeverity } from '../../types/domain';
import { formatDateTime } from '../../utils/securityFormatting';

type ReasonAction =
  | 'panic'
  | 'lockdown-start'
  | 'lockdown-clear'
  | 'flag-visitor'
  | 'flag-workforce';

const SEVERITIES: EmergencyIncidentSeverity[] = ['HIGH', 'CRITICAL', 'MEDIUM'];

export function EmergencyOpsScreen() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const layout = useResponsiveLayout();
  const [reasonAction, setReasonAction] = useState<ReasonAction | null>(null);
  const [checkpoint, setCheckpoint] = useState('Main Gate');
  const [lockdownScope, setLockdownScope] = useState('All checkpoints');
  const [broadcastTitle, setBroadcastTitle] = useState('Emergency operational update');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastSeverity, setBroadcastSeverity] = useState<EmergencyIncidentSeverity>('HIGH');
  const [broadcastEvacuation, setBroadcastEvacuation] = useState(false);
  const [visitorId, setVisitorId] = useState('');
  const [workforceId, setWorkforceId] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const role = auth.status === 'authenticated' ? auth.session.user.activeRole : null;
  const canCoordinate = role === 'ADMIN';
  const canOperate = role === 'SECURITY_GUARD' || canCoordinate;

  const emergencyState = useEmergencyState();
  const feed = useEmergencyFeed(canOperate);
  const evacuation = useEmergencyEvacuationRegister(canOperate);
  const panicMutation = useEmergencyPanicMutation();
  const broadcastMutation = useEmergencyBroadcastMutation();
  const startLockdownMutation = useStartLockdownMutation();
  const clearLockdownMutation = useClearLockdownMutation();
  const flagVisitorMutation = useFlagSuspiciousVisitorMutation();
  const flagWorkforceMutation = useFlagSuspiciousWorkforceMutation();

  const activeIncidents = useMemo(
    () => (feed.data ?? []).filter((incident) => incident.status !== 'RESOLVED'),
    [feed.data],
  );
  const suspiciousIncidents = useMemo(
    () => activeIncidents.filter((incident) => String(incident.type).includes('SUSPICIOUS')),
    [activeIncidents],
  );
  const panicIncidents = useMemo(
    () => activeIncidents.filter((incident) => incident.type === 'PANIC_TRIGGERED'),
    [activeIncidents],
  );

  const refreshWorkspace = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['emergency'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      queryClient.invalidateQueries({ queryKey: ['security'] }),
      queryClient.invalidateQueries({ queryKey: ['admin'] }),
    ]);
  };

  const submitReason = async (reason: string) => {
    switch (reasonAction) {
      case 'panic': {
        const incident = await panicMutation.mutateAsync({ checkpoint, note: reason, deliberate: true });
        setActionMessage(`${incident.title} at ${incident.checkpoint || checkpoint}.`);
        break;
      }
      case 'lockdown-start': {
        await startLockdownMutation.mutateAsync({ reason, scope: lockdownScope, confirmOperationalOnly: true });
        setActionMessage('Emergency lockdown is active. Visitor approvals and new check-ins are suspended.');
        break;
      }
      case 'lockdown-clear': {
        await clearLockdownMutation.mutateAsync({ reason, scope: lockdownScope, confirmOperationalOnly: true });
        setActionMessage('Emergency lockdown cleared and recorded.');
        break;
      }
      case 'flag-visitor': {
        const incident = await flagVisitorMutation.mutateAsync({ id: visitorId.trim(), note: reason, checkpoint });
        setActionMessage(`${incident.subjectName || 'Visitor'} flagged for security review.`);
        break;
      }
      case 'flag-workforce': {
        const incident = await flagWorkforceMutation.mutateAsync({ id: workforceId.trim(), note: reason, checkpoint });
        setActionMessage(`${incident.subjectName || 'Workforce record'} flagged for security review.`);
        break;
      }
    }
    setReasonAction(null);
    await refreshWorkspace();
  };

  const sendBroadcast = async () => {
    if (!broadcastMessage.trim()) {
      setActionMessage('Broadcast message is required.');
      return;
    }
    const incident = await broadcastMutation.mutateAsync({
      title: broadcastTitle.trim(),
      message: broadcastMessage.trim(),
      severity: broadcastSeverity,
      scope: lockdownScope,
      evacuation: broadcastEvacuation,
    });
    setBroadcastMessage('');
    setActionMessage(`${incident.title} broadcast dispatched.`);
    await refreshWorkspace();
  };

  return (
    <>
      <AppScreen
        title="Emergency Ops"
        subtitle="Panic response, lockdown coordination, broadcasts, suspicious activity, evacuation register, and live incident feed."
        contentMaxWidth={layout.isLargeTablet ? 1180 : undefined}
        refreshing={emergencyState.isRefetching || feed.isRefetching || evacuation.isRefetching}
        onRefresh={refreshWorkspace}
      >
        <View style={styles.metricsGrid}>
          <MetricCard label="Lockdown" value={emergencyState.data?.lockdownActive ? 'Active' : 'Clear'} tone={emergencyState.data?.lockdownActive ? 'danger' : 'success'} />
          <MetricCard label="Active incidents" value={activeIncidents.length} tone={activeIncidents.length ? 'warning' : 'default'} />
          <MetricCard label="Panic alerts" value={panicIncidents.length} tone={panicIncidents.length ? 'danger' : 'default'} />
          <MetricCard label="Unaccounted" value={evacuation.data?.counts?.unaccounted ?? 0} tone={(evacuation.data?.counts?.unaccounted ?? 0) ? 'warning' : 'default'} />
        </View>

        {canOperate ? (
          <SurfaceCard title="Panic trigger" subtitle="Hold-to-confirm style distress workflow for guards and admins. Location/checkpoint and notes are attached to the incident.">
            <View style={styles.controlStack}>
              <AppTextField label="Checkpoint" value={checkpoint} onChangeText={setCheckpoint} placeholder="Gate 2, Lobby A, Building A" />
              <Pressable
                accessibilityRole="button"
                onLongPress={() => setReasonAction('panic')}
                delayLongPress={850}
                style={({ pressed }) => [styles.panicButton, pressed ? styles.panicButtonPressed : null]}
              >
                <Ionicons name="alert-circle" size={28} color={theme.colors.textInverse} />
                <View style={styles.panicCopy}>
                  <Text style={styles.panicTitle}>Hold for panic alert</Text>
                  <Text style={styles.panicBody}>Requires deliberate long press and a note before dispatch.</Text>
                </View>
              </Pressable>
            </View>
          </SurfaceCard>
        ) : null}

        {canCoordinate ? (
          <View style={[styles.splitPane, layout.isTablet ? styles.splitPaneWide : null]}>
            <SurfaceCard title="Emergency lockdown" subtitle="Operational coordination only. The app suspends visitor approvals and new check-ins; it does not operate physical access-control hardware.">
              <View style={styles.controlStack}>
                <AppTextField label="Scope" value={lockdownScope} onChangeText={setLockdownScope} placeholder="All gates, Building A, Main campus" />
                <View style={[styles.actionGrid, layout.isTablet ? styles.actionGridWide : null]}>
                  <PrimaryButton
                    label="Start lockdown"
                    tone="danger"
                    onPress={() => setReasonAction('lockdown-start')}
                    disabled={Boolean(emergencyState.data?.lockdownActive)}
                    loading={startLockdownMutation.isPending}
                  />
                  <PrimaryButton
                    label="Clear lockdown"
                    tone="secondary"
                    onPress={() => setReasonAction('lockdown-clear')}
                    disabled={!emergencyState.data?.lockdownActive}
                    loading={clearLockdownMutation.isPending}
                  />
                </View>
              </View>
            </SurfaceCard>

            <SurfaceCard title="Emergency broadcast" subtitle="Send high-priority operational guidance to in-app and push notification channels.">
              <View style={styles.controlStack}>
                <AppTextField label="Title" value={broadcastTitle} onChangeText={setBroadcastTitle} placeholder="Evacuate Building A" />
                <AppTextField label="Message" value={broadcastMessage} onChangeText={setBroadcastMessage} placeholder="Give clear operational direction." multiline />
                <View style={styles.segmentRow}>
                  {SEVERITIES.map((severity) => (
                    <Pressable key={severity} onPress={() => setBroadcastSeverity(severity)} style={[styles.segment, broadcastSeverity === severity ? styles.segmentActive : null]}>
                      <Text style={[styles.segmentLabel, broadcastSeverity === severity ? styles.segmentLabelActive : null]}>{severity}</Text>
                    </Pressable>
                  ))}
                  <Pressable onPress={() => setBroadcastEvacuation((current) => !current)} style={[styles.segment, broadcastEvacuation ? styles.segmentDanger : null]}>
                    <Text style={styles.segmentLabel}>{broadcastEvacuation ? 'Evacuation' : 'Broadcast'}</Text>
                  </Pressable>
                </View>
                <PrimaryButton label="Send broadcast" onPress={() => void sendBroadcast()} loading={broadcastMutation.isPending} />
              </View>
            </SurfaceCard>
          </View>
        ) : null}

        {canOperate ? (
          <SurfaceCard title="Suspicious activity" subtitle="Create incident history for repeat visitor or workforce security review.">
            <View style={[styles.splitPane, layout.isTablet ? styles.splitPaneWide : null]}>
              <View style={styles.splitPaneColumn}>
                <AppTextField label="Visitor ID" value={visitorId} onChangeText={setVisitorId} placeholder="Paste visitor record ID" />
                <PrimaryButton label="Flag visitor" onPress={() => setReasonAction('flag-visitor')} tone="secondary" disabled={!visitorId.trim()} loading={flagVisitorMutation.isPending} />
              </View>
              <View style={styles.splitPaneColumn}>
                <AppTextField label="Workforce user ID" value={workforceId} onChangeText={setWorkforceId} placeholder="Paste employee user ID" />
                <PrimaryButton label="Flag workforce" onPress={() => setReasonAction('flag-workforce')} tone="secondary" disabled={!workforceId.trim()} loading={flagWorkforceMutation.isPending} />
              </View>
            </View>
            {suspiciousIncidents.slice(0, 3).map((incident) => <IncidentRow key={incident.id} incident={incident} />)}
          </SurfaceCard>
        ) : null}

        {canOperate ? (
          <SurfaceCard title="Evacuation register" subtitle="Fast visibility for active visitors and workforce currently marked inside.">
            <View style={styles.metricsGrid}>
              <MetricCard label="Visitors inside" value={evacuation.data?.counts?.visitorsInside ?? 0} tone="info" />
              <MetricCard label="Workforce inside" value={evacuation.data?.counts?.workforceInside ?? 0} tone="info" />
              <MetricCard label="Unaccounted" value={evacuation.data?.counts?.unaccounted ?? 0} tone={(evacuation.data?.counts?.unaccounted ?? 0) ? 'warning' : 'default'} />
            </View>
            <View style={styles.listStack}>
              {(evacuation.data?.unaccounted ?? []).slice(0, 10).map((person) => (
                <RecordCard
                  key={`${person.personType}-${person.id}`}
                  title={person.name}
                  subtitle={[person.personType, person.department, person.organizationName].filter(Boolean).join(' - ')}
                  meta={[person.lastKnownCheckpoint, person.lastActivityAt ? formatDateTime(person.lastActivityAt) : null].filter(Boolean).join(' - ')}
                  status={person.evacuationStatus}
                  tone="warning"
                />
              ))}
            </View>
          </SurfaceCard>
        ) : null}

        {canOperate ? (
          <SurfaceCard title="Live incident feed" subtitle="Immutable operational timeline for panic, suspicious activity, broadcasts, evacuation, and lockdown events.">
            <View style={styles.listStack}>
              {(feed.data ?? []).slice(0, 16).map((incident) => <IncidentRow key={incident.id} incident={incident} />)}
            </View>
          </SurfaceCard>
        ) : null}

        {!canOperate ? (
          <SurfaceCard title="Emergency alerts">
            <Text style={styles.bodyText}>Your workspace receives emergency broadcasts and lockdown alerts through banners and notifications.</Text>
          </SurfaceCard>
        ) : null}

        {actionMessage ? (
          <SurfaceCard title="Operational update">
            <StatusPill label="Recorded" tone={actionMessage.includes('required') ? 'warning' : 'success'} />
            <Text style={styles.bodyText}>{actionMessage}</Text>
          </SurfaceCard>
        ) : null}
      </AppScreen>

      <ReasonCaptureModal
        visible={Boolean(reasonAction)}
        title={reasonTitle(reasonAction)}
        helperText={reasonHelper(reasonAction)}
        confirmLabel={reasonConfirm(reasonAction)}
        minLength={reasonAction === 'panic' ? 4 : 8}
        loading={panicMutation.isPending
          || startLockdownMutation.isPending
          || clearLockdownMutation.isPending
          || flagVisitorMutation.isPending
          || flagWorkforceMutation.isPending}
        onCancel={() => setReasonAction(null)}
        onConfirm={submitReason}
      />
    </>
  );
}

function IncidentRow({ incident }: { incident: EmergencyIncident }) {
  return (
    <RecordCard
      title={incident.title}
      subtitle={[incident.message, incident.notes].filter(Boolean).join(' - ')}
      meta={[incident.checkpoint, incident.actorName, incident.createdAt ? formatDateTime(incident.createdAt) : null].filter(Boolean).join(' - ')}
      status={incident.severity}
      tone={incident.severity === 'CRITICAL' ? 'danger' : incident.severity === 'HIGH' ? 'warning' : 'default'}
    />
  );
}

function reasonTitle(action: ReasonAction | null) {
  switch (action) {
    case 'panic':
      return 'Confirm panic alert';
    case 'lockdown-start':
      return 'Start emergency lockdown';
    case 'lockdown-clear':
      return 'Clear emergency lockdown';
    case 'flag-visitor':
      return 'Flag suspicious visitor';
    case 'flag-workforce':
      return 'Flag suspicious workforce';
    default:
      return 'Record emergency action';
  }
}

function reasonHelper(action: ReasonAction | null) {
  switch (action) {
    case 'panic':
      return 'Record a short note. This dispatches a critical incident to security operations.';
    case 'lockdown-start':
      return 'Confirm the operational reason. This suspends visitor approvals and new check-ins in software only.';
    case 'lockdown-clear':
      return 'Record why the operational lockdown can be cleared.';
    default:
      return 'Record the security note. This creates an incident and audit trail.';
  }
}

function reasonConfirm(action: ReasonAction | null) {
  switch (action) {
    case 'panic':
      return 'Dispatch panic';
    case 'lockdown-start':
      return 'Start lockdown';
    case 'lockdown-clear':
      return 'Clear lockdown';
    case 'flag-visitor':
    case 'flag-workforce':
      return 'Create incident';
    default:
      return 'Submit';
  }
}

const styles = StyleSheet.create({
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  controlStack: {
    gap: theme.spacing.md,
  },
  splitPane: {
    gap: theme.spacing.md,
  },
  splitPaneWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  splitPaneColumn: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing.sm,
  },
  panicButton: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.5)',
    backgroundColor: theme.colors.danger,
    padding: theme.spacing.md,
  },
  panicButtonPressed: {
    opacity: 0.78,
  },
  panicCopy: {
    flex: 1,
    gap: 3,
  },
  panicTitle: {
    color: theme.colors.textInverse,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  panicBody: {
    color: theme.colors.textInverse,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 21,
  },
  actionGrid: {
    gap: theme.spacing.sm,
  },
  actionGridWide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  segment: {
    minHeight: 42,
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
  segmentDanger: {
    borderColor: 'rgba(248, 113, 113, 0.42)',
    backgroundColor: theme.colors.dangerSoft,
  },
  segmentLabel: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  segmentLabelActive: {
    color: theme.colors.textPrimary,
  },
  listStack: {
    gap: theme.spacing.sm,
  },
  bodyText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
});
