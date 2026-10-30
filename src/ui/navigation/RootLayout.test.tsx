import React, { useEffect } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  route: '/',
  mounts: 0,
  unmounts: 0,
}));

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({ children, ...props }: Record<string, unknown>) =>
    ReactModule.createElement(name, props, children as React.ReactNode);
  return {
    Platform: { OS: 'android' },
    StatusBar: { currentHeight: 99 },
    StyleSheet: { create: (styles: unknown) => styles, absoluteFill: { position: 'absolute' } },
    View: host('View'),
  };
});

vi.mock('expo-status-bar', async () => {
  const ReactModule = await import('react');
  return { StatusBar: (props: Record<string, unknown>) => ReactModule.createElement('StatusBar', props) };
});

vi.mock('react-native-safe-area-context', async () => {
  const ReactModule = await import('react');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => ReactModule.createElement('SafeAreaProvider', null, children),
    useSafeAreaInsets: () => ({ top: 24, right: 12, bottom: 32, left: 8 }),
  };
});

vi.mock('expo-router', async () => {
  const ReactModule = await import('react');
  const Stack = ({ children }: { children: React.ReactNode }) => ReactModule.createElement('RouterStack', { key: mocks.route }, children);
  Stack.Screen = () => null;
  return { Stack };
});

vi.mock('../screens/ConversionScreen', async () => {
  const ReactModule = await import('react');
  return {
    ConversionScreen: () => {
      useEffect(() => {
        mocks.mounts += 1;
        return () => { mocks.unmounts += 1; };
      }, []);
      return ReactModule.createElement('ConversionController');
    },
  };
});

import RootLayout from '../../../app/_layout';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('root conversion controller navigation lifecycle', () => {
  let renderer: TestRenderer.ReactTestRenderer;

  afterEach(() => {
    act(() => renderer?.unmount());
    mocks.route = '/';
    mocks.mounts = 0;
    mocks.unmounts = 0;
  });

  it('keeps the controller mounted as the Router stack changes screens', () => {
    act(() => { renderer = TestRenderer.create(React.createElement(RootLayout)); });
    expect(mocks.mounts).toBe(1);
    const insetView = renderer.root.findAll((node) => String(node.type) === 'View' && Array.isArray(node.props.style) && node.props.style.some((style) => style !== null && typeof style === 'object' && 'paddingTop' in style))[0];
    expect(insetView?.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ paddingTop: 24, paddingLeft: 8, paddingRight: 12 })]));

    mocks.route = '/queue';
    act(() => { renderer.update(React.createElement(RootLayout)); });

    expect(mocks.mounts).toBe(1);
    expect(mocks.unmounts).toBe(0);
    expect(renderer.root.findAll((node) => String(node.type) === 'ConversionController')).toHaveLength(1);
  });
});
