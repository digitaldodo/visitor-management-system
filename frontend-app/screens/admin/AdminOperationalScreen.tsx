import { StyleSheet, Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '../../auth/AuthProvider';
import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { MetricCard } from '../../components/cards/MetricCard';
import { RecordCard } from '../../components/cards/RecordCard';
import { AppScreen } from '../../components/layout/AppScreen';
import { NotificationCenter } from '../../components/notifications/NotificationCenter';
import { useAdminOverview, useAdminReports, useAdminWorkforceOnboarding } from '../../hooks/useAdminWorkspace';
import { useNotificationsQuery } from '../../hooks/useNotificationsQuery';
import { markAllNotificationsRead, markNotificationRead } from '../../services/notificationService';
import { useOperationalRuntime } from '../../runtime/OperationalRuntimeProvider';
import type { NotificationRecord } from '../../types/domain';
import { theme } from '../../theme';

export function AdminOperationalScreen() {
  const { session, logout, isBusy } = useAuth();
  const queryClient = useQueryClient();
  const { localNotifications, markLocalNotificationRead } = useOperationalRuntime();
  const overview = useAdminOverview();
  const reports = useAdminReports();
  const workforceOnboarding = useAdminWorkforceOnboarding();
  const notifications = useNotificationsQuery(16);
  const markReadMutation = useMutation({ mutationFn: markNotificationRead });
  const markAllReadMutation = useMutation({ mutationFn: markAllNotificationsRead });

  const refreshWorkspace = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin'] }),
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

  return (
    <AppScreen
      title="Admin operations"
      subtitle="Lightweight mobile visibility for urgent approvals, critical alerts, and top-line operational health while the web dashboard remains the primary control surface."
      refreshing={overview.isRefetching || reports.isRefetching || workforceOnboarding.isRefetching || notifications.isRefetching}
      onRefresh={() => {
        void overview.refetch();
        void reports.refetch();
        void workforceOnboarding.refetch();
        void notifications.refetch();
      }}
    >
      <View style={styles.metricsGrid}>
        <MetricCard label="Pending approvals" value={workforceOnboarding.data?.length ?? 0} tone={(workforceOnboarding.data?.length ?? 0) ? 'warning' : 'success'} />
        <MetricCard label="Critical alerts" value={(notifications.data?.items ?? []).filter((item) => item.priority === 'CRITICAL').length} tone={(notifications.data?.items ?? []).some((item) => item.priority === 'CRITICAL') ? 'danger' : 'default'} />
        <MetricCard label="Pending visitors" value={Number(overview.data?.metrics?.pending ?? 0)} tone={Number(overview.data?.metrics?.pending ?? 0) ? 'warning' : 'default'} />
      </View>

      <View style={styles.summarySection}>
        <RecordCard
          title={session?.user.fullName || 'Admin operator'}
          subtitle={[session?.user.organizationCode || 'Platform scope', session?.user.email].filter(Boolean).join(' · ')}
          meta="Mobile admin is intentionally summary-focused in this phase."
          status={session?.user.activeRole || 'ADMIN'}
          tone="info"
        />
        {(workforceOnboarding.data ?? []).slice(0, 3).map((entry) => (
          <RecordCard
            key={entry.id}
            title={entry.fullName}
            subtitle={[entry.department, entry.designation].filter(Boolean).join(' · ') || 'Pending workforce onboarding'}
            meta={entry.workforceOnboardingCreatedAt || 'Submitted recently'}
            status="Approval needed"
            tone="warning"
          />
        ))}
        {(reports.data ?? []).slice(0, 3).map((report, index) => (
          <RecordCard
            key={`${report.title}-${index}`}
            title={report.title}
            subtitle={report.status}
            status="Oversight"
            tone="default"
          />
        ))}
      </View>

      <NotificationCenter
        title="Critical visibility"
        subtitle="Admins only see urgent approvals, critical operational events, and system-level issues on mobile."
        inbox={notifications.data}
        localNotifications={localNotifications.filter((item) => ['SYSTEM', 'SECURITY', 'WORKFORCE'].includes(String(item.category || '').toUpperCase()))}
        onMarkRead={markRead}
        onMarkAllRead={async () => {
          await markAllReadMutation.mutateAsync();
          await refreshWorkspace();
        }}
        onMarkLocalRead={markLocalNotificationRead}
        loading={markAllReadMutation.isPending}
      />

      <View style={styles.footerSection}>
        <Text style={styles.footerText}>Web remains the primary admin workspace for deep management, analytics, and broad operational control.</Text>
        <PrimaryButton label="Log out" onPress={() => void logout()} tone="secondary" disabled={isBusy} />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  summarySection: {
    gap: theme.spacing.sm,
  },
  footerSection: {
    gap: theme.spacing.md,
  },
  footerText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
});
