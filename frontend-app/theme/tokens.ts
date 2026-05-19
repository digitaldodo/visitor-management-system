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
    canvas: '#07111D',
    surface: '#0E1C2A',
    surfaceMuted: '#14283A',
    primary: '#2F8FC3',
    primarySoft: '#123A55',
    success: '#67D49B',
    successSoft: '#123323',
    warning: '#F0B35F',
    warningSoft: '#3A2A12',
    danger: '#F07B72',
    dangerSoft: '#3A1718',
    info: '#9FC6E4',
    infoSoft: '#132A3F',
    border: '#24384D',
    textPrimary: '#EAF2FA',
    textSecondary: '#AEC2D4',
    textMuted: '#7890A6',
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
