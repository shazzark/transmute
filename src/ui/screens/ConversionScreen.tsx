import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Sharing from 'expo-sharing';
import { usePathname, useRootNavigationState, useRouter } from 'expo-router';

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
import { decideBatchStart } from '../../application/batchStart';
import { notificationDestination } from '../../application/notificationDestination';
import { recoverInterruptedJob } from '../../application/recoverInterrupted';
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
import { clearConversionMarker, interruptedRecoveryPorts, markConversionRunning, removeJobOutput, removePickedSource } from '../../native/jobFiles';
import { savePorts } from '../../native/saveDestination';
import { sidecarPorts } from '../../native/subtitlePicker';
import { Banner } from '../components/Banner';
import { BrandHeader } from '../components/BrandHeader';
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
  const router = useRouter();
  const pathname = usePathname();
  const rootNavigationState = useRootNavigationState();
  const detailsId = pathname.startsWith('/results/') ? pathname.slice('/results/'.length) : null;
  const showHome = pathname === '/' || pathname === '/index';
  const showQueue = pathname === '/queue';
  const showResults = pathname === '/results' || detailsId !== null;
  const showNotices = pathname === '/notices';
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
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [recoveryReady, setRecoveryReady] = useState(false);
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
  const handledNotification = useRef<string | null>(null);

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

  useEffect(() => {
    let active = true;
    void recoverInterruptedJob(interruptedRecoveryPorts).then((interrupted) => {
      if (active && interrupted) {
        setRecoveryNotice('A previous conversion stopped unexpectedly. Its partial files were removed; add the source again to retry.');
        AccessibilityInfo.announceForAccessibility('A previous conversion was interrupted. Partial files were removed.');
      }
      if (active) setRecoveryReady(true);
    }).catch(() => {
      if (active) {
        setRecoveryNotice('Transmute could not clean files left by an interrupted conversion. Check available storage, then restart the app before converting.');
        setRecoveryReady(false);
      }
    });
    return () => { active = false; };
  }, []);

  // expo-notifications responses cover app-open, background, and cold launches.
  // The native foreground notification uses its own transmute://results intent.
  useEffect(() => {
    if (!rootNavigationState?.key) return;
    const openResults = (response: Notifications.NotificationResponse) => {
      const destination = notificationDestination(response.notification.request.content.data);
      const identifier = response.notification.request.identifier;
      if (handledNotification.current === identifier) return;
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
      if (destination === null) return;
      handledNotification.current = identifier;
      if (pathname !== destination) router.push(destination as never);
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(openResults);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openResults(response);
    }).catch(() => undefined);
    return () => subscription.remove();
  }, [rootNavigationState?.key, pathname, router]);

  // The channel must exist before Android presents its notification permission prompt.
  // This controller stays mounted in the root layout, so route changes cannot prompt again.
  useEffect(() => {
    let active = true;
    void (async () => {
      if (Platform.OS !== 'android') return;
      try {
        await Notifications.setNotificationChannelAsync('transmute_progress', {
          name: 'Conversions',
          importance: Notifications.AndroidImportance.LOW,
          vibrationPattern: [],
          enableVibrate: false,
        });
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Transmute updates',
          importance: Notifications.AndroidImportance.LOW,
          vibrationPattern: [],
          enableVibrate: false,
        });
        let permissions = await Notifications.getPermissionsAsync();
        if (permissions.status !== 'granted' && permissions.status === 'undetermined') {
          permissions = await Notifications.requestPermissionsAsync();
        }
        if (active) {
          setNotificationNotice(
            permissions.granted ? null : NOTIFICATION_UNAVAILABLE,
          );
        }
      } catch {
        if (active) setNotificationNotice(NOTIFICATION_UNAVAILABLE);
      }
    })();
    return () => { active = false; };
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

  useEffect(
    () => foregroundPorts.onTimeout(() => {
      cancelSignal.current.cancelled = true;
      apply({ type: 'queue/cancelAll' });
      cancelActiveConversion();
      setNotificationNotice('Android stopped the background conversion after its data transfer time limit. Open Transmute to start it again.');
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

  const handleShare = useCallback(async (output: OutputFile) => {
    try {
      if (!(await Sharing.isAvailableAsync())) {
        setShareNotice('Sharing is not available on this device.');
        return;
      }
      await Sharing.shareAsync(output.path, { dialogTitle: 'Share converted file' });
      setShareNotice(null);
    } catch {
      setShareNotice('The file could not be shared. Try saving it to a folder first.');
    }
  }, []);

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
    if (!recoveryReady) return;
    const decision = decideBatchStart(mirror.current, runningBatch.current);
    if (!decision.start) {
      return;
    }

    const batchSize = decision.batchSize;
    runningBatch.current = true;
    cancelSignal.current = { cancelled: false };
    setBatchSummary(null);
    apply({ type: 'queue/runRequested' });

    const notifications = createNotificationPublisher(foregroundPorts);
    publisher.current = notifications;
    // A sidecar belongs to one file, so it is only muxed when the batch is that
    // file; otherwise nine videos would silently receive the same subtitles.
    const sidecar = batchSize === 1 ? subtitles.sidecar : null;

    try {
      try {
        await markConversionRunning();
      } catch {
        setRecoveryNotice('Restart cleanup could not be prepared. The conversion can still run, but a forced app stop may leave temporary files.');
      }
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
      try {
        await clearConversionMarker();
      } catch {
        setRecoveryNotice('Temporary file cleanup could not be recorded. If Transmute restarts, it may remove this session’s cached results.');
      }
      const counts = queueCounts(mirror.current);
      const summary = describeOutcome({
        total: counts.total,
        converted: counts.complete,
        failed: counts.failed,
        cancelled: counts.cancelled,
      });
      setBatchSummary(summary);
      AccessibilityInfo.announceForAccessibility(summary);
      if (counts.total > 0 && counts.complete === counts.total) {
        void Notifications.scheduleNotificationAsync({
          content: {
            title: 'Conversion Complete',
            body: counts.total === 1 ? 'Your converted file is ready.' : 'Your converted files are ready.',
            data: { url: '/results' },
          },
          trigger: null,
        }).catch(() => undefined);
      }
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
    recoveryReady,
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
        apply({ type: 'queue/removed', id: job.id });
        void removePickedSource(job.source.path).catch(() => {
          setRecoveryNotice(`The cached source for ${job.source.name} could not be removed. Clear storage from Android settings if needed.`);
        });
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
    const finished = mirror.current.jobs.filter((job) => job.status === 'complete' || job.status === 'failed' || job.status === 'cancelled');
    apply({ type: 'queue/cleared' });
    // A cleared row cannot keep the copy panel; ask the queue, which now knows.
    setFocusId((current) =>
      current !== null && jobById(mirror.current, current) === null ? null : current,
    );
    void Promise.all(finished.flatMap((job) => [
      removePickedSource(job.source.path),
      ...(job.output === null ? [] : [removeJobOutput(job.output.path)]),
    ])).catch(() => setRecoveryNotice('Some cleared job files could not be removed from cache. Check available storage.'));
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
            : !recoveryReady
              ? 'Wait for interrupted-file cleanup before converting.'
            : undefined;

  return (
    <View style={styles.screen}>
      {showQueue ? (
        <QueuePanel
          state={queue}
          focusId={focusId}
          disabled={saveState.status === 'saving'}
          onCancelJob={handleCancelJob}
          onRetryJob={handleRetryJob}
          onSelectJob={handleSelectJob}
          onCancelAll={handleCancelAll}
          onClearFinished={handleClearFinished}
          leadingContent={(
            <View style={styles.inner}>
              <View style={styles.header}>
                <BrandHeader />
                <Text style={styles.subtitle} allowFontScaling>
                  Convert videos into another format â€” or take out just the audio â€” on this device.
                  Nothing is uploaded.
                </Text>
              </View>
              <View style={styles.navigation} accessibilityRole="tablist">
                {([
                  ['/', 'Convert', showHome],
                  ['/queue', `Queue${counts.queued + counts.converting ? ` (${counts.queued + counts.converting})` : ''}`, showQueue],
                  ['/results', `Results${counts.complete ? ` (${counts.complete})` : ''}`, showResults],
                ] as const).map(([path, label, selected]) => (
                  <Pressable
                    key={path}
                    onPress={() => router.push(path as never)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    style={[styles.navTab, selected && styles.navTabSelected]}
                  >
                    <Text style={[styles.navText, selected && styles.navTextSelected]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              {notificationNotice !== null ? (
                <Banner variant="info" title="No progress notification" message={notificationNotice} />
              ) : null}
              {running !== null ? (
                <ProgressPanel
                  phaseLabel={`Converting ${positionOf(queue, running.id)} of ${queue.jobs.length} â€” ${running.source.name}`}
                  percent={running.indeterminate ? null : running.progress}
                  elapsedMs={running.elapsedMs}
                  variant={running.indeterminate ? 'indeterminate' : 'determinate'}
                />
              ) : null}
            </View>
          )}
          trailingContent={batchSummary !== null && running === null ? (
            <Banner
              variant={counts.failed > 0 ? 'warning' : counts.cancelled > 0 ? 'info' : 'success'}
              title="Queue finished"
              message={batchSummary}
              {...(counts.failed > 0
                ? { recovery: 'Tap Try again on a failed row to convert that file once more.' }
                : {})}
            />
          ) : null}
        />
      ) : (
      <ScrollView contentContainerStyle={styles.content} style={styles.scroll}>
        <View style={styles.inner}>
          <View style={styles.header}>
            <BrandHeader />
            <Text style={styles.subtitle} allowFontScaling>
              Convert videos into another format — or take out just the audio — on this device.
              Nothing is uploaded.
            </Text>
          </View>

          <View style={styles.navigation} accessibilityRole="tablist">
            {([
              ['/', 'Convert', showHome],
              ['/queue', `Queue${counts.queued + counts.converting ? ` (${counts.queued + counts.converting})` : ''}`, showQueue],
              ['/results', `Results${counts.complete ? ` (${counts.complete})` : ''}`, showResults],
            ] as const).map(([path, label, selected]) => (
              <Pressable
                key={path}
                onPress={() => router.push(path as never)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                style={[styles.navTab, selected && styles.navTabSelected]}
              >
                <Text style={[styles.navText, selected && styles.navTextSelected]}>{label}</Text>
              </Pressable>
            ))}
          </View>

          {showHome ? <View style={styles.section}>
            <Text style={styles.sectionLabel} allowFontScaling accessibilityRole="header">
              Source files
            </Text>
            {queue.jobs.length === 0 ? (
              <PrimaryButton
                label="Select videos"
                onPress={handleChoose}
                disabled={busy || subtitleBusy || !recoveryReady}
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
          </View> : null}

          {showHome && pickFailure !== null ? (
            <Banner
              variant="error"
              title={pickFailure.title}
              message={pickFailure.message}
              recovery={pickFailure.recovery}
              {...(pickFailure.detail ? { detail: pickFailure.detail } : {})}
            />
          ) : null}

          {showHome && recoveryNotice !== null ? (
            <Banner variant="warning" title="Interrupted conversion" message={recoveryNotice} />
          ) : null}

          {showQueue && queue.jobs.length > 0 ? (
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

          {showQueue && notificationNotice !== null ? (
            <Banner variant="info" title="No progress notification" message={notificationNotice} />
          ) : null}

          {showHome ? <View style={styles.section}>
            <Text style={styles.sectionLabel} allowFontScaling accessibilityRole="header">
              Output format
            </Text>
            <PresetSelector
              selectedId={queue.presetId}
              onSelect={handleSelectPreset}
              buildEncoders={buildEncoders}
              inputHasVideo={state.summary?.hasVideo ?? null}
              inputHasAudio={state.summary?.hasAudio ?? null}
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
          </View> : null}

          {showHome && previewJob !== null && state.summary ? (
            <ConversionSummary
              sourceName={previewJob.source.name}
              summary={state.summary}
              preset={preset}
            />
          ) : null}

          {showHome && previewJob !== null && state.source && state.summary ? (
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

          {showQueue && running !== null ? (
            <ProgressPanel
              phaseLabel={`Converting ${positionOf(queue, running.id)} of ${
                queue.jobs.length
              } — ${running.source.name}`}
              percent={running.indeterminate ? null : running.progress}
              elapsedMs={running.elapsedMs}
              variant={running.indeterminate ? 'indeterminate' : 'determinate'}
            />
          ) : null}

          {showResults && detailsId !== null && finishedOutput !== null ? (
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
              <SecondaryButton
                label="Share"
                onPress={() => { if (finishedOutput) void handleShare(finishedOutput); }}
              />
              {shareNotice !== null ? <Text style={styles.caption}>{shareNotice}</Text> : null}
            </View>
          ) : null}

          {showResults ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel} accessibilityRole="header">{detailsId === null ? 'Converted files' : 'Result details'}</Text>
              {detailsId !== null ? (
                <>
                  {finishedOutput === null ? <Text style={styles.caption}>This result is no longer in this session.</Text> : null}
                  <SecondaryButton label="Back to results" onPress={() => router.replace('/results' as never)} />
                </>
              ) : null}
              {detailsId === null && queue.jobs.filter((job) => job.status === 'complete').length === 0 ? (
                <Text style={styles.caption}>Successful conversions from this app session appear here. History is kept in memory and clears when Transmute restarts.</Text>
              ) : null}
              {detailsId === null ? queue.jobs.filter((job) => job.status === 'complete' && job.output !== null).map((job) => (
                <View key={job.id} style={styles.resultRow}>
                  <Pressable
                    style={styles.resultName}
                    onPress={() => { setFocusId(job.id); router.push(`/results/${job.id}` as never); }}
                    accessibilityRole="button"
                    accessibilityLabel={`Open result details for ${job.output?.name ?? job.source.name}`}
                  >
                    <Text style={styles.resultKind} accessibilityLabel={job.source.mimeType?.startsWith('audio/') ? 'Audio result' : 'Video result'}>
                      {job.source.mimeType?.startsWith('audio/') ? 'AUDIO' : 'VIDEO'}
                    </Text>
                    <Text style={styles.resultTitle}>{job.output?.name}</Text>
                    <Text style={styles.caption}>Output: {job.output?.name.split('.').pop()?.toUpperCase() ?? 'Unknown format'}</Text>
                    <Text style={styles.caption}>Source: {job.source.name}{job.source.sizeBytes === null ? '' : ` · ${Math.round(job.source.sizeBytes / 1024)} KB`}</Text>
                    <Text style={styles.caption}>App cache: {job.output?.path}</Text>
                  </Pressable>
                  <SecondaryButton label="Save to Phone" onPress={() => { setFocusId(job.id); void attemptSave('folder', job.output!); }} />
                  <SecondaryButton label="Share" onPress={() => { if (job.output) void handleShare(job.output); }} />
                </View>
              )) : null}
            </View>
          ) : null}

          {showNotices ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel} accessibilityRole="header">Open-source notices</Text>
              <Text style={styles.resultTitle}>Transmute application code</Text>
              <Text style={styles.caption}>MIT License. The full license is included as LICENSE in the Transmute source repository.</Text>
              <Text style={styles.resultTitle}>Media engine</Text>
              <Text style={styles.caption}>munim-ffmpeg 0.9.2 includes an Apache-2.0 wrapper and FFmpeg 9.0.2 built under LGPLv3 without GPL codecs. The LGPL text, component notices, source offer, build configuration, and relinking instructions are in THIRD_PARTY_NOTICES.md and scripts/ffmpeg-build.md in the source repository.</Text>
              <Text style={styles.resultTitle}>Bundled native components</Text>
              <Text style={styles.caption}>FFmpeg (LGPLv3); LAME and FriBidi (LGPL 2.x); Opus and libvpx (BSD 3-Clause); dav1d and libaom (BSD 2-Clause; libaom also has a patent license); OpenH264 (BSD); libass (ISC); FreeType (FTL); HarfBuzz (MIT); fontconfig (MIT-style); expat (MIT); mbedTLS (Apache 2.0); and zlib (zlib license). The repository notice records upstream terms; a line-by-line audit remains a release gate.</Text>
              <Text style={styles.caption}>The app performs conversions locally. It does not contact a server to fetch notices or media.</Text>
              <SecondaryButton label="Back to Convert" onPress={() => router.replace('/' as never)} />
            </View>
          ) : null}

          {showHome ? <SecondaryButton label="Open-source notices" onPress={() => router.push('/notices' as never)} /> : null}

          {showQueue && batchSummary !== null && running === null ? (
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
      )}

      {/* Without a file there is nothing to convert, so the action bar stays away. */}
      {showHome && queue.jobs.length > 0 ? (
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
                !recoveryReady ||
                runningBatch.current ||
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
          {running === null ? (
            <SecondaryButton label="View Queue" onPress={() => router.push('/queue' as never)} />
          ) : null}
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
  navigation: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  navTab: {
    minHeight: 48,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: color.surface,
  },
  navTabSelected: {
    backgroundColor: color.accent,
  },
  navText: {
    color: color.textSecondary,
    fontSize: type.label.fontSize,
  },
  navTextSelected: {
    color: color.bg,
  },
  resultRow: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  resultName: {
    gap: spacing.xs,
  },
  resultTitle: {
    color: color.textPrimary,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
  resultKind: {
    color: color.accent,
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    fontWeight: '700',
    letterSpacing: 0.7,
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
