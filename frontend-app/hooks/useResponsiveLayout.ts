import { useWindowDimensions } from 'react-native';

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function useResponsiveLayout() {
  const { width, height, fontScale } = useWindowDimensions();
  const shortestSide = Math.min(width, height);
  const isLandscape = width > height;
  const isFoldable = shortestSide >= 540 && shortestSide < 700;
  const isSmallPhone = shortestSide < 360;
  const isPhone = shortestSide < 600;
  const isTablet = shortestSide >= 600;
  const isLargeTablet = shortestSide >= 900;
  const isTwoColumn = width >= 760 && (isTablet || isLandscape || isFoldable);
  const isCompactHeight = height < 720;
  const density = clamp(shortestSide / 390, 0.88, 1.18);
  const contentPadding = isLargeTablet ? 28 : isTablet || isFoldable ? 24 : isSmallPhone ? 12 : 16;
  const cardPadding = isLargeTablet ? 22 : isTablet || isFoldable ? 20 : isSmallPhone ? 12 : 16;
  const cardSpacing = isTablet || isFoldable ? 16 : isSmallPhone ? 10 : 14;
  const touchTarget = isSmallPhone ? 48 : 52;
  const tabBarHeight = isTablet ? 86 : isSmallPhone ? 72 : 78;
  const compactGridColumns = isLargeTablet
    ? 4
    : isTablet || (isLandscape && width >= 760)
      ? 3
      : 2;
  const balancedGridColumns = isLargeTablet
    ? 3
    : isTablet || isFoldable || isTwoColumn
      ? 2
      : 1;

  return {
    width,
    height,
    fontScale,
    shortestSide,
    isLandscape,
    isFoldable,
    isSmallPhone,
    isPhone,
    isTablet,
    isLargeTablet,
    isTwoColumn,
    isCompactHeight,
    density,
    compactGridColumns,
    balancedGridColumns,
    contentMaxWidth: isLargeTablet ? 1120 : isTablet || isFoldable ? 920 : 560,
    contentPadding,
    cardPadding,
    cardSpacing,
    touchTarget,
    fieldStacked: width < 430,
    tabBarHeight,
    tabBarMaxWidth: isLargeTablet ? 980 : isTablet ? 880 : width,
    tabBarHorizontalPadding: isLargeTablet ? 28 : isTablet ? 24 : isSmallPhone ? 8 : 10,
    scannerHeight: clamp(height * (isTablet && isLandscape ? 0.54 : 0.42), isSmallPhone ? 240 : 280, isTablet ? 460 : 360),
  };
}
