import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '../../theme';

type ArrivalTimeSelectorProps = {
  value: Date;
  durationMinutes: string;
  timezone: string;
  onChange: (value: Date) => void;
  onDurationChange: (value: string) => void;
};

const durationOptions = ['30', '60', '90'];

export function ArrivalTimeSelector({
  value,
  durationMinutes,
  timezone,
  onChange,
  onDurationChange,
}: ArrivalTimeSelectorProps) {
  const duration = Number(durationMinutes) || 60;
  const accessEndsAt = new Date(value.getTime() + duration * 60_000);

  const openAndroidPicker = (mode: 'date' | 'time') => {
    DateTimePickerAndroid.open({
      value,
      mode,
      is24Hour: false,
      minimumDate: new Date(),
      onChange: (event, selectedDate) => {
        if (event.type !== 'set' || !selectedDate) {
          return;
        }

        onChange(mode === 'date' ? mergeDate(value, selectedDate) : mergeTime(value, selectedDate));
      },
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerIcon}>
          <Ionicons name="time-outline" size={18} color={theme.colors.info} />
        </View>
        <View style={styles.headerCopy}>
          <Text maxFontSizeMultiplier={1.08} style={styles.title}>Arrival</Text>
          <Text maxFontSizeMultiplier={1.08} style={styles.summary}>
            {formatDateTime(value, timezone)} to {formatClock(accessEndsAt, timezone)}
          </Text>
        </View>
      </View>

      <View style={styles.quickGrid}>
        {quickOptions().map((option) => (
          <Pressable
            key={option.label}
            accessibilityRole="button"
            onPress={() => onChange(option.value)}
            android_ripple={{ color: theme.colors.primarySoft }}
            style={({ pressed }) => [styles.quickChip, pressed ? styles.pressed : null]}
          >
            <Text maxFontSizeMultiplier={1.05} style={styles.quickChipText}>{option.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.pickerRow}>
        <PickerButton icon="calendar-outline" label={formatDate(value, timezone)} onPress={() => openDatePicker()} />
        <PickerButton icon="time-outline" label={formatClock(value, timezone)} onPress={() => openTimePicker()} />
      </View>

      {Platform.OS !== 'android' ? (
        <DateTimePicker
          value={value}
          mode="datetime"
          minimumDate={new Date()}
          onChange={(_, selectedDate) => selectedDate ? onChange(selectedDate) : undefined}
        />
      ) : null}

      <View style={styles.durationRow}>
        <Text maxFontSizeMultiplier={1.05} style={styles.durationLabel}>Access window</Text>
        <View style={styles.durationChips}>
          {durationOptions.map((option) => {
            const selected = option === durationMinutes;
            return (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onDurationChange(option)}
                style={[styles.durationChip, selected ? styles.durationChipSelected : null]}
              >
                <Text style={[styles.durationChipText, selected ? styles.durationChipTextSelected : null]}>{option} min</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );

  function openDatePicker() {
    if (Platform.OS === 'android') {
      openAndroidPicker('date');
    }
  }

  function openTimePicker() {
    if (Platform.OS === 'android') {
      openAndroidPicker('time');
    }
  }
}

export function nearestArrivalTime(offsetMinutes = 30) {
  const next = new Date(Date.now() + offsetMinutes * 60_000);
  const remainder = next.getMinutes() % 15;
  if (remainder) {
    next.setMinutes(next.getMinutes() + (15 - remainder));
  }
  next.setSeconds(0, 0);
  return next;
}

function quickOptions() {
  const now = new Date();
  const todayAfternoon = new Date(now);
  todayAfternoon.setHours(14, 0, 0, 0);
  const tomorrowMorning = new Date(now);
  tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
  tomorrowMorning.setHours(9, 0, 0, 0);

  const options = [
    { label: 'Now', value: new Date() },
    { label: 'In 30 mins', value: nearestArrivalTime(30) },
    { label: 'Tomorrow Morning', value: tomorrowMorning },
  ];

  if (todayAfternoon.getTime() > now.getTime()) {
    options.splice(2, 0, { label: 'Today Afternoon', value: todayAfternoon });
  }

  return options;
}

function PickerButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      android_ripple={{ color: theme.colors.primarySoft }}
      style={({ pressed }) => [styles.pickerButton, pressed ? styles.pressed : null]}
    >
      <Ionicons name={icon} size={18} color={theme.colors.textPrimary} />
      <Text maxFontSizeMultiplier={1.05} numberOfLines={1} style={styles.pickerButtonText}>{label}</Text>
    </Pressable>
  );
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

function formatDate(value: Date, timezone: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: timezone,
  }).format(value);
}

function formatClock(value: Date, timezone: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  }).format(value);
}

function formatDateTime(value: Date, timezone: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  }).format(value);
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.infoSoft,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.bodyStrong.fontSize,
    fontWeight: theme.typography.bodyStrong.fontWeight,
  },
  summary: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  quickChip: {
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.primaryLine,
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: theme.spacing.md,
  },
  quickChipText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  pickerRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  pickerButton: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
    paddingHorizontal: theme.spacing.sm,
  },
  pickerButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  durationRow: {
    gap: theme.spacing.sm,
  },
  durationLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  durationChips: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  durationChip: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
  },
  durationChipSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft,
  },
  durationChipText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
  },
  durationChipTextSelected: {
    color: theme.colors.textPrimary,
  },
  pressed: {
    opacity: 0.82,
  },
});
