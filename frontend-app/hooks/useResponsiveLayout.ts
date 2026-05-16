import { useWindowDimensions } from 'react-native';

export function useResponsiveLayout() {
  const { width, height, fontScale } = useWindowDimensions();
  const isLandscape = width > height;
  const isTablet = width >= 768;
  const isLargeTablet = width >= 1100;
  const isTwoColumn = width >= 920;
  const isCompactHeight = height < 720;

  return {
    width,
    height,
    fontScale,
    isLandscape,
    isTablet,
    isLargeTablet,
    isTwoColumn,
    isCompactHeight,
    contentMaxWidth: isLargeTablet ? 1240 : isTablet ? 1040 : 720,
    contentPadding: isLargeTablet ? 28 : isTablet ? 24 : 20,
    cardSpacing: isTablet ? 20 : 16,
  };
}
