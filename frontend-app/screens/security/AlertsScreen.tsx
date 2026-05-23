import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { MetricCard } from '../../components/cards/MetricCard';
import { RecordCard } from '../../components/cards/RecordCard';
import { AppScreen } from '../../components/layout/AppScreen';
import { NotificationCenter } from '../../components/notifications/NotificationCenter';
import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { SurfaceCard } from '../../components/cards/SurfaceCard';
import { useNotificationsQuery } from '../../hooks/useNotificationsQuery';
import { useSecurityMonitoring } from '../../hooks/useSecurityWorkspace';
import { markAllNotificationsRead, markNotificationRead } from '../../services/notificationService';
import { shareOperationalReport } from '../../services/operationalExportService';
import { useOperationalRuntime } from '../../runtime/OperationalRuntimeProvider';
import { theme } from '../../theme';
import type { NotificationRecord } from '../../types/domain';
import { formatDateTime, statusTone, visitorStatusLabel } from '../../utils/securityFormatting';

export function AlertsScreen() {
  const queryClient = useQueryClient();
  const { localNotifications, markLocalNotificationRead } = useOperationalRuntime();
  const monitoring = useSecurityMonitoring();
  const notifications = useNotificationsQuery(20);
  const markReadMutation = useMutation({ mutationFn: markNotificationRead });
  const markAllReadMutation = useMutation({ mutationFn: markAllNotificationsRead });
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportingType, setExportingType] = useState<string | null>(null);

  const securityItems = useMemo(
    () => (notifications.data?.items ?? []).filter((item) => ['SECURITY', 'VISITOR', 'WORKFORCE'].includes(String(item.category || '').toUpperCase())),
    [notifications.data?.items],
  );
  const localSecurityItems = useMemo(
    () => localNotifications.filter((item) => ['SECURITY', 'VISITOR', 'WORKFORCE'].includes(String(item.category || '').toUpperCase())),
    [localNotifications],
  );

  const deniedCount = monitoring.data?.rejectedVisitors.length ?? 0;
  const suspiciousCount = securityItems.filter((item) => String(item.type || '').includes('SUSPICIOUS')).length;
  const invalidCredentialCount = securityItems.filter((item) => String(item.type || '').includes('CREDENTIAL')).length;

  const refreshWorkspace = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['security', 'monitoring'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    ]);
  };

  const markRead = async (notification: NotificationRecord) => {
    if (notification.read) {
      return;
    }
    await markReadMutation.mutateAsync(notification.id);
    await refreshWorkspace();
  };

  const exportSecurityReport = async (reportType: string, format: 'CSV' | 'PDF') => {
    setExportingType(`${reportType}:${format}`);
    try {
      const report = await shareOperationalReport({ role: 'SECURITY_GUARD', reportType, format });
      setExportMessage(`${report.title} ${format} export generated.`);
    } catch {
      setExportMessage('Security report export could not be generated on this device.');
    } finally {
      setExportingType(null);
    }
  };

  return (
    <AppScreen
      title="Alert Center"
      subtitle="Security-focused awareness for denied entries, suspicious activity, invalid credentials, and escalation events."
      refreshing={monitoring.isRefetching || notifications.isRefetching}
      onRefresh={() => Promise.all([monitoring.refetch(), notifications.refetch()])}
    >
      <View style={styles.metricGrid}>
        <MetricCard label="Denied scans" value={deniedCount} tone={deniedCount ? 'danger' : 'default'} />
        <MetricCard label="Suspicious" value={suspiciousCount} tone={suspiciousCount ? 'warning' : 'default'} />
        <MetricCard label="Invalid creds" value={invalidCredentialCount} tone={invalidCredentialCount ? 'warning' : 'default'} />
      </View>

      <View style={styles.alertSection}>
        {monitoring.data?.rejectedVisitors.slice(0, 4).map((visitor) => (
          <RecordCard
            key={`denied-${visitor.id}`}
            title={visitor.fullName}
            subtitle={visitor.rejectionReason || visitor.companyName || 'Denied at checkpoint'}
            meta={visitor.updatedAt ? formatDateTime(visitor.updatedAt) : null}
            status={visitorStatusLabel(visitor.status)}
            tone={statusTone(visitor.status)}
          />
        ))}
        {monitoring.data?.suspendedVisitors.slice(0, 3).map((visitor) => (
          <RecordCard
            key={`suspended-${visitor.id}`}
            title={visitor.fullName}
            subtitle={visitor.suspensionReason || 'Recurring access suspended'}
            meta={visitor.updatedAt ? formatDateTime(visitor.updatedAt) : null}
            status={visitorStatusLabel(visitor.status)}
            tone="warning"
          />
        ))}
      </View>

      <SurfaceCard title="Security exports" subtitle="Lightweight CSV/PDF reports for incident, denied-entry, checkpoint, and operational review.">
        {exportMessage ? <Text style={styles.exportMessage}>{exportMessage}</Text> : null}
        <View style={styles.exportGrid}>
          {SECURITY_EXPORTS.map((item) => (
            <View key={item.reportType} style={styles.exportCard}>
              <RecordCard title={item.title} subtitle={item.subtitle} status="Export" tone="info" />
              <View style={styles.exportActions}>
                <PrimaryButton
                  label="CSV"
                  tone="secondary"
                  onPress={() => void exportSecurityReport(item.reportType, 'CSV')}
                  loading={exportingType === `${item.reportType}:CSV`}
                />
                <PrimaryButton
                  label="PDF"
                  tone="secondary"
                  onPress={() => void exportSecurityReport(item.reportType, 'PDF')}
                  loading={exportingType === `${item.reportType}:PDF`}
                />
              </View>
            </View>
          ))}
        </View>
      </SurfaceCard>

      <NotificationCenter
        title="Recent alerts"
        subtitle="Prioritized operational notifications stay grouped to reduce noise while keeping checkpoint visibility high."
        inbox={{
          unreadCount: securityItems.filter((item) => !item.read).length,
          items: securityItems,
        }}
        localNotifications={localSecurityItems}
        onMarkRead={markRead}
        onMarkAllRead={async () => {
          await markAllReadMutation.mutateAsync();
          await refreshWorkspace();
        }}
        onMarkLocalRead={markLocalNotificationRead}
        loading={markAllReadMutation.isPending}
      />
    </AppScreen>
  );
}

const SECURITY_EXPORTS = [
  { reportType: 'incident-report', title: 'Security Incident Report', subtitle: 'Emergency, suspicious activity, and escalation records.' },
  { reportType: 'denied-entry-report', title: 'Denied Entry Report', subtitle: 'Rejected access and denied checkpoint outcomes.' },
  { reportType: 'checkpoint-activity', title: 'Checkpoint Activity Report', subtitle: 'Recent operational audit trail for checkpoint review.' },
] as const;

const styles = StyleSheet.create({
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  alertSection: {
    gap: theme.spacing.sm,
  },
  exportGrid: {
    gap: theme.spacing.sm,
  },
  exportCard: {
    gap: theme.spacing.sm,
  },
  exportActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  exportMessage: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
});
