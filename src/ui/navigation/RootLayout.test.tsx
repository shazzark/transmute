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
    StyleSheet: { create: (styles: unknown) => styles, absoluteFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } },
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
    const stack = renderer.root.findAll((node) => String(node.type) === 'RouterStack')[0];
    const controller = renderer.root.findAll((node) => String(node.type) === 'View' && node.props.pointerEvents === 'box-none')[0];
    expect(controller?.props.style).toEqual(expect.objectContaining({ position: 'absolute', zIndex: 1 }));
    const stackedLayers = renderer.root.findAll((node) =>
      String(node.type) === 'RouterStack' || (String(node.type) === 'View' && node.props.pointerEvents === 'box-none'));
    const stackIndex = stackedLayers.indexOf(stack!);
    const controllerIndex = stackedLayers.indexOf(controller!);
    expect(stackIndex).toBeGreaterThanOrEqual(0);
    expect(controllerIndex).toBeGreaterThan(stackIndex);

    mocks.route = '/queue';
    act(() => { renderer.update(React.createElement(RootLayout)); });

    expect(mocks.mounts).toBe(1);
    expect(mocks.unmounts).toBe(0);
    expect(renderer.root.findAll((node) => String(node.type) === 'ConversionController')).toHaveLength(1);
  });
});
