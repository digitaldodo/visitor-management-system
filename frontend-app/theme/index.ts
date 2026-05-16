import { DefaultTheme } from '@react-navigation/native';

import { theme as appTheme } from './tokens';

export const theme = appTheme;

export const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: theme.colors.canvas,
    card: theme.colors.surface,
    border: theme.colors.border,
    notification: theme.colors.danger,
    primary: theme.colors.primary,
    text: theme.colors.textPrimary,
  },
};
