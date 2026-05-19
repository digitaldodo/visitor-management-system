import { useWindowDimensions } from 'react-native';

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function useResponsiveLayout() {
  const { width, height, fontScale } = useWindowDimensions();
  const shortestSide = Math.min(width, height);
  const isLandscape = width > height;
  const isSmallPhone = shortestSide < 360;
  const isPhone = shortestSide < 600;
  const isTablet = shortestSide >= 600;
  const isLargeTablet = shortestSide >= 900;
  const isTwoColumn = width >= 840 && (isTablet || isLandscape);
  const isCompactHeight = height < 720;
  const density = clamp(shortestSide / 390, 0.88, 1.18);
  const contentPadding = isLargeTablet ? 28 : isTablet ? 24 : isSmallPhone ? 14 : 16;
  const cardPadding = isLargeTablet ? 22 : isTablet ? 20 : isSmallPhone ? 14 : 16;
  const cardSpacing = isTablet ? 18 : isSmallPhone ? 12 : 14;
  const touchTarget = isSmallPhone ? 48 : 52;

  return {
    width,
    height,
    fontScale,
    shortestSide,
    isLandscape,
    isSmallPhone,
    isPhone,
    isTablet,
    isLargeTablet,
    isTwoColumn,
    isCompactHeight,
    density,
    contentMaxWidth: isLargeTablet ? 1180 : isTablet ? 980 : 560,
    contentPadding,
    cardPadding,
    cardSpacing,
    touchTarget,
    fieldStacked: width < 430,
    tabBarHeight: isTablet ? 74 : 68,
    scannerHeight: clamp(height * (isTablet && isLandscape ? 0.54 : 0.42), isSmallPhone ? 240 : 280, isTablet ? 460 : 360),
  };
}
