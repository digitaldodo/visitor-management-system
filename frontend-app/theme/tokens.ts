import { Platform } from 'react-native';

const baseShadow = Platform.select({
  android: {
    elevation: 2,
  },
  default: {
    shadowColor: '#11212F',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
  },
});

export const theme = {
  colors: {
    canvas: '#F4F7FB',
    surface: '#FFFFFF',
    surfaceMuted: '#EEF3F8',
    primary: '#0E5A8A',
    primarySoft: '#D8EBF7',
    success: '#1F7A4D',
    successSoft: '#DAF3E6',
    warning: '#A35F12',
    warningSoft: '#FAE9D2',
    danger: '#A5352B',
    dangerSoft: '#F8DDD9',
    info: '#2D4B6A',
    infoSoft: '#DFE9F4',
    border: '#D5DDE6',
    textPrimary: '#142230',
    textSecondary: '#5A6B7E',
    textMuted: '#7C8B9C',
    textInverse: '#FFFFFF',
  },
  spacing: {
    xs: 6,
    sm: 10,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
  },
  radii: {
    sm: 10,
    md: 16,
    lg: 20,
    xl: 28,
    pill: 999,
  },
  typography: {
    caption: {
      fontSize: 12,
      fontWeight: '700' as const,
    },
    body: {
      fontSize: 15,
      fontWeight: '500' as const,
    },
    bodyStrong: {
      fontSize: 16,
      fontWeight: '700' as const,
    },
    title: {
      fontSize: 24,
      fontWeight: '800' as const,
    },
    heading: {
      fontSize: 20,
      fontWeight: '800' as const,
    },
    metric: {
      fontSize: 28,
      fontWeight: '800' as const,
    },
  },
  shadows: {
    card: baseShadow ?? {},
  },
};
