import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import type { VisitorReschedulePayload } from '../../services/employeeService';
import type { VisitorRecord } from '../../types/domain';
import { theme } from '../../theme';
import { formatDateTime } from '../../utils/employeeFormatting';
import { PrimaryButton } from '../buttons/PrimaryButton';
import { AppTextField } from '../form/AppTextField';
import { KeyboardAwareScreen } from '../layout/KeyboardAwareScreen';

type Props = {
  visible: boolean;
  visitor: VisitorRecord | null;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (payload: VisitorReschedulePayload) => Promise<void> | void;
};

function buildInitialStart(visitor: VisitorRecord | null) {
  const scheduledStart = visitor?.scheduledStartTime || visitor?.accessWindowStartTime;
  if (scheduledStart) {
    const parsed = new Date(scheduledStart);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date(Date.now() + 60 * 60 * 1000);
}

function buildInitialEnd(visitor: VisitorRecord | null, start: Date) {
  const scheduledEnd = visitor?.scheduledEndTime || visitor?.accessWindowEndTime;
  if (scheduledEnd) {
    const parsed = new Date(scheduledEnd);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date(start.getTime() + 60 * 60 * 1000);
}

export function EmployeeRescheduleModal({ visible, visitor, loading, onCancel, onConfirm }: Props) {
  const [startAt, setStartAt] = useState<Date>(() => buildInitialStart(null));
  const [endAt, setEndAt] = useState<Date>(() => buildInitialEnd(null, new Date(Date.now() + 60 * 60 * 1000)));
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!visible) {
      setNote('');
      setSubmitted(false);
      return;
    }

    const initialStart = buildInitialStart(visitor);
    setStartAt(initialStart);
    setEndAt(buildInitialEnd(visitor, initialStart));
    setNote('');
    setSubmitted(false);
  }, [visible, visitor]);

  const timezone = visitor?.organizationTimezone || visitor?.scheduledTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const durationMinutes = useMemo(() => Math.max(0, Math.round((endAt.getTime() - startAt.getTime()) / 60_000)), [endAt, startAt]);
  const hasInvalidRange = durationMinutes < 15;

  const updateDate = (target: 'start' | 'end', nextValue: Date) => {
    if (target === 'start') {
      setStartAt((currentStart) => {
        const updated = mergeDate(currentStart, nextValue);
        setEndAt((currentEnd) => {
          const nextEnd = currentEnd.getTime() <= updated.getTime() ? new Date(updated.getTime() + 60 * 60 * 1000) : currentEnd;
          return mergeDate(nextEnd, nextEnd);
        });
        return updated;
      });
      return;
    }

    setEndAt((currentEnd) => mergeDate(currentEnd, nextValue));
  };

  const updateTime = (target: 'start' | 'end', nextValue: Date) => {
    if (target === 'start') {
      setStartAt((currentStart) => {
        const updated = mergeTime(currentStart, nextValue);
        setEndAt((currentEnd) => {
          const nextEnd = currentEnd.getTime() <= updated.getTime() ? new Date(updated.getTime() + 60 * 60 * 1000) : currentEnd;
          return nextEnd;
        });
        return updated;
      });
      return;
    }

    setEndAt((currentEnd) => mergeTime(currentEnd, nextValue));
  };

  const openAndroidPicker = (target: 'start' | 'end', mode: 'date' | 'time') => {
    const value = target === 'start' ? startAt : endAt;
    DateTimePickerAndroid.open({
      value,
      mode,
      is24Hour: false,
      onChange: (event, selectedDate) => {
        if (event.type !== 'set' || !selectedDate) {
          return;
        }

        if (mode === 'date') {
          updateDate(target, selectedDate);
          return;
        }

        updateTime(target, selectedDate);
      },
    });
  };

  return (
    <Modal animationType="slide" visible={visible} transparent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <KeyboardAwareScreen alwaysBounceVertical={false} contentContainerStyle={styles.sheetContainer}>
          <View style={styles.sheet}>
            <Text style={styles.title}>Reschedule visit</Text>
            <Text style={styles.helper}>
              Keep the access window accurate for security. AccessFlow keeps visitor validity, QR timing, and role checks aligned.
            </Text>

            <View style={styles.windowSummary}>
              <Text style={styles.windowLabel}>Timezone</Text>
              <Text style={styles.windowValue}>{timezone}</Text>
            </View>

            <View style={styles.datetimeSection}>
              <Text style={styles.sectionTitle}>Start time</Text>
              <View style={styles.datetimeActions}>
                <PrimaryButton label={formatDate(startAt)} onPress={() => openDatePicker('start')} tone="secondary" />
                <PrimaryButton label={formatClock(startAt)} onPress={() => openTimePicker('start')} tone="secondary" />
              </View>
              <Text style={styles.inlineHelp}>Selected: {formatDateTime(startAt.toISOString(), timezone)}</Text>
            </View>

            <View style={styles.datetimeSection}>
              <Text style={styles.sectionTitle}>End time</Text>
              <View style={styles.datetimeActions}>
                <PrimaryButton label={formatDate(endAt)} onPress={() => openDatePicker('end')} tone="secondary" />
                <PrimaryButton label={formatClock(endAt)} onPress={() => openTimePicker('end')} tone="secondary" />
              </View>
              <Text style={styles.inlineHelp}>Access window: {formatDateTime(endAt.toISOString(), timezone)}</Text>
            </View>

            {Platform.OS !== 'android' ? (
              <View style={styles.inlinePickers}>
                <View style={styles.pickerBlock}>
                  <Text style={styles.inlinePickerLabel}>Start</Text>
                  <DateTimePicker value={startAt} mode="datetime" onChange={(_, value) => value ? setStartAt(value) : undefined} />
                </View>
                <View style={styles.pickerBlock}>
                  <Text style={styles.inlinePickerLabel}>End</Text>
                  <DateTimePicker value={endAt} mode="datetime" onChange={(_, value) => value ? setEndAt(value) : undefined} />
                </View>
              </View>
            ) : null}

            <View style={styles.windowSummary}>
              <Text style={styles.windowLabel}>Duration</Text>
              <Text style={styles.windowValue}>{durationMinutes} min</Text>
            </View>

            <AppTextField
              label="Reschedule note"
              multiline
              value={note}
              onChangeText={setNote}
              placeholder="Optional context for the visitor, front desk, or security desk."
              errorText={submitted && hasInvalidRange ? 'Choose an end time at least 15 minutes after the start.' : undefined}
            />

            <View style={styles.actions}>
              <PrimaryButton label="Cancel" onPress={onCancel} tone="secondary" />
              <PrimaryButton
                label="Update visit"
                onPress={async () => {
                  setSubmitted(true);
                  if (hasInvalidRange) {
                    return;
                  }

                  await onConfirm({
                    scheduledStartTime: startAt.toISOString(),
                    scheduledEndTime: endAt.toISOString(),
                    expectedDurationMinutes: durationMinutes,
                    timezone,
                    note: note.trim() || null,
                  });
                }}
                loading={loading}
              />
            </View>
          </View>
        </KeyboardAwareScreen>
      </View>
    </Modal>
  );

  function openDatePicker(target: 'start' | 'end') {
    if (Platform.OS === 'android') {
      openAndroidPicker(target, 'date');
    }
  }

  function openTimePicker(target: 'start' | 'end') {
    if (Platform.OS === 'android') {
      openAndroidPicker(target, 'time');
    }
  }
}

function mergeDate(original: Date, nextDate: Date) {
  const updated = new Date(original);
  updated.setFullYear(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate());
  return updated;
}

function mergeTime(original: Date, nextTime: Date) {
  const updated = new Date(original);
  updated.setHours(nextTime.getHours(), nextTime.getMinutes(), 0, 0);
  return updated;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(value);
}

function formatClock(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(value);
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: theme.colors.overlay,
  },
  sheetContainer: {
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    gap: theme.spacing.md,
    borderTopLeftRadius: theme.radii.xl,
    borderTopRightRadius: theme.radii.xl,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.heading.fontSize,
    fontWeight: theme.typography.heading.fontWeight,
  },
  helper: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body.fontSize,
    lineHeight: 22,
  },
  windowSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.md,
  },
  windowLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  windowValue: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  datetimeSection: {
    gap: theme.spacing.sm,
  },
  sectionTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  datetimeActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  inlineHelp: {
    color: theme.colors.textSecondary,
    fontSize: 13,
  },
  inlinePickers: {
    gap: theme.spacing.md,
  },
  pickerBlock: {
    gap: theme.spacing.xs,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.sm,
  },
  inlinePickerLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
});
