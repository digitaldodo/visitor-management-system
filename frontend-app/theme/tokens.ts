import { Platform } from 'react-native';

import {
  enterpriseColors,
  enterpriseRadii,
  enterpriseSpacing,
  enterpriseStatusTones,
  enterpriseTypography,
} from './enterpriseDesign';

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
  colors: enterpriseColors,
  statusTones: enterpriseStatusTones,
  spacing: enterpriseSpacing,
  radii: enterpriseRadii,
  typography: enterpriseTypography,
  shadows: {
    card: baseShadow ?? {},
  },
};
