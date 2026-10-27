/**
 * Design tokens (MVP, dark only).
 *
 * Semantic names, not raw colours, so components never hard-code a hex value
 * and a future light theme is a token change (architecture.md, design system).
 */

export const color = {
  bg: '#0E1116',
  surface: '#171C23',
  surfaceRaised: '#1F262F',
  border: '#303844',
  textPrimary: '#E6EDF3',
  textSecondary: '#98A2B3',
  accent: '#4C8DFF',
  /** Text and icons on the accent fill; white would fail contrast. */
  accentInk: '#06131F',
  danger: '#FF6B6B',
  warning: '#F5C542',
  success: '#3DDC84',
} as const;

export type ColorToken = keyof typeof color;

export const type = {
  caption: { fontSize: 12, lineHeight: 16 },
  label: { fontSize: 13, lineHeight: 18 },
  body: { fontSize: 15, lineHeight: 22 },
  bodyLarge: { fontSize: 17, lineHeight: 24 },
  title: { fontSize: 22, lineHeight: 28 },
  display: { fontSize: 30, lineHeight: 36 },
} as const;

export const weight = {
  body: '400',
  label: '500',
  title: '600',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  control: 10,
  card: 14,
  pill: 999,
} as const;

/** Minimum touch target, in dp (TR-20). */
export const touchTarget = 48;

/** Motion is removed, not shortened, when reduce-motion is on. */
export const motion = {
  stateChangeMs: 120,
  sheetMs: 200,
} as const;

/** Usable content width: single column, 16 dp sides, capped on large screens. */
export const layout = {
  screenPadding: spacing.lg,
  maxContentWidth: 560,
  sectionGap: spacing.xl,
} as const;
