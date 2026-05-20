import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '../../theme';

type SnackbarTone = 'info' | 'success' | 'warning' | 'danger';

type SnackbarItem = {
  id: number;
  message: string;
  tone: SnackbarTone;
  durationMs: number;
};

type SnackbarInput = {
  message: string;
  tone?: SnackbarTone;
  durationMs?: number;
};

type SnackbarContextValue = {
  showSnackbar: (input: SnackbarInput | string) => void;
};

const SnackbarContext = createContext<SnackbarContextValue>({
  showSnackbar: () => undefined,
});

const DEFAULT_DURATION_MS = 2800;
const MAX_QUEUE_SIZE = 3;

export function OperationalSnackbarProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const nextIdRef = useRef(1);
  const translateY = useRef(new Animated.Value(88)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [queue, setQueue] = useState<SnackbarItem[]>([]);
  const [current, setCurrent] = useState<SnackbarItem | null>(null);

  const showSnackbar = useCallback((input: SnackbarInput | string) => {
    const item: SnackbarItem = {
      id: nextIdRef.current,
      message: typeof input === 'string' ? input : input.message,
      tone: typeof input === 'string' ? 'info' : input.tone ?? 'info',
      durationMs: typeof input === 'string' ? DEFAULT_DURATION_MS : input.durationMs ?? DEFAULT_DURATION_MS,
    };
    nextIdRef.current += 1;

    setQueue((existing) => [...existing.slice(-(MAX_QUEUE_SIZE - 1)), item]);
  }, []);

  useEffect(() => {
    if (!current && queue.length) {
      const [next, ...rest] = queue;
      setCurrent(next);
      setQueue(rest);
    }
  }, [current, queue]);

  useEffect(() => {
    if (!current) {
      return undefined;
    }

    translateY.setValue(88);
    opacity.setValue(0);

    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: 190,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start();

    const timeout = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 88,
          duration: 170,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 140,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setCurrent(null);
        }
      });
    }, current.durationMs);

    return () => clearTimeout(timeout);
  }, [current, opacity, translateY]);

  const contextValue = useMemo(() => ({ showSnackbar }), [showSnackbar]);
  const palette = current ? snackbarPalette(current.tone) : snackbarPalette('info');

  return (
    <SnackbarContext.Provider value={contextValue}>
      {children}
      {current ? (
        <View pointerEvents="box-none" style={[styles.host, { paddingBottom: insets.bottom + theme.spacing.sm }]}>
          <Animated.View
            style={[
              styles.snackbar,
              {
                borderColor: palette.borderColor,
                opacity,
                transform: [{ translateY }],
              },
            ]}
          >
            <View style={[styles.indicator, { backgroundColor: palette.accent }]} />
            <Text maxFontSizeMultiplier={1.12} numberOfLines={3} style={styles.message}>
              {current.message}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss notification"
              hitSlop={8}
              onPress={() => setCurrent(null)}
              style={styles.dismiss}
            >
              <Text allowFontScaling={false} style={styles.dismissText}>OK</Text>
            </Pressable>
          </Animated.View>
        </View>
      ) : null}
    </SnackbarContext.Provider>
  );
}

export function useOperationalSnackbar() {
  return useContext(SnackbarContext);
}

function snackbarPalette(tone: SnackbarTone) {
  switch (tone) {
    case 'success':
      return { accent: theme.colors.success, borderColor: 'rgba(74, 222, 128, 0.34)' };
    case 'warning':
      return { accent: theme.colors.warning, borderColor: 'rgba(245, 158, 11, 0.34)' };
    case 'danger':
      return { accent: theme.colors.danger, borderColor: 'rgba(248, 113, 113, 0.38)' };
    default:
      return { accent: theme.colors.info, borderColor: 'rgba(125, 211, 252, 0.30)' };
  }
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: theme.spacing.md,
    alignItems: 'center',
  },
  snackbar: {
    width: '100%',
    maxWidth: 620,
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    backgroundColor: '#111827',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    elevation: 18,
  },
  indicator: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: theme.radii.pill,
  },
  message: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    fontWeight: theme.typography.body.fontWeight,
    lineHeight: 21,
  },
  dismiss: {
    minHeight: 36,
    minWidth: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissText: {
    color: theme.colors.info,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: '800',
  },
});
