import { describe, expect, it } from 'vitest';

import { describeSaveFailure } from './errors';
import {
  canSaveTo,
  initialSaveState,
  isSaving,
  saveReducer,
  saveTargets,
  savedLocation,
  targetLabel,
  type SaveAction,
  type SaveState,
} from './saveIntent';

function replay(actions: readonly SaveAction[]): SaveState {
  return actions.reduce(saveReducer, initialSaveState);
}

const failure = describeSaveFailure(new Error('Photos is unavailable'), 'photos');

describe('saveReducer', () => {
  it('starts idle, with nothing saved anywhere', () => {
    expect(initialSaveState.status).toBe('idle');
    expect(savedLocation(initialSaveState, 'photos')).toBeNull();
    expect(savedLocation(initialSaveState, 'folder')).toBeNull();
    expect(initialSaveState.failure).toBeNull();
  });

  it('goes idle → saving → saved for Photos', () => {
    const state = replay([
      { type: 'save/started', target: 'photos' },
      { type: 'save/succeeded', location: 'Photos' },
    ]);

    expect(state.status).toBe('saved');
    expect(state.target).toBe('photos');
    expect(state.photos).toBe('Photos');
    expect(state.folder).toBeNull();
    expect(state.failure).toBeNull();
  });

  it('tracks the two destinations independently', () => {
    const state = replay([
      { type: 'save/started', target: 'photos' },
      { type: 'save/succeeded', location: 'Photos' },
      { type: 'save/started', target: 'folder' },
      { type: 'save/succeeded', location: 'Download/Trip 2026.mp4' },
    ]);

    // Saving to a folder does not revoke the Photos copy.
    expect(state.photos).toBe('Photos');
    expect(state.folder).toBe('Download/Trip 2026.mp4');
    expect(state.target).toBe('folder');
  });

  it('records a failure without losing an earlier success', () => {
    const state = replay([
      { type: 'save/started', target: 'photos' },
      { type: 'save/succeeded', location: 'Photos' },
      { type: 'save/started', target: 'folder' },
      { type: 'save/failed', failure },
    ]);

    expect(state.status).toBe('failed');
    expect(state.failure).toBe(failure);
    expect(state.photos).toBe('Photos');
    expect(state.folder).toBeNull();
  });

  it('treats a closed picker as no attempt at all', () => {
    const state = replay([
      { type: 'save/started', target: 'folder' },
      { type: 'save/skipped' },
    ]);

    expect(state.status).toBe('idle');
    expect(state.failure).toBeNull();
    expect(state.folder).toBeNull();
  });

  it('ignores a result that arrives without an attempt in flight', () => {
    const stale: SaveAction[] = [
      { type: 'save/succeeded', location: 'Photos' },
      { type: 'save/failed', failure },
      { type: 'save/skipped' },
    ];

    for (const action of stale) {
      expect(saveReducer(initialSaveState, action)).toBe(initialSaveState);
    }
  });

  it('refuses a second success while the first is still saving', () => {
    const saving = saveReducer(initialSaveState, { type: 'save/started', target: 'photos' });
    const once = saveReducer(saving, { type: 'save/succeeded', location: 'Photos' });
    const twice = saveReducer(once, { type: 'save/succeeded', location: 'Photos again' });

    expect(twice).toBe(once);
  });

  it('reset forgets every destination', () => {
    const saved = replay([
      { type: 'save/started', target: 'photos' },
      { type: 'save/succeeded', location: 'Photos' },
    ]);

    expect(saveReducer(saved, { type: 'save/reset' })).toEqual(initialSaveState);
  });
});

describe('save helpers', () => {
  it('reports a save in flight', () => {
    const saving = saveReducer(initialSaveState, { type: 'save/started', target: 'folder' });

    expect(isSaving(saving)).toBe(true);
    expect(isSaving(initialSaveState)).toBe(false);
  });

  it('names the destinations in sentences', () => {
    expect(targetLabel('photos')).toBe('Photos');
    expect(targetLabel('folder')).toBe('a folder');
  });
});

describe('destinations per kind of file', () => {
  it('offers both destinations for media', () => {
    expect(saveTargets('media')).toEqual(['photos', 'folder']);
    expect(canSaveTo('media', 'photos')).toBe(true);
    expect(canSaveTo('media', 'folder')).toBe(true);
  });

  it('offers only the folder for a subtitle file', () => {
    // MediaStore has no collection for a document, so Photos is not offered.
    expect(saveTargets('subtitle')).toEqual(['folder']);
    expect(canSaveTo('subtitle', 'photos')).toBe(false);
    expect(canSaveTo('subtitle', 'folder')).toBe(true);
  });
});

describe('describeSaveFailure', () => {
  it('keeps the promise that the file still exists', () => {
    const photos = describeSaveFailure(new Error('boom'), 'photos');
    const folder = describeSaveFailure(new Error('boom'), 'folder');

    expect(photos.code).toBe('save-failed');
    expect(photos.recovery).toMatch(/app cache/);
    expect(folder.code).toBe('save-failed');
    expect(folder.recovery).toMatch(/app cache/);
  });

  it('names the destination that refused the copy', () => {
    expect(describeSaveFailure(new Error('boom'), 'photos').message).toMatch(/media library/i);
    expect(describeSaveFailure(new Error('boom'), 'folder').message).toMatch(/folder you chose/i);
  });

  it('maps a full disk and a refused permission to their own titles', () => {
    expect(describeSaveFailure(new Error('write failed: No space left on device'), 'folder').title).toBe(
      'Not enough space',
    );
    expect(describeSaveFailure(new Error('Permission denied'), 'photos').title).toBe('Access refused');
  });

  it('keeps the raw message as detail and survives a non-error throw', () => {
    expect(describeSaveFailure(new Error('copy failed hard'), 'photos').detail).toBe('copy failed hard');
    expect(describeSaveFailure(undefined, 'folder').detail).toBeUndefined();
  });
});
