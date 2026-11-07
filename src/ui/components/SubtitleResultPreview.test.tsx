import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ text: 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nSaved cue' }));

vi.mock('expo-file-system', () => ({
  File: class {
    async text() { return mocks.text; }
  },
}));

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({ children, ...props }: Record<string, unknown>) =>
    ReactModule.createElement(name, props, children as React.ReactNode);
  return {
    StyleSheet: { create: (styles: unknown) => styles },
    Text: host('Text'),
    View: host('View'),
  };
});

import { SubtitleResultPreview } from './SubtitleResultPreview';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('SubtitleResultPreview', () => {
  afterEach(() => { mocks.text = 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nSaved cue'; });

  it('loads and previews text from its durable file URI', async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(SubtitleResultPreview, { uri: 'file:///app/result.vtt' }));
      await Promise.resolve();
    });
    expect(renderer!.root.findAll((node) => String(node.type) === 'Text').some((node) => node.children.join('').includes('Saved cue'))).toBe(true);
    await act(async () => renderer!.unmount());
  });

  it('limits the preview to one hundred lines', async () => {
    mocks.text = Array.from({ length: 105 }, (_, index) => `line ${index + 1}`).join('\n');
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(SubtitleResultPreview, { uri: 'file:///app/result.srt' }));
      await Promise.resolve();
    });
    const texts = renderer!.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join(''));
    expect(texts.some((text) => text.includes('line 100'))).toBe(true);
    expect(texts.some((text) => text.includes('line 101'))).toBe(false);
    expect(texts.some((text) => text.includes('first 100 lines'))).toBe(true);
    await act(async () => renderer!.unmount());
  });
});
