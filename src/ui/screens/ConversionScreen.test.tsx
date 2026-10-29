import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pickSourceFiles: vi.fn(),
  listEncoders: vi.fn(),
  runConversion: vi.fn(),
  prepareSource: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({ children, ...props }: Record<string, unknown>) =>
    ReactModule.createElement(name, props, children as React.ReactNode);
  return {
    AccessibilityInfo: { announceForAccessibility: vi.fn() },
    Platform: { OS: 'android' },
    Pressable: host('Pressable'),
    ScrollView: host('ScrollView'),
    StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
    Text: host('Text'),
    View: host('View'),
  };
});

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  usePathname: () => '/',
  useRootNavigationState: () => ({ key: 'test-root' }),
}));
vi.mock('expo-notifications', () => ({
  AndroidImportance: { LOW: 2 },
  setNotificationChannelAsync: vi.fn(async () => {}),
  getPermissionsAsync: vi.fn(async () => ({ granted: true, status: 'granted' })),
  requestPermissionsAsync: vi.fn(async () => ({ granted: true, status: 'granted' })),
  addNotificationResponseReceivedListener: vi.fn(() => ({ remove: vi.fn() })),
  getLastNotificationResponseAsync: vi.fn(async () => null),
  clearLastNotificationResponseAsync: vi.fn(async () => {}),
  scheduleNotificationAsync: vi.fn(async () => 'notification'),
}));
vi.mock('expo-sharing', () => ({ isAvailableAsync: vi.fn(async () => true), shareAsync: vi.fn(async () => {}) }));
vi.mock('../../application/runConversion', () => ({
  prepareSource: mocks.prepareSource,
  runConversion: mocks.runConversion,
}));
vi.mock('../../native/ffmpeg', () => ({
  enginePorts: { listEncoders: mocks.listEncoders },
  cancelActiveConversion: vi.fn(),
}));
vi.mock('../../native/documentPicker', () => ({ pickSourceFiles: mocks.pickSourceFiles }));
vi.mock('../../native/foregroundService', () => ({
  foregroundPorts: {
    requestPermission: vi.fn(async () => true), show: vi.fn(async () => true), hide: vi.fn(async () => {}),
    onCancel: vi.fn(() => () => {}), onTimeout: vi.fn(() => () => {}),
  },
}));
vi.mock('../../native/jobFiles', () => ({
  clearConversionMarker: vi.fn(async () => {}), markConversionRunning: vi.fn(async () => {}),
  interruptedRecoveryPorts: { hasActiveMarker: vi.fn(async () => false), removePartialOutputs: vi.fn(async () => {}), clearActiveMarker: vi.fn(async () => {}) },
}));
vi.mock('../../native/saveDestination', () => ({ savePorts: {} }));
vi.mock('../../native/subtitlePicker', () => ({ sidecarPorts: {} }));
vi.mock('../../application/extractSubtitles', () => ({ extractSubtitles: vi.fn() }));
vi.mock('../../application/sidecar', () => ({ chooseSidecar: vi.fn() }));
vi.mock('../../application/saveOutput', () => ({ saveOutput: vi.fn() }));

vi.mock('../components/PrimaryButton', async () => {
  const ReactModule = await import('react');
  const { Pressable, Text } = await import('react-native');
  return { PrimaryButton: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) =>
    ReactModule.createElement(Pressable, { onPress, disabled, accessibilityRole: 'button', accessibilityLabel: label }, ReactModule.createElement(Text, null, label)) };
});
vi.mock('../components/SecondaryButton', async () => {
  const ReactModule = await import('react');
  const { Pressable, Text } = await import('react-native');
  return { SecondaryButton: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) =>
    ReactModule.createElement(Pressable, { onPress, disabled, accessibilityRole: 'button', accessibilityLabel: label }, ReactModule.createElement(Text, null, label)) };
});
vi.mock('../components/QueuePanel', () => ({ QueuePanel: () => null }));
vi.mock('../components/Banner', () => ({ Banner: () => null }));
vi.mock('../components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));
vi.mock('../components/ConversionSummary', () => ({ ConversionSummary: () => null }));
vi.mock('../components/PresetSelector', () => ({ PresetSelector: () => null }));
vi.mock('../components/ProgressPanel', () => ({ ProgressPanel: () => null }));
vi.mock('../components/SavePanel', () => ({ SavePanel: () => null }));
vi.mock('../components/SubtitlePanel', () => ({ SubtitlePanel: () => null }));
vi.mock('../components/VideoPreviewCard', () => ({ VideoPreviewCard: () => null }));

import { ConversionScreen } from './ConversionScreen';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function button(renderer: TestRenderer.ReactTestRenderer, label: string) {
  return renderer.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityLabel === label)[0];
}

describe('ConversionScreen Convert action', () => {
  let renderer: TestRenderer.ReactTestRenderer;
  let finishConversion: ((result: unknown) => void) | undefined;

  beforeEach(async () => {
    mocks.pickSourceFiles.mockReset().mockResolvedValue({
      status: 'picked',
      sources: [{ path: '/cache/input.mp4', name: 'input.mp4', sizeBytes: 1024, mimeType: 'video/mp4' }],
    });
    mocks.listEncoders.mockReset().mockResolvedValue(['h264_mediacodec', 'aac']);
    mocks.prepareSource.mockReset().mockResolvedValue(undefined);
    mocks.runConversion.mockReset().mockImplementation(() => new Promise((resolve) => { finishConversion = resolve; }));
    await act(async () => { renderer = TestRenderer.create(React.createElement(ConversionScreen)); });
  });

  afterEach(() => { act(() => renderer.unmount()); });

  it('starts the runner from the visible Convert button and ignores a rapid duplicate tap', async () => {
    await act(async () => { button(renderer, 'Select videos')?.props.onPress(); });
    const convert = button(renderer, 'Convert to MP4');
    expect(convert).toBeDefined();
    await act(async () => {
      convert?.props.onPress();
      convert?.props.onPress();
    });
    expect(mocks.runConversion).toHaveBeenCalledTimes(1);
    expect(mocks.runConversion).toHaveBeenCalledWith(expect.objectContaining({ source: expect.objectContaining({ name: 'input.mp4' }) }));
    await act(async () => { finishConversion?.({ status: 'done', summary: null, outputPath: '/cache/output.mp4', failure: null }); });
  });
});
