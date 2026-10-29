import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, Text, View } from 'react-native';

import { initialJobState, jobReducer, type JobAction } from '../../application/convertJob';
import { extractSubtitles } from '../../application/extractSubtitles';
import { runQueue } from '../../application/runQueue';
import {
  prepareSource,
  runConversion,
  type CancelSignal,
  type ConversionResult,
} from '../../application/runConversion';
import { saveOutput } from '../../application/saveOutput';
import {
  createNotificationPublisher,
  notificationForQueue,
  type NotificationPublisher,
} from '../../application/serviceNotification';
import { chooseSidecar } from '../../application/sidecar';
import { resolveAvailability } from '../../domain/encoders';
import { describePickFailure, describeUnexpectedFailure, type Failure } from '../../domain/errors';
import { describeOutcome } from '../../domain/jobNotification';
import type { OutputFile } from '../../domain/mediaFiles';
import { baseNameOf } from '../../domain/naming';
import { getPreset, type PresetId } from '../../domain/presets';
import {
  activeJob,
  canStartQueue,
  initialQueueState,
  jobById,
  nextQueuedJob,
  positionOf,
  queueCounts,
  queueReducer,
  type QueueAction,
  type QueueJob,
  type QueueState,
} from '../../domain/queue';
import {
  initialSaveState,
  savedLocation,
  saveReducer,
  targetLabel,
  type SaveTarget,
} from '../../domain/saveIntent';
import {
  initialSubtitleState,
  isSubtitleBusy,
  subtitleReducer,
  type ExtractedSubtitleFile,
} from '../../domain/subtitleIntent';
import { resolveSubtitleAvailability, type SubtitleFormat } from '../../domain/subtitles';
import { cancelActiveConversion, enginePorts } from '../../native/ffmpeg';
import { pickSourceFiles } from '../../native/documentPicker';
import { foregroundPorts } from '../../native/foregroundService';
import { savePorts } from '../../native/saveDestination';
import { sidecarPorts } from '../../native/subtitlePicker';
import { Banner } from '../components/Banner';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ConversionSummary } from '../components/ConversionSummary';
import { PresetSelector } from '../components/PresetSelector';
import { PrimaryButton } from '../components/PrimaryButton';
import { ProgressPanel } from '../components/ProgressPanel';
import { QueuePanel } from '../components/QueuePanel';
import { SavePanel } from '../components/SavePanel';
import { SecondaryButton } from '../components/SecondaryButton';
import { SubtitlePanel } from '../components/SubtitlePanel';
import { VideoPreviewCard, type PreviewState } from '../components/VideoPreviewCard';
import { color, layout, spacing, type } from '../tokens';

/** Shown once when Android 13+ notification permission is refused (TR-29). */
const NOTIFICATION_UNAVAILABLE =
  'Notifications are off for Transmute, so this conversion shows no progress in the notification shade. It still runs, and the queue here stays accurate.';

/** Which confirmation dialog is open, if any. */
type Confirmation = 'job' | 'all';

/**
 * The conversion screen: pick several files, convert them one after another.
 *
 * Three states share this screen, and each one owns one question:
 *
 * - `queue` (domain/queue) owns the batch: what is queued, what is running, what
 *   failed and why. It is the single source of truth the rows render from.
 * - `state` (the Phase 1 job machine) owns the *focused* file's probed summary, so
 *   the preview card and the subtitle tools still work for a single selection.
 * - the component owns the long-running loop: it asks the queue for the next row,
 *   runs one conversion, and never runs two at once.
 *
 * A batch of one behaves like Phase 2 did: it is probed on selection and copied to
 * Photos when it finishes. A batch of many does less automatically on purpose —
 * twenty files must not quietly fill the photo library — so each finished row
 * offers its own copy instead.
 */
