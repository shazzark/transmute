import { layout } from './tokens';

/** Space occupied by the floating tab bar plus the system navigation area. */
export function bottomNavigationClearance(bottomInset: number): number {
  return layout.tabBarHeight + bottomInset;
}
