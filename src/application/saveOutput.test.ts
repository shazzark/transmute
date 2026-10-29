import { describe, expect, it, vi } from 'vitest';

import { initialSaveState, saveReducer, type SaveAction, type SaveState } from '../domain/saveIntent';
import {
  saveOutput,
  type CopyToFolderRequest,
  type SavePorts,
  type SaveRequest,
} from './saveOutput';

const request: SaveRequest = {
  kind: 'media',
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
  const copyToFolder = vi.fn(async (copy: CopyToFolderRequest) => ({
    location: `Download/${copy.name}`,
  }));

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
      kind: 'media',
      path: toFolder.path,
      name: toFolder.name,
      folderUri: 'content://com.android.externalstorage.documents/tree/primary%3ADownload',
      folderLabel: 'Download',
      mimeTypes: ['video/mp4'],
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

describe('saveOutput — extracted subtitles', () => {
  const subtitle: SaveRequest = {
    kind: 'subtitle',
    target: 'folder',
    path: '/data/user/0/dev.transmute/cache/transmute/job-2/Trip 2026.srt',
    name: 'Trip 2026.srt',
  };

  it('copies the subtitle into the folder as SubRip and reports where it went', async () => {
    const { ports, copyToFolder, pickFolder, saveToPhotos } = makePorts();
    const tracker = trackSave();

    const outcome = await saveOutput({ request: subtitle, ports, dispatch: tracker.dispatch });

    expect(pickFolder).toHaveBeenCalledTimes(1);
    expect(copyToFolder).toHaveBeenCalledWith({
      kind: 'subtitle',
      path: subtitle.path,
      name: subtitle.name,
      folderUri: 'content://com.android.externalstorage.documents/tree/primary%3ADownload',
      folderLabel: 'Download',
      // The type the folder is asked for, with the plain-text fallback behind it.
      mimeTypes: ['application/x-subrip', 'text/plain'],
    });
    expect(saveToPhotos).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: 'saved', location: 'Download/Trip 2026.srt' });
    expect(tracker.state.folder).toBe('Download/Trip 2026.srt');
    expect(tracker.state.photos).toBeNull();
  });

  it('writes a WebVTT file as text/vtt', async () => {
    const { ports, copyToFolder } = makePorts();
    const tracker = trackSave();

    await saveOutput({
      request: { ...subtitle, name: 'Trip 2026.vtt', path: '/cache/job-2/Trip 2026.vtt' },
      ports,
      dispatch: tracker.dispatch,
    });

    expect(copyToFolder).toHaveBeenCalledWith(
      expect.objectContaining({ mimeTypes: ['text/vtt', 'text/plain'] }),
    );
  });

  it('refuses the photo library before asking it, and names the folder instead', async () => {
    const { ports, saveToPhotos, pickFolder, copyToFolder } = makePorts();
    const tracker = trackSave();

    const outcome = await saveOutput({
      request: { ...subtitle, target: 'photos' },
      ports,
      dispatch: tracker.dispatch,
    });

    expect(outcome.status).toBe('failed');
    if (outcome.status === 'failed') {
      expect(outcome.failure.code).toBe('save-failed');
      expect(outcome.failure.title).toBe('Photos cannot take a text file');
      expect(outcome.failure.recovery).toMatch(/folder/i);
    }
    expect(saveToPhotos).not.toHaveBeenCalled();
    expect(pickFolder).not.toHaveBeenCalled();
    expect(copyToFolder).not.toHaveBeenCalled();
    expect(tracker.state.status).toBe('failed');
    expect(tracker.state.photos).toBeNull();
  });

  it('reports a refused copy without losing the extracted file', async () => {
    const { ports } = makePorts({
      copyToFolder: async () => {
        throw new Error('Permission denied');
      },
    });
    const tracker = trackSave();

    const outcome = await saveOutput({ request: subtitle, ports, dispatch: tracker.dispatch });

    expect(outcome.status).toBe('failed');
    if (outcome.status === 'failed') {
      expect(outcome.failure.title).toBe('Access refused');
      expect(outcome.failure.recovery).toMatch(/app cache/);
    }
    expect(tracker.state.folder).toBeNull();
  });
});
