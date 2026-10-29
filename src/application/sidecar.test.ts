import { describe, expect, it, vi } from 'vitest';

import type { SubtitleAction } from '../domain/subtitleIntent';
import { chooseSidecar, type SidecarPorts } from './sidecar';

const SRT = ['1', '00:00:01,000 --> 00:00:03,000', 'Hello', ''].join('\n');

const file = { path: '/cache/TransmuteDocumentPicker/Trip 2026.srt', name: 'Trip 2026.srt' };

interface Fakes {
  readonly ports: SidecarPorts;
  readonly pickSidecarFile: ReturnType<typeof vi.fn>;
  readonly readTextFile: ReturnType<typeof vi.fn>;
}

function makePorts(overrides: Partial<SidecarPorts> = {}): Fakes {
  const pickSidecarFile = vi.fn(async () => ({ status: 'picked' as const, file }));
  const readTextFile = vi.fn(async () => SRT);

  return {
    ports: { pickSidecarFile, readTextFile, ...overrides },
    pickSidecarFile,
    readTextFile,
  };
}

/** Collects the actions `chooseSidecar` dispatches, in order. */
function trackDispatch() {
  const actions: SubtitleAction[] = [];
  return { actions, dispatch: (action: SubtitleAction) => actions.push(action) };
}

describe('chooseSidecar — accepted', () => {
  it('reads the file, validates it, and announces a sidecar', async () => {
    const { ports } = makePorts();
    const tracker = trackDispatch();

    const outcome = await chooseSidecar({ ports, dispatch: tracker.dispatch });

    expect(outcome).toEqual({
      status: 'ready',
      sidecar: {
        path: file.path,
        name: file.name,
        format: 'srt',
        cueCount: 1,
        firstCueLabel: '0:01',
        lastCueLabel: '0:03',
      },
    });
    expect(tracker.actions.map((action) => action.type)).toEqual([
      'sidecar/choosing',
      'sidecar/ready',
    ]);
  });

  it('reads the picked path, not the name', async () => {
    const { ports, readTextFile } = makePorts();

    await chooseSidecar({ ports, dispatch: trackDispatch().dispatch });

    expect(readTextFile).toHaveBeenCalledWith(file.path);
  });
});

describe('chooseSidecar — not a failure', () => {
  it('reports a cancelled picker without reading anything', async () => {
    const { ports, readTextFile } = makePorts({
      pickSidecarFile: vi.fn(async () => ({ status: 'cancelled' as const })),
    });
    const tracker = trackDispatch();

    const outcome = await chooseSidecar({ ports, dispatch: tracker.dispatch });

    expect(outcome).toEqual({ status: 'cancelled' });
    expect(readTextFile).not.toHaveBeenCalled();
    expect(tracker.actions.map((action) => action.type)).toEqual([
      'sidecar/choosing',
      'sidecar/choosingCancelled',
    ]);
  });
});

describe('chooseSidecar — refused', () => {
  it('names the file when it is not SubRip', async () => {
    const { ports } = makePorts({
      pickSidecarFile: vi.fn(async () => ({
        status: 'picked' as const,
        file: { path: '/cache/Trip.ass', name: 'Trip.ass' },
      })),
    });
    const tracker = trackDispatch();

    const outcome = await chooseSidecar({ ports, dispatch: tracker.dispatch });

    expect(outcome.status).toBe('failed');
    expect(outcome.status === 'failed' && outcome.failure.code).toBe('subtitle-invalid');
    expect(outcome.status === 'failed' && outcome.failure.message).toContain('Trip.ass');
    expect(tracker.actions.at(-1)?.type).toBe('sidecar/failed');
  });

  it('points at the line of a cue it cannot read', async () => {
    const { ports } = makePorts({
      readTextFile: vi.fn(async () => '00:00:05,000 --> 00:00:01,000\nBackwards\n'),
    });

    const outcome = await chooseSidecar({ ports, dispatch: trackDispatch().dispatch });

    expect(outcome.status === 'failed' && outcome.failure.title).toBe('Cue times are unreadable');
    expect(outcome.status === 'failed' && outcome.failure.message).toContain('line 1');
  });

  it('reports an unreadable file as a pick failure, keeping the cause in Details', async () => {
    const { ports } = makePorts({
      readTextFile: vi.fn(async () => {
        throw new Error('Permission denied');
      }),
    });
    const tracker = trackDispatch();

    const outcome = await chooseSidecar({ ports, dispatch: tracker.dispatch });

    expect(outcome.status === 'failed' && outcome.failure.code).toBe('subtitle-pick-failed');
    expect(outcome.status === 'failed' && outcome.failure.detail).toBe('Permission denied');
    expect(tracker.actions.at(-1)?.type).toBe('sidecar/failed');
  });

  it('reports a picker that returns no file', async () => {
    const { ports } = makePorts({
      pickSidecarFile: vi.fn(async () => ({
        status: 'failed' as const,
        error: new Error('The picker returned no file.'),
      })),
    });

    const outcome = await chooseSidecar({ ports, dispatch: trackDispatch().dispatch });

    expect(outcome.status === 'failed' && outcome.failure.code).toBe('subtitle-pick-failed');
  });

  it('reports a picker that throws instead of returning', async () => {
    const { ports } = makePorts({
      pickSidecarFile: vi.fn(async () => {
        throw new Error('Activity is not available');
      }),
    });
    const tracker = trackDispatch();

    const outcome = await chooseSidecar({ ports, dispatch: tracker.dispatch });

    expect(outcome.status).toBe('failed');
    expect(tracker.actions.map((action) => action.type)).toEqual([
      'sidecar/choosing',
      'sidecar/failed',
    ]);
  });
});
