import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '../buttons/PrimaryButton';
import { EmptyState } from '../feedback/EmptyState';
import { StatusPill } from '../feedback/StatusPill';
import { SurfaceCard } from '../cards/SurfaceCard';
import { useAuth } from '../../auth/AuthProvider';
import { openOperationalDeepLink } from '../../runtime/operationalDeepLinks';
import { theme } from '../../theme';
import { useLocalization } from '../../localization/LocalizationProvider';
import type { NotificationInbox, NotificationRecord } from '../../types/domain';

type Props = {
  title: string;
  subtitle: string;
  inbox?: NotificationInbox | null;
  localNotifications?: NotificationRecord[];
  onMarkRead?: (notification: NotificationRecord) => Promise<void> | void;
  onMarkAllRead?: () => Promise<void> | void;
  onMarkLocalRead?: (notificationId: string) => void;
  loading?: boolean;
};

const CATEGORY_ORDER = ['SECURITY', 'VISITOR', 'WORKFORCE', 'SYSTEM'];

export function NotificationCenter({
  title,
  subtitle,
  inbox,
  localNotifications = [],
  onMarkRead,
  onMarkAllRead,
  onMarkLocalRead,
  loading,
}: Props) {
  const { tText } = useLocalization();
  const auth = useAuth();
  const activeRole = auth.status === 'authenticated' ? auth.session.user.activeRole : null;
  const mergedItems = useMemo(() => {
    const combined = [...(localNotifications ?? []), ...(inbox?.items ?? [])];
    return combined
      .map((item) => ({ ...item, source: item.source ?? 'backend' as const }))
      .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime());
  }, [inbox?.items, localNotifications]);

  const groupedItems = useMemo(() => {
    return CATEGORY_ORDER.map((category) => ({
      category,
      items: mergedItems.filter((item) => String(item.category || 'VISITOR').toUpperCase() === category),
    })).filter((group) => group.items.length);
  }, [mergedItems]);

  const unreadCount = mergedItems.filter((item) => !item.read).length;

  const handlePress = async (notification: NotificationRecord) => {
    if (notification.source === 'local') {
      onMarkLocalRead?.(notification.id);
      if (activeRole) {
        openOperationalDeepLink(activeRole, notification);
      }
      return;
    }
    await onMarkRead?.(notification);
    if (activeRole) {
      openOperationalDeepLink(activeRole, notification);
    }
  };

  return (
    <SurfaceCard title={title} subtitle={subtitle}>
      <View style={styles.controls}>
        <StatusPill label={unreadCount ? tText('{count} unread', { count: unreadCount }) : 'All caught up'} tone={unreadCount ? 'warning' : 'success'} />
        {onMarkAllRead ? (
          <PrimaryButton
            label="Mark all read"
            onPress={() => {
              void onMarkAllRead();
              localNotifications.filter((item) => !item.read).forEach((item) => onMarkLocalRead?.(item.id));
            }}
            tone="secondary"
            loading={loading}
            disabled={!unreadCount}
          />
        ) : null}
      </View>

      {groupedItems.length ? (
        groupedItems.map((group) => (
          <View key={group.category} style={styles.group}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupTitle}>{tText(humanize(group.category))}</Text>
              <Text style={styles.groupMeta}>{tText('{count} items', { count: group.items.length })}</Text>
            </View>
            {group.items.map((notification) => (
              <Pressable
                key={notification.id}
                accessibilityRole="button"
                onPress={() => void handlePress(notification)}
                style={({ pressed }) => [
                  styles.notificationCard,
                  notification.read ? styles.readCard : styles.unreadCard,
                  pressed ? styles.pressedCard : null,
                ]}
              >
                <View style={styles.notificationHeader}>
                  <View style={styles.copyBlock}>
                    <Text style={styles.notificationTitle}>{notification.title}</Text>
                    <Text style={styles.notificationMessage}>{notification.message}</Text>
                  </View>
                  <StatusPill label={notification.read ? 'Read' : notification.priority || 'New'} tone={priorityTone(notification)} />
                </View>

                <View style={styles.metaRow}>
                  <Text style={styles.metaText}>
                    {[notification.actorName, notification.visitorName].filter(Boolean).join(' · ') || tText('Operational update')}
                  </Text>
                  <Text style={styles.metaText}>{formatTimestamp(notification.createdAt, notification.organizationTimezone)}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ))
      ) : (
        <EmptyState
          title="No operational notifications"
          body="Approvals, arrivals, access revocations, security alerts, and account updates will appear here."
        />
      )}
    </SurfaceCard>
  );
}

function priorityTone(notification: NotificationRecord): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  const priority = String(notification.priority || '').toUpperCase();
  const category = String(notification.category || '').toUpperCase();

  if (priority === 'CRITICAL') {
    return 'danger';
  }
  if (priority === 'HIGH' || category === 'SECURITY') {
    return 'warning';
  }
  if (category === 'SYSTEM') {
    return 'info';
  }
  return notification.read ? 'default' : 'success';
}

function humanize(value: string) {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatTimestamp(value?: string | null, timezone?: string | null) {
  if (!value) {
    return 'Just now';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Just now';
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone || undefined,
    }).format(parsed);
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(parsed);
  }
}

const styles = StyleSheet.create({
  controls: {
    gap: theme.spacing.sm,
  },
  group: {
    gap: theme.spacing.sm,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    alignItems: 'center',
  },
  groupTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  groupMeta: {
    color: theme.colors.textMuted,
    fontSize: 13,
  },
  notificationCard: {
    gap: theme.spacing.sm,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    padding: theme.spacing.md,
  },
  unreadCard: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.primaryLine,
  },
  readCard: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
  },
  pressedCard: {
    opacity: 0.84,
  },
  notificationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  copyBlock: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  notificationTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  notificationMessage: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  metaText: {
    flex: 1,
    color: theme.colors.textMuted,
    fontSize: 13,
  },
});
