import { describe, expect, it } from 'vitest';

import {
  describeOutcome,
  notificationText,
  notificationTitle,
  runningNotification,
} from './jobNotification';

describe('notificationTitle', () => {
  it('puts the position in the batch in front of the total', () => {
    expect(notificationTitle(1, 3)).toBe('Converting 1 of 3');
    expect(notificationTitle(3, 3)).toBe('Converting 3 of 3');
  });

  it('clamps a position that cannot exist instead of printing nonsense', () => {
    expect(notificationTitle(0, 3)).toBe('Converting 1 of 3');
    expect(notificationTitle(7, 3)).toBe('Converting 3 of 3');
    expect(notificationTitle(1.6, 3.2)).toBe('Converting 2 of 3');
  });

  it('never claims zero files', () => {
    expect(notificationTitle(1, 0)).toBe('Converting 1 of 1');
  });
});

describe('notificationText', () => {
  it('names the file and its own percentage', () => {
    expect(notificationText('MyVideo.mp4', 45)).toBe('MyVideo.mp4 — 45%');
    expect(notificationText('MyVideo.mp4', 45.4)).toBe('MyVideo.mp4 — 45%');
    expect(notificationText('MyVideo.mp4', 45.6)).toBe('MyVideo.mp4 — 46%');
  });

  it('says "working" rather than inventing a number for an unknown length', () => {
    expect(notificationText('MyVideo.mp4', null)).toBe('MyVideo.mp4 — working…');
  });

  it('keeps a long name from swallowing the percentage', () => {
    const text = notificationText(`${'a'.repeat(80)}.mp4`, 10);
    expect(text.endsWith('— 10%')).toBe(true);
    expect(text.length).toBeLessThan(80);
  });

  it('has words for a file whose name the provider did not give', () => {
    expect(notificationText('   ', 10)).toBe('this file — 10%');
  });
});

describe('runningNotification', () => {
  it('reports the batch on the bar, so it does not restart for every file', () => {
    const content = runningNotification({
      position: 2,
      total: 3,
      name: 'Second.mp4',
      percent: 10,
      overallPercent: 36.6,
    });

    expect(content).toEqual({
      title: 'Converting 2 of 3',
      text: 'Second.mp4 — 10%',
      percent: 37,
    });
  });

  it('keeps the bar determinate while the current file has no duration', () => {
    const content = runningNotification({
      position: 1,
      total: 2,
      name: 'Clipped.mp4',
      percent: null,
      overallPercent: 50,
    });

    expect(content.text).toBe('Clipped.mp4 — working…');
    expect(content.percent).toBe(50);
  });

  it('holds the bar inside 0–100 even if a caller works in the wrong units', () => {
    expect(
      runningNotification({ position: 1, total: 1, name: 'a.mp4', percent: 5, overallPercent: 130 })
        .percent,
    ).toBe(100);
    expect(
      runningNotification({ position: 1, total: 1, name: 'a.mp4', percent: 5, overallPercent: -4 })
        .percent,
    ).toBe(0);
    expect(
      runningNotification({
        position: 1,
        total: 1,
        name: 'a.mp4',
        percent: 5,
        overallPercent: Number.NaN,
      }).percent,
    ).toBe(0);
  });
});

describe('describeOutcome', () => {
  it('reports a clean batch in one sentence', () => {
    expect(describeOutcome({ total: 3, converted: 3, failed: 0, cancelled: 0 })).toBe(
      '3 converted of 3.',
    );
  });

  it('names every outcome instead of folding it into "done"', () => {
    expect(describeOutcome({ total: 4, converted: 1, failed: 2, cancelled: 1 })).toBe(
      '1 converted, 2 failed, 1 cancelled of 4.',
    );
  });

  it('says how many are still waiting', () => {
    expect(describeOutcome({ total: 3, converted: 1, failed: 0, cancelled: 0 })).toBe(
      '1 converted, 2 waiting of 3.',
    );
  });

  it('does not pretend an empty queue finished something', () => {
    expect(describeOutcome({ total: 0, converted: 0, failed: 0, cancelled: 0 })).toBe(
      'Nothing to convert.',
    );
  });
});
