import { StyleSheet, Text, View } from 'react-native';

import { MetricCard } from '../../components/cards/MetricCard';
import { RecordCard } from '../../components/cards/RecordCard';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { EmptyState } from '../../components/feedback/EmptyState';
import { StatusPill } from '../../components/feedback/StatusPill';
import { AppScreen } from '../../components/layout/AppScreen';
import { OperationalFieldList } from '../../components/security/OperationalFieldList';
import { useEmployeeAttendance } from '../../hooks/useEmployeeWorkspace';
import { theme } from '../../theme';
import { derivePresenceState, formatDateTime, formatShift, formatStatusLabel } from '../../utils/employeeFormatting';

export function PresenceScreen() {
  const attendance = useEmployeeAttendance();
  const records = attendance.data ?? [];
  const latestRecord = records[0];
  const summary = derivePresenceState(records);

  return (
    <AppScreen
      title="Presence"
      subtitle="Security-focused visibility into your latest access activity, checkpoint state, and recent entry history."
      refreshing={attendance.isRefetching}
      onRefresh={() => attendance.refetch()}
    >
      <View style={styles.metricsGrid}>
        <MetricCard label="Presence state" value={summary.currentState} tone={latestRecord?.state === 'IN' ? 'success' : 'default'} />
        <MetricCard label="Logs loaded" value={records.length} tone="default" />
        <MetricCard label="Late flags" value={records.filter((entry) => entry.late).length} tone={records.some((entry) => entry.late) ? 'warning' : 'success'} />
      </View>

      <SurfaceCard title="Current access posture" subtitle="A lightweight employee view only. No productivity scoring, HR analytics, or surveillance signals.">
        <StatusPill label={summary.status} tone={latestRecord?.late ? 'warning' : latestRecord?.state === 'IN' ? 'success' : 'info'} />
        <OperationalFieldList
          items={[
            { label: 'Current state', value: summary.currentState },
            { label: 'Last check-in', value: summary.lastCheckIn ? formatDateTime(summary.lastCheckIn, latestRecord?.timezone) : 'Not yet' },
            { label: 'Last check-out', value: summary.lastCheckOut ? formatDateTime(summary.lastCheckOut, latestRecord?.timezone) : 'Not yet' },
            { label: 'Timezone', value: latestRecord?.timezone || 'Organization default' },
            { label: 'Shift', value: formatShift(latestRecord?.shiftName, latestRecord?.shiftStartTime, latestRecord?.shiftEndTime) },
            { label: 'Last action', value: latestRecord?.lastAction ? formatStatusLabel(latestRecord.lastAction) : 'No recent action' },
          ]}
        />
      </SurfaceCard>

      <SurfaceCard title="Access activity history" subtitle="Recent check-ins, check-outs, and override context recorded by the access system.">
        {records.length ? (
          records.map((entry) => (
            <View key={entry.id} style={styles.historyCard}>
              <RecordCard
                title={entry.attendanceDate || formatDateTime(entry.createdAt, entry.timezone)}
                subtitle={[entry.department, entry.designation].filter(Boolean).join(' · ')}
                meta={[
                  entry.checkInTime ? `In ${formatDateTime(entry.checkInTime, entry.timezone)}` : null,
                  entry.checkOutTime ? `Out ${formatDateTime(entry.checkOutTime, entry.timezone)}` : null,
                ].filter(Boolean).join(' · ')}
                status={entry.status ? formatStatusLabel(entry.status) : entry.state || 'Recorded'}
                tone={entry.late ? 'warning' : entry.state === 'IN' ? 'success' : 'info'}
              />
              <OperationalFieldList
                items={[
                  { label: 'Presence', value: entry.state === 'IN' ? 'On site' : 'Off site' },
                  { label: 'Guard assist', value: entry.securityGuardName || 'Static QR self-service' },
                  { label: 'Action', value: entry.lastAction ? formatStatusLabel(entry.lastAction) : 'Logged' },
                  { label: 'Override note', value: entry.overrideReason || 'No override reason recorded' },
                ]}
              />
            </View>
          ))
        ) : (
          <EmptyState
            title="No presence history yet"
            body="Your attendance and access history will appear here after the first checkpoint scan or security-assisted presence event."
          />
        )}
      </SurfaceCard>

      {latestRecord?.late ? (
        <SurfaceCard title="Access note">
          <Text style={styles.bodyText}>
            Your latest entry was flagged as late by the backend shift rules. This screen only mirrors the security state and does not create attendance analytics.
          </Text>
        </SurfaceCard>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  historyCard: {
    gap: theme.spacing.md,
  },
  bodyText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
});
