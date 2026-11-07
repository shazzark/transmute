import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({ children, ...props }: Record<string, unknown>) =>
    ReactModule.createElement(name, props, children as React.ReactNode);
  return {
    StyleSheet: { create: (styles: unknown) => styles },
    View: host('View'),
  };
});

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, right: 12, bottom: 32, left: 8 }),
}));

vi.mock('expo-router', () => ({ usePathname: () => mocks.pathname }));

import { ScreenLayout } from './ScreenLayout';
import { layout } from '../tokens';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('ScreenLayout', () => {
  afterEach(() => { mocks.pathname = '/'; });

  it('applies system insets once and shared content spacing inside the tab-safe frame', () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(React.createElement(ScreenLayout, null, React.createElement('PageContent'))); });

    const frame = renderer!.root.findAll((node) => String(node.type) === 'View' && node.props.pointerEvents === 'box-none')[0];
    const content = frame?.children.find((child) => typeof child !== 'string');
    expect(frame?.props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ top: 24, right: 12, bottom: layout.tabBarHeight + 32, left: 8 }),
    ]));
    expect(content?.props.style).toEqual(expect.objectContaining({
      paddingTop: layout.screenPadding,
      paddingHorizontal: layout.screenPadding,
    }));

    act(() => renderer!.unmount());
  });

  it('reserves only the system bottom inset on routes without the tab bar', () => {
    mocks.pathname = '/activity';
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(React.createElement(ScreenLayout, null, React.createElement('PageContent'))); });

    const frame = renderer!.root.findAll((node) => String(node.type) === 'View' && node.props.pointerEvents === 'box-none')[0];
    expect(frame?.props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ bottom: 32 }),
    ]));

    act(() => renderer!.unmount());
  });
});
