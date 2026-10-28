import { describe, expect, it, vi } from 'vitest';

import { initialSaveState, saveReducer, type SaveAction, type SaveState } from '../domain/saveIntent';
import { saveOutput, type SavePorts, type SaveRequest } from './saveOutput';

const request: SaveRequest = {
  target: 'photos',
  path: '/data/user/0/dev.transmute/cache/transmute/job-1/Trip 2026.mp4',
  name: 'Trip 2026.mp4',
};

interface Fakes {
  readonly ports: SavePorts;
  readonly saveToPhotos: ReturnType<typeof vi.fn>;
  readonly pickFolder: ReturnType<typeof vi.fn>;
  readonly copyToFolder: ReturnType<typeof vi.fn>;
}

function makePorts(overrides: Partial<SavePorts> = {}): Fakes {
  const saveToPhotos = vi.fn(async () => ({ location: 'Photos' }));
  const pickFolder = vi.fn(async () => ({
    status: 'picked' as const,
    uri: 'content://com.android.externalstorage.documents/tree/primary%3ADownload',
    label: 'Download',
  }));
  const copyToFolder = vi.fn(async () => ({ location: 'Download/Trip 2026.mp4' }));

  const ports: SavePorts = { saveToPhotos, pickFolder, copyToFolder, ...overrides };

  return { ports, saveToPhotos, pickFolder, copyToFolder };
}

/** Replays the dispatched actions through the real reducer. */
function trackSave() {
  let state: SaveState = initialSaveState;
  const actions: SaveAction[] = [];
  return {
    dispatch: (action: SaveAction) => {
      actions.push(action);
      state = saveReducer(state, action);
    },
    get state() {
      return state;
    },
    actions,
  };
}

describe('saveOutput — Photos', () => {
  it('adds the file to the photo library and reports where it landed', async () => {
    const { ports, saveToPhotos, pickFolder } = makePorts();
    const tracker = trackSave();

    const outcome = await saveOutput({ request, ports, dispatch: tracker.dispatch });

    expect(outcome).toEqual({ status: 'saved', location: 'Photos' });
    expect(saveToPhotos).toHaveBeenCalledWith(request.path);
    expect(pickFolder).not.toHaveBeenCalled();
    expect(tracker.actions.map((action) => action.type)).toEqual([
      'save/started',
      'save/succeeded',
    ]);
    expect(tracker.state.photos).toBe('Photos');
  });

  it('reports a refusal as a failure that keeps the file in the cache', async () => {
    const { ports } = makePorts({
      saveToPhotos: async () => {
        throw new Error('Permission denied');
      },
    });
    const tracker = trackSave();

    const outcome = await saveOutput({ request, ports, dispatch: tracker.dispatch });

    expect(outcome.status).toBe('failed');
    if (outcome.status === 'failed') {
      expect(outcome.failure.code).toBe('save-failed');
      expect(outcome.failure.title).toBe('Access refused');
      expect(outcome.failure.detail).toBe('Permission denied');
    }
    expect(tracker.state.status).toBe('failed');
    expect(tracker.state.photos).toBeNull();
  });
});

describe('saveOutput — folder', () => {
  const toFolder: SaveRequest = { ...request, target: 'folder' };

  it('asks for a folder, then copies the file into it', async () => {
    const { ports, pickFolder, copyToFolder, saveToPhotos } = makePorts();
    const tracker = trackSave();

    const outcome = await saveOutput({ request: toFolder, ports, dispatch: tracker.dispatch });

    expect(pickFolder).toHaveBeenCalledTimes(1);
    expect(copyToFolder).toHaveBeenCalledWith({
      path: toFolder.path,
      name: toFolder.name,
      folderUri: 'content://com.android.externalstorage.documents/tree/primary%3ADownload',
      folderLabel: 'Download',
    });
    expect(saveToPhotos).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: 'saved', location: 'Download/Trip 2026.mp4' });
    expect(tracker.state.folder).toBe('Download/Trip 2026.mp4');
    expect(tracker.state.photos).toBeNull();
  });

  it('treats a closed picker as cancelled, not failed', async () => {
    const { ports, copyToFolder } = makePorts({
      pickFolder: async () => ({ status: 'cancelled' }),
    });
    const tracker = trackSave();

    const outcome = await saveOutput({ request: toFolder, ports, dispatch: tracker.dispatch });

    expect(outcome).toEqual({ status: 'cancelled' });
    expect(copyToFolder).not.toHaveBeenCalled();
    expect(tracker.state.status).toBe('idle');
    expect(tracker.state.failure).toBeNull();
    expect(tracker.actions.map((action) => action.type)).toEqual(['save/started', 'save/skipped']);
  });

  it('fails with a folder message when the picker itself breaks', async () => {
    const { ports } = makePorts({
      pickFolder: async () => ({ status: 'failed', error: new Error('picker exploded') }),
    });
    const tracker = trackSave();

    const outcome = await saveOutput({ request: toFolder, ports, dispatch: tracker.dispatch });

    expect(outcome.status).toBe('failed');
    if (outcome.status === 'failed') {
      expect(outcome.failure.message).toMatch(/folder/i);
      expect(outcome.failure.detail).toBe('picker exploded');
    }
  });

  it('fails with a folder message when the copy is refused', async () => {
    const { ports } = makePorts({
      copyToFolder: async () => {
        throw new Error('Unable to copy file or directory: no space left on device');
      },
    });
    const tracker = trackSave();

    const outcome = await saveOutput({ request: toFolder, ports, dispatch: tracker.dispatch });

    expect(outcome.status).toBe('failed');
    if (outcome.status === 'failed') {
      expect(outcome.failure.title).toBe('Not enough space');
    }
  });
});
