import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

const mockedFlatList = vi.hoisted(() => vi.fn((_props: Record<string, unknown>) => null));
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

vi.mock('react-native', () => ({
  FlatList: mockedFlatList,
  StyleSheet: { create: (styles: unknown) => styles },
  Text: 'Text',
  View: 'View',
}));
vi.mock('./ProgressBar', () => ({ ProgressBar: () => null }));
vi.mock('./SecondaryButton', () => ({ SecondaryButton: () => null }));

import { queueReducer, initialQueueState } from '../../domain/queue';
import { QueuePanel } from './QueuePanel';

describe('QueuePanel list rendering', () => {
  it('uses a bounded virtualized window for a twenty-file queue', async () => {
    const state = queueReducer(initialQueueState, {
      type: 'queue/added',
      sources: Array.from({ length: 20 }, (_, index) => ({
        path: `/cache/video-${index}.mp4`,
        name: `video-${index}.mp4`,
        sizeBytes: 1_024,
        mimeType: 'video/mp4',
      })),
    });

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <QueuePanel
          state={state}
          focusId={null}
          disabled={false}
          onCancelJob={() => {}}
          onRetryJob={() => {}}
          onSelectJob={() => {}}
          onCancelAll={() => {}}
          onClearFinished={() => {}}
        />,
      );
    });

    const listProps = mockedFlatList.mock.calls[0]?.[0] as unknown as {
      data: readonly unknown[];
      initialNumToRender: number;
      maxToRenderPerBatch: number;
      windowSize: number;
    };
    expect(listProps.data).toHaveLength(20);
    expect(listProps.initialNumToRender).toBe(8);
    expect(listProps.maxToRenderPerBatch).toBe(8);
    expect(listProps.windowSize).toBe(7);
  });
});