export function ConversionScreen(): React.JSX.Element {
  const [state, dispatch] = useReducer(jobReducer, initialJobState);
  const [queue, queueDispatch] = useReducer(queueReducer, initialQueueState);
  const [saveState, saveDispatch] = useReducer(saveReducer, initialSaveState);
  const [subtitles, subtitleDispatch] = useReducer(subtitleReducer, initialSubtitleState);
  /**
   * The extracted subtitle file has its own copy state: a saved sidecar must not
   * make the video claim it is already in a folder, or the other way round.
   */
  const [subtitleSaveState, subtitleSaveDispatch] = useReducer(saveReducer, initialSaveState);
  /** Which embedded track to extract; `null` means the first one. */
  const [selectedTrackIndex, setSelectedTrackIndex] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  /** The row whose finished file the copy panel is working on. */
  const [focusId, setFocusId] = useState<string | null>(null);
  /** A picker that returned nothing usable; shown above the queue. */
  const [pickFailure, setPickFailure] = useState<Failure | null>(null);
  /** The sentence shown when the batch stops, summarising every row (TR-30). */
  const [batchSummary, setBatchSummary] = useState<string | null>(null);
  const [notificationNotice, setNotificationNotice] = useState<string | null>(null);
  /**
   * Encoders the bundled engine reported, or `null` while the list is unknown.
   * The grid uses it to grey out formats this build cannot write; a failed read
   * leaves it `null` so the user is not blocked on a diagnostic query — the
   * conversion path still names any missing codec.
   */
  const [buildEncoders, setBuildEncoders] = useState<readonly string[] | null>(null);

  const cancelSignal = useRef<CancelSignal>({ cancelled: false });
  /** Guards the picker and the subtitle tools, which must not overlap. */
  const working = useRef(false);
  /** Guards the batch loop against a second Convert tap. */
  const runningBatch = useRef(false);
  /**
   * The queue as the loop sees it. The reducer stays the source of truth for the
   * screen, but a running loop cannot wait for a render to learn whether the row
   * it just finished is done or whether Cancel All landed, so every action goes
   * through `apply` and updates this mirror in the same step.
   */
  const mirror = useRef<QueueState>(initialQueueState);
  /** Where a "cancel this job" tap should land once the user confirms. */
  const cancelTarget = useRef<string | null>(null);
  const publisher = useRef<NotificationPublisher | null>(null);

  const apply = useCallback((action: QueueAction): QueueState => {
    const next = queueReducer(mirror.current, action);
    mirror.current = next;
    queueDispatch(action);
    return next;
  }, []);

  const preset = getPreset(queue.presetId);
  const availability = resolveAvailability(preset, buildEncoders);
  const running = activeJob(queue);
  const busy = running !== null;
  /** A single selection keeps the preview, the summary, and the subtitle tools. */
  const singleJob = queue.jobs.length === 1 ? queue.jobs[0]! : null;
  /**
   * The preview describes one file, and only the file that was actually probed.
   * After a batch is cleared down to a single row, that row may be a different
   * file; showing its name beside the other file's resolution would be a lie.
   */
  const previewJob =
    singleJob !== null && state.source !== null && state.source.path === singleJob.source.path
      ? singleJob
      : null;
  const subtitleAvailability = resolveSubtitleAvailability(preset, buildEncoders);
  const subtitleTracks = state.summary?.subtitleTracks ?? [];
  const subtitleBusy = isSubtitleBusy(subtitles);
  /** A sidecar cannot be muxed into a container with no subtitle stream. */
  const sidecarBlocksFormat = subtitles.sidecar !== null && !subtitleAvailability.available;
  const focusedJob = focusId === null ? null : jobById(queue, focusId);
  const finishedOutput =
    focusedJob !== null && focusedJob.status === 'complete' ? focusedJob.output : null;

  // One query per app run: the engine caches its own `-encoders` report.
  useEffect(() => {
    let active = true;
    enginePorts
      .listEncoders()
      .then((encoders) => {
        if (active) {
          setBuildEncoders(encoders);
        }
      })
      .catch(() => {
        if (active) {
          setBuildEncoders(null);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // Each finished file has its own copy state, so the copy panel's state is reset
  // explicitly when the shown file changes (see `handleSelectJob` and the batch
  // loop) rather than in an effect: an effect would race the automatic copy that
  // a single-file batch starts as soon as the file is done.

  // A copy out of the cache is a second event: it can succeed or fail on its own.
  useEffect(() => {
    if (saveState.status === 'saved') {
      AccessibilityInfo.announceForAccessibility(
        `Saved to ${savedLocation(saveState, saveState.target) ?? targetLabel(saveState.target)}`,
      );
    } else if (saveState.status === 'failed' && saveState.failure) {
      AccessibilityInfo.announceForAccessibility(saveState.failure.message);
    }
  }, [saveState]);

  // The subtitle file's copy is announced separately, because it is a separate file.
  useEffect(() => {
    if (subtitleSaveState.status === 'saved') {
      AccessibilityInfo.announceForAccessibility(
        `Subtitle file saved to ${
          savedLocation(subtitleSaveState, subtitleSaveState.target) ??
          targetLabel(subtitleSaveState.target)
        }`,
      );
    } else if (subtitleSaveState.status === 'failed' && subtitleSaveState.failure) {
      AccessibilityInfo.announceForAccessibility(subtitleSaveState.failure.message);
    }
  }, [subtitleSaveState]);

  // A rejected subtitle file says why before the job even starts (TR-20).
  useEffect(() => {
    if (subtitles.sidecarStatus === 'failed' && subtitles.sidecarFailure) {
      AccessibilityInfo.announceForAccessibility(subtitles.sidecarFailure.message);
    } else if (subtitles.sidecarStatus === 'ready' && subtitles.sidecar) {
      AccessibilityInfo.announceForAccessibility(`Subtitle file ready: ${subtitles.sidecar.name}`);
    }
  }, [subtitles.sidecarStatus, subtitles.sidecar, subtitles.sidecarFailure]);

  useEffect(() => {
    if (subtitles.extractionStatus === 'done' && subtitles.extractionOutput) {
      AccessibilityInfo.announceForAccessibility(
        `Subtitles extracted to ${subtitles.extractionOutput.name}`,
      );
    } else if (subtitles.extractionStatus === 'failed' && subtitles.extractionFailure) {
      AccessibilityInfo.announceForAccessibility(subtitles.extractionFailure.message);
    }
  }, [subtitles.extractionStatus, subtitles.extractionOutput, subtitles.extractionFailure]);

  /**
   * Cancel from the notification.
   *
   * The notification is the only control a user has while the phone is locked, so
   * its Cancel stops the batch the way Cancel All does: the running job is asked
   * to stop through the engine, and nothing further starts (TR-10, TR-11).
   */
  useEffect(
    () =>
      foregroundPorts.onCancel(() => {
        cancelSignal.current.cancelled = true;
        apply({ type: 'queue/cancelAll' });
        cancelActiveConversion();
      }),
    [apply],
  );

  /** Copies one finished output to one destination; never touches the job state. */
  const attemptSave = useCallback(async (target: SaveTarget, output: OutputFile) => {
    await saveOutput({
      request: { kind: 'media', target, path: output.path, name: output.name },
      ports: savePorts,
      dispatch: saveDispatch,
    });
  }, []);

  /**
   * Copies the extracted subtitle file out of the cache.
   *
   * A subtitle is a document, not media, so the folder is the only destination;
   * the kind also decides the MIME type the folder receives it under.
   */
  const attemptSubtitleSave = useCallback(
    async (target: SaveTarget, output: ExtractedSubtitleFile) => {
      await saveOutput({
        request: { kind: 'subtitle', target, path: output.path, name: output.name },
        ports: savePorts,
        dispatch: subtitleSaveDispatch,
      });
    },
    [],
  );

  const handleSave = useCallback(
    (target: SaveTarget) => {
      if (finishedOutput === null) {
        return;
      }
      void attemptSave(target, finishedOutput);
    },
    [attemptSave, finishedOutput],
  );

  const handleSaveSubtitles = useCallback(() => {
    if (subtitles.extractionOutput === null) {
      return;
    }
    void attemptSubtitleSave('folder', subtitles.extractionOutput);
  }, [attemptSubtitleSave, subtitles.extractionOutput]);

  /**
   * Adds files to the queue.
   *
   * A single file is probed straight away, exactly as Phase 1 did, so the preview
   * card and the subtitle tools have something to show before Convert. Several
   * files are not probed here: each is probed when its turn comes, which avoids
   * spending a second on every file in a batch the user may never start.
   */
  const handleChoose = useCallback(async () => {
    if (working.current) {
      return;
    }
    working.current = true;
    try {
      const outcome = await pickSourceFiles();

      if (outcome.status === 'cancelled') {
        return;
      }
      if (outcome.status === 'failed') {
        setPickFailure(describePickFailure(outcome.error));
        return;
      }

      setPickFailure(null);
      setBatchSummary(null);
      const next = apply({ type: 'queue/added', sources: outcome.sources });
      AccessibilityInfo.announceForAccessibility(
        `${outcome.sources.length} ${outcome.sources.length === 1 ? 'file' : 'files'} added to the queue`,
      );

      const first = outcome.sources[0];
      if (next.jobs.length === 1 && outcome.sources.length === 1 && first !== undefined) {
        // Tracks and sidecars belong to the file they were chosen for, not to the app.
        subtitleDispatch({ type: 'subtitles/reset' });
        setSelectedTrackIndex(null);
        cancelSignal.current = { cancelled: false };
        await prepareSource({
          source: first,
          preset: getPreset(mirror.current.presetId),
          ports: enginePorts,
          dispatch,
          cancelSignal: cancelSignal.current,
        });
      }
    } finally {
      working.current = false;
    }
  }, [apply]);

  const handleSelectPreset = useCallback(
    (presetId: PresetId) => {
      const next = apply({ type: 'queue/presetSelected', presetId });
      // The focused file's encoder was resolved for the old format, so the job
      // state has to agree with the queue about which format this is.
      if (next.presetId === presetId) {
        dispatch({ type: 'preset/selected', presetId });
      }
    },
    [apply],
  );

  const handleChooseSidecar = useCallback(async () => {
    if (working.current) {
      return;
    }
    working.current = true;
    try {
      await chooseSidecar({ ports: sidecarPorts, dispatch: subtitleDispatch });
    } finally {
      working.current = false;
    }
  }, []);

  const handleClearSidecar = useCallback(() => {
    subtitleDispatch({ type: 'sidecar/cleared' });
  }, []);

  const handleSelectSubtitleFormat = useCallback((format: SubtitleFormat) => {
    subtitleDispatch({ type: 'extract/formatSelected', format });
    // The previous file was written in the old format, so its copy no longer
    // describes what the panel shows.
    subtitleSaveDispatch({ type: 'save/reset' });
  }, []);

  const handleSelectTrack = useCallback((streamIndex: number) => {
    setSelectedTrackIndex(streamIndex);
  }, []);

  const handleExtract = useCallback(async () => {
    const source = state.source;
    const summary = state.summary;
    // The extract buttons are not rendered without a probed source, so this is a
    // guard for the frame between a source change and the next render.
    if (source === null || summary === null || working.current) {
      return;
    }
    const streamIndex = selectedTrackIndex ?? summary.subtitleTracks[0]?.streamIndex ?? null;
    if (streamIndex === null) {
      return;
    }

    working.current = true;
    try {
      // A new extraction writes a new file, so the previous copy's destination
      // must not be shown against it.
      subtitleSaveDispatch({ type: 'save/reset' });
      await extractSubtitles({
        sourcePath: source.path,
        sourceName: source.name,
        streamIndex,
        format: subtitles.extractionFormat,
        ports: enginePorts,
        dispatch: subtitleDispatch,
      });
    } finally {
      working.current = false;
    }
  }, [state.source, state.summary, selectedTrackIndex, subtitles.extractionFormat]);

  /** Shows the notification for the state the queue is in, if anything is running. */
  const publish = useCallback((next: QueueState) => {
    const content = notificationForQueue(next);
    const active = publisher.current;
    if (active === null || content === null) {
      return;
    }
    void active.publish(content);
  }, []);

  /**
   * Runs the batch: one row at a time, from the queue's own order.
   *
   * The loop is started by the button and stopped by the queue: `nextJob` answers
   * `null` when there is nothing queued, and Cancel All clears that answer. That is
   * why there is no cancel branch in the loop itself — the reducer already made
   * the decision, and this code only obeys it (TR-09, PR-11).
   */
  const handleConvert = useCallback(async () => {
    if (runningBatch.current) {
      return;
    }
    if (!canStartQueue(mirror.current)) {
      return;
    }

    const batchSize = mirror.current.jobs.length;
    runningBatch.current = true;
    cancelSignal.current = { cancelled: false };
    setBatchSummary(null);
    apply({ type: 'queue/runRequested' });

    const notifications = createNotificationPublisher(foregroundPorts);
    publisher.current = notifications;
    // Asked before the first byte so the notification is there from the start. A
    // refusal is stated once; it never blocks the conversion (TR-29).
    const canNotify = await notifications.prepare();
    setNotificationNotice(canNotify ? null : NOTIFICATION_UNAVAILABLE);

    // A sidecar belongs to one file, so it is only muxed when the batch is that
    // file; otherwise nine videos would silently receive the same subtitles.
    const sidecar = batchSize === 1 ? subtitles.sidecar : null;

    try {
      await runQueue({
        nextJob: () => (mirror.current.stopRequested ? null : nextQueuedJob(mirror.current)),
        onStarted: (job) => {
          const next = apply({ type: 'queue/started', id: job.id });
          publish(next);
          AccessibilityInfo.announceForAccessibility(
            `Converting ${positionOf(next, job.id)} of ${next.jobs.length}: ${job.source.name}`,
          );
        },
        convert: (job: QueueJob) => {
          // Each row starts with its own signal, and the ref is pointed at it so
          // the notification's Cancel and the row buttons still reach the row
          // that is running. One signal shared by the batch would mean
          // cancelling the third file quietly cancelled the seven behind it
          // (PR-11, TR-11).
          const signal: CancelSignal = { cancelled: false };
          cancelSignal.current = signal;

          // The focused file's probed summary is reused only for that file and
          // that format; anything else is probed again inside runConversion.
          const prepared =
            batchSize === 1 &&
            state.source !== null &&
            state.summary !== null &&
            state.encoderName !== null &&
            state.source.path === job.source.path &&
            state.presetId === mirror.current.presetId
              ? { summary: state.summary, encoderName: state.encoderName, presetId: state.presetId }
              : null;

          return runConversion({
            source: job.source,
            preset: getPreset(mirror.current.presetId),
            ports: enginePorts,
            dispatch: (action: JobAction) => {
              // Only the single-file preview tracks the job machine; in a batch
              // there is no focused file to keep in step.
              if (batchSize === 1) {
                dispatch(action);
              }
              if (action.type === 'convert/progress') {
                publish(
                  apply({
                    type: 'queue/progress',
                    id: job.id,
                    percent: action.percent,
                    elapsedMs: action.elapsedMs,
                  }),
                );
              }
            },
            cancelSignal: signal,
            ...(prepared !== null ? { prepared } : {}),
            ...(sidecar !== null ? { sidecar } : {}),
          });
        },
        onFinished: (job, result: ConversionResult) => {
          if (result.status === 'done' && result.outputPath !== null) {
            const output: OutputFile = {
              name: baseNameOf(result.outputPath),
              path: result.outputPath,
            };
            publish(apply({ type: 'queue/completed', id: job.id, output }));
            setFocusId(job.id);
            // Reset before the copy starts, so the automatic copy's own "Saving…"
            // state is not wiped by a later render.
            saveDispatch({ type: 'save/reset' });
            AccessibilityInfo.announceForAccessibility(`${job.source.name} converted`);
            // One file keeps Phase 2's behaviour: the copy to Photos is attempted
            // straight away. A batch does not, so twenty files cannot fill the
            // photo library without being asked.
            if (batchSize === 1) {
              void attemptSave('photos', output);
            }
            return;
          }

          if (result.status === 'cancelled') {
            publish(apply({ type: 'queue/cancelled', id: job.id }));
            AccessibilityInfo.announceForAccessibility(`${job.source.name} cancelled`);
            return;
          }

          const failure = result.failure ?? describeUnexpectedFailure(new Error('No reason given.'));
          publish(apply({ type: 'queue/failed', id: job.id, failure }));
          AccessibilityInfo.announceForAccessibility(
            `${job.source.name} failed: ${failure.message}`,
          );
        },
      });
    } finally {
      runningBatch.current = false;
      publisher.current = null;
      await notifications.clear();
      const counts = queueCounts(mirror.current);
      const summary = describeOutcome({
        total: counts.total,
        converted: counts.complete,
        failed: counts.failed,
        cancelled: counts.cancelled,
      });
      setBatchSummary(summary);
      AccessibilityInfo.announceForAccessibility(summary);
    }
  }, [
    apply,
    attemptSave,
    dispatch,
    publish,
    state.encoderName,
    state.presetId,
    state.source,
    state.summary,
    subtitles.sidecar,
  ]);

  /**
   * A row's Cancel button.
   *
   * A queued row has written nothing, so it is cancelled immediately — there is
   * no partial file to warn about. A running row is the only one worth a dialog,
   * because cancelling it throws away work in progress (PR-11, TR-11).
   */
  const handleCancelJob = useCallback(
    (job: QueueJob) => {
      if (job.status === 'queued') {
        apply({ type: 'queue/cancelled', id: job.id });
        return;
      }
      if (job.status !== 'converting') {
        return;
      }
      cancelTarget.current = job.id;
      setConfirmation('job');
    },
    [apply],
  );

  const handleCancelAll = useCallback(() => {
    const counts = queueCounts(mirror.current);
    if (counts.queued === 0 && counts.converting === 0) {
      return;
    }
    setConfirmation('all');
  }, []);

  const handleConfirmed = useCallback(() => {
    const kind = confirmation;
    setConfirmation(null);

    if (kind === 'job') {
      const id = cancelTarget.current;
      cancelTarget.current = null;
      if (id === null) {
        return;
      }
      // Signalled before the engine call so a job that starts reporting success
      // from a half-written output still lands as cancelled.
      cancelSignal.current.cancelled = true;
      apply({ type: 'queue/cancelRequested', id });
      cancelActiveConversion();
      return;
    }

    if (kind === 'all') {
      cancelSignal.current.cancelled = true;
      apply({ type: 'queue/cancelAll' });
      cancelActiveConversion();
    }
  }, [apply, confirmation]);

  const handleRetryJob = useCallback(
    (job: QueueJob) => {
      const next = apply({ type: 'queue/retried', id: job.id });
      if (next.jobs.some((row) => row.id === job.id && row.status === 'queued')) {
        // The previous summary described a batch that no longer exists.
        setBatchSummary(null);
      }
    },
    [apply],
  );

  const handleClearFinished = useCallback(() => {
    apply({ type: 'queue/cleared' });
    // A cleared row cannot keep the copy panel; ask the queue, which now knows.
    setFocusId((current) =>
      current !== null && jobById(mirror.current, current) === null ? null : current,
    );
  }, [apply]);

  const handleSelectJob = useCallback((job: QueueJob) => {
    // The copy panel describes one file; showing a different one starts over.
    saveDispatch({ type: 'save/reset' });
    setFocusId(job.id);
  }, []);

  const summaryState: PreviewState =
    state.status === 'probing'
      ? 'probing'
      : state.source === null
        ? 'empty'
        : state.failure && state.summary === null
          ? 'unsupported'
          : 'ready';

  const counts = queueCounts(queue);
  const queuedCount = counts.queued;
  const convertDisabledReason =
    queuedCount === 0
      ? 'Add a video to convert.'
      : !availability.available
        ? `${preset.label} is not available in this build.`
        : sidecarBlocksFormat
          ? `${subtitleAvailability.reason} Remove the subtitle file to convert anyway.`
          : previewJob !== null && state.failure && state.summary === null
            ? 'This file cannot be converted.'
            : undefined;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} style={styles.scroll}>
        <View style={styles.inner}>
          <View style={styles.header}>
            <Text style={styles.title} allowFontScaling accessibilityRole="header">
              Transmute
            </Text>
            <Text style={styles.subtitle} allowFontScaling>
              Convert videos into another format — or take out just the audio — on this device.
              Nothing is uploaded.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel} allowFontScaling accessibilityRole="header">
              Source files
            </Text>
            {queue.jobs.length === 0 ? (
              <PrimaryButton
                label="Select videos"
                onPress={handleChoose}
                disabled={busy || subtitleBusy}
                accessibilityLabel="Select one or more videos or audio files to convert"
              />
            ) : (
              <SecondaryButton
                label="Add videos"
                onPress={handleChoose}
                disabled={busy || subtitleBusy}
                accessibilityLabel="Add more files to the queue"
              />
            )}
            {previewJob !== null ? (
              <VideoPreviewCard
                state={summaryState}
                name={previewJob.source.name}
                sizeBytes={previewJob.source.sizeBytes}
                summary={state.summary}
                reason={state.failure?.message ?? null}
              />
            ) : null}
          </View>

          {pickFailure !== null ? (
            <Banner
              variant="error"
              title={pickFailure.title}
              message={pickFailure.message}
              recovery={pickFailure.recovery}
              {...(pickFailure.detail ? { detail: pickFailure.detail } : {})}
            />
          ) : null}

          {queue.jobs.length > 0 ? (
            <QueuePanel
              state={queue}
              focusId={focusId}
              disabled={saveState.status === 'saving'}
              onCancelJob={handleCancelJob}
              onRetryJob={handleRetryJob}
              onSelectJob={handleSelectJob}
              onCancelAll={handleCancelAll}
              onClearFinished={handleClearFinished}
            />
          ) : null}

          {notificationNotice !== null ? (
            <Banner variant="info" title="No progress notification" message={notificationNotice} />
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionLabel} allowFontScaling accessibilityRole="header">
              Output format
            </Text>
            <PresetSelector
              selectedId={queue.presetId}
              onSelect={handleSelectPreset}
              buildEncoders={buildEncoders}
              disabled={busy || subtitleBusy}
            />
            {queue.jobs.length === 0 ? (
              <Text style={styles.caption} allowFontScaling>
                Select a file above, then tap Convert to write a new file in this format.
              </Text>
            ) : (
              <Text style={styles.caption} allowFontScaling>
                Every file in the queue is written in this format, one at a time.
              </Text>
            )}
            {previewJob !== null && state.encoderName ? (
              <Text style={styles.caption} allowFontScaling>
                Encoder: {state.encoderName}
              </Text>
            ) : null}
          </View>

          {previewJob !== null && state.summary ? (
            <ConversionSummary
              sourceName={previewJob.source.name}
              summary={state.summary}
              preset={preset}
            />
          ) : null}

          {previewJob !== null && state.source && state.summary ? (
            <SubtitlePanel
              availability={subtitleAvailability}
              state={subtitles}
              saveState={subtitleSaveState}
              tracks={subtitleTracks}
              selectedTrackIndex={selectedTrackIndex}
              disabled={busy}
              onSelectTrack={handleSelectTrack}
              onChoose={handleChooseSidecar}
              onClear={handleClearSidecar}
              onSelectFormat={handleSelectSubtitleFormat}
              onExtract={handleExtract}
              onSaveSubtitles={handleSaveSubtitles}
            />
          ) : null}

          {running !== null ? (
            <ProgressPanel
              phaseLabel={`Converting ${positionOf(queue, running.id)} of ${
                queue.jobs.length
              } — ${running.source.name}`}
              percent={running.indeterminate ? null : running.progress}
              elapsedMs={running.elapsedMs}
              variant={running.indeterminate ? 'indeterminate' : 'determinate'}
            />
          ) : null}

          {finishedOutput !== null ? (
            <View style={styles.section}>
              <Text style={styles.pathLabel} allowFontScaling>
                {focusedJob?.source.name ?? 'Converted file'}
              </Text>
              <Text style={styles.pathLabel} allowFontScaling>
                In the app cache
              </Text>
              <Text style={styles.path} allowFontScaling selectable>
                {finishedOutput.path}
              </Text>
              <SavePanel state={saveState} onSave={handleSave} />
            </View>
          ) : null}

          {batchSummary !== null && running === null ? (
            <Banner
              variant={counts.failed > 0 ? 'warning' : counts.cancelled > 0 ? 'info' : 'success'}
              title="Queue finished"
              message={batchSummary}
              {...(counts.failed > 0
                ? { recovery: 'Tap Try again on a failed row to convert that file once more.' }
                : {})}
            />
          ) : null}
        </View>
      </ScrollView>

      {/* Without a file there is nothing to convert, so the action bar stays away. */}
      {queue.jobs.length > 0 ? (
        <View style={styles.actionBar}>
          {running !== null ? (
            <SecondaryButton
              label="Cancel all"
              onPress={handleCancelAll}
              destructive
              accessibilityLabel="Cancel every conversion in the queue"
            />
          ) : (
            <PrimaryButton
              label={
                queuedCount > 1
                  ? `Convert ${queuedCount} videos to ${preset.label}`
                  : `Convert to ${preset.label}`
              }
              onPress={() => {
                void handleConvert();
              }}
              disabled={
                !canStartQueue(queue) ||
                busy ||
                !availability.available ||
                subtitleBusy ||
                sidecarBlocksFormat ||
                (previewJob !== null && state.failure !== null && state.summary === null)
              }
              disabledReason={convertDisabledReason}
              accessibilityLabel={
                queuedCount > 1
                  ? `Convert ${queuedCount} videos to ${preset.label}`
                  : `Convert to ${preset.label}`
              }
            />
          )}
        </View>
      ) : null}

      <ConfirmDialog
        visible={confirmation !== null}
        title={confirmation === 'all' ? 'Cancel this batch?' : 'Cancel this conversion?'}
        message={
          confirmation === 'all'
            ? 'The running conversion stops and its partial file is deleted. Files that have not started are cancelled. Files already converted are kept.'
            : 'The partial output is deleted. The original file is not touched.'
        }
        confirmLabel={confirmation === 'all' ? 'Cancel everything' : 'Cancel conversion'}
        cancelLabel="Keep converting"
        onConfirm={handleConfirmed}
        onCancel={() => setConfirmation(null)}
        destructive
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.bg,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: layout.screenPadding,
    paddingBottom: spacing.xxxl,
  },
  inner: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    gap: layout.sectionGap,
  },
  header: {
    gap: spacing.sm,
  },
  title: {
    fontSize: type.display.fontSize,
    lineHeight: type.display.lineHeight,
    color: color.textPrimary,
  },
  subtitle: {
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    color: color.textSecondary,
  },
  section: {
    gap: spacing.sm,
  },
  sectionLabel: {
    fontSize: type.label.fontSize,
    lineHeight: type.label.lineHeight,
    color: color.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  caption: {
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    color: color.textSecondary,
  },
  pathLabel: {
    fontSize: type.label.fontSize,
    lineHeight: type.label.lineHeight,
    color: color.textPrimary,
  },
  path: {
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    color: color.accent,
  },
  actionBar: {
    gap: spacing.sm,
    padding: layout.screenPadding,
    borderTopWidth: 1,
    borderTopColor: color.border,
    backgroundColor: color.bg,
  },
});
