import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  player: { availableSubtitleTracks: [] as Array<{ id?: string; label: string; language: string }>, subtitleTrack: null as unknown },
  listeners: new Map<string, (event: any) => void>(),
}));

vi.mock('expo', () => ({
  useEventListener: (_player: unknown, event: string, listener: (payload: any) => void) => {
    mocks.listeners.set(event, listener);
  },
}));

vi.mock('expo-video', () => ({
  useVideoPlayer: () => mocks.player,
  VideoView: 'VideoView',
}));

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({ children, ...props }: Record<string, unknown>) =>
    ReactModule.createElement(name, props, children as React.ReactNode);
  return {
    Pressable: host('Pressable'),
    StyleSheet: { create: (styles: unknown) => styles },
    Text: host('Text'),
    View: host('View'),
  };
});

import { ResultPlayer } from './ResultPlayer';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('ResultPlayer subtitle controls', () => {
  afterEach(() => {
    mocks.player.availableSubtitleTracks = [];
    mocks.player.subtitleTrack = null;
    mocks.listeners.clear();
  });

  it('lists embedded tracks and assigns the chosen track to the native player', async () => {
    const track = { id: 'subtitle-1', label: 'English', language: 'en' };
    mocks.player.availableSubtitleTracks = [track];
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<ResultPlayer uri="file:///result.mp4" label="result.mp4" mimeType="video/mp4" />);
    });

    const buttons = () => renderer!.root.findAll((node) => String(node.type) === 'Pressable');
    const english = buttons().find((node) => node.props.accessibilityLabel === 'Subtitle track English');
    expect(english).toBeDefined();
    await act(async () => english!.props.onPress());
    expect(mocks.player.subtitleTrack).toBe(track);
    expect(english!.props.accessibilityState.selected).toBe(true);

    const off = buttons().find((node) => node.props.accessibilityLabel === 'Subtitles off');
    await act(async () => off!.props.onPress());
    expect(mocks.player.subtitleTrack).toBeNull();
    await act(async () => renderer!.unmount());
  });

  it('shows tracks reported by the source-load event after the initial render', async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<ResultPlayer uri="file:///result.mkv" label="result.mkv" mimeType="video/x-matroska" />);
    });
    const track = { id: 'subtitle-2', label: 'Styled', language: 'und' };
    await act(async () => mocks.listeners.get('sourceLoad')?.({ availableSubtitleTracks: [track] }));
    expect(renderer!.root.findAll((node) => String(node.type) === 'Pressable').some((node) => node.props.accessibilityLabel === 'Subtitle track Styled')).toBe(true);
    await act(async () => renderer!.unmount());
  });
});
