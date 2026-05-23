import { Platform } from 'react-native';

const baseShadow = Platform.select({
  android: {
    elevation: 4,
  },
  default: {
    shadowColor: '#020617',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.28,
    shadowRadius: 28,
  },
});

export const theme = {
  colors: {
    canvas: '#09111E',
    canvasAlt: '#0A1322',
    surface: '#121D31',
    surfaceRaised: '#18253D',
    surfaceMuted: '#132034',
    surfaceSubtle: '#0F1728',
    primary: '#4F7CFF',
    primaryStrong: '#3765EE',
    primarySoft: 'rgba(79, 124, 255, 0.16)',
    primaryLine: 'rgba(147, 197, 253, 0.24)',
    accent: '#14B8A6',
    accentSoft: 'rgba(20, 184, 166, 0.14)',
    success: '#4ADE80',
    successSoft: 'rgba(22, 163, 74, 0.14)',
    warning: '#F59E0B',
    warningSoft: 'rgba(245, 158, 11, 0.14)',
    danger: '#F87171',
    dangerSoft: 'rgba(220, 38, 38, 0.14)',
    info: '#7DD3FC',
    infoSoft: 'rgba(14, 165, 233, 0.14)',
    border: 'rgba(148, 163, 184, 0.20)',
    borderStrong: 'rgba(191, 219, 254, 0.26)',
    overlay: 'rgba(6, 10, 18, 0.68)',
    input: 'rgba(9, 16, 29, 0.82)',
    textPrimary: '#F8FBFF',
    textSecondary: '#AFBDD1',
    textMuted: '#8797AE',
    textInverse: '#FFFFFF',
  },
  statusTones: {
    default: {
      background: 'rgba(148, 163, 184, 0.14)',
      foreground: '#CBD5E1',
      border: 'rgba(203, 213, 225, 0.24)',
    },
    success: {
      background: 'rgba(34, 197, 94, 0.14)',
      foreground: '#86EFAC',
      border: 'rgba(134, 239, 172, 0.28)',
    },
    warning: {
      background: 'rgba(245, 158, 11, 0.14)',
      foreground: '#FCD34D',
      border: 'rgba(252, 211, 77, 0.30)',
    },
    danger: {
      background: 'rgba(239, 68, 68, 0.14)',
      foreground: '#FCA5A5',
      border: 'rgba(252, 165, 165, 0.30)',
    },
    info: {
      background: 'rgba(14, 165, 233, 0.14)',
      foreground: '#7DD3FC',
      border: 'rgba(125, 211, 252, 0.30)',
    },
    neutral: {
      background: 'rgba(100, 116, 139, 0.14)',
      foreground: '#CBD5E1',
      border: 'rgba(203, 213, 225, 0.24)',
    },
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
    md: 12,
    lg: 16,
    xl: 24,
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
