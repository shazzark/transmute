import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
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
import { shouldPlayOpeningIntro } from '../../application/introLaunch';
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
import { updateQueueBadge } from '../navigation/queueBadge';

/** Shown once when Android 13+ notification permission is refused (TR-29). */
const NOTIFICATION_UNAVAILABLE =
  'Notifications are off for Transmute, so this conversion shows no progress in the notification shade. It still runs, and the queue here stays accurate.';

/** Which confirmation dialog is open, if any. */
type Confirmation = 'job' | 'all';

let introAlreadyShown = false;

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
  const showConvert = pathname === '/convert';
  const showQueue = pathname === '/queue';
  const showResults = pathname === '/results' || detailsId !== null;
  const showNotices = pathname === '/notices';
  const showActivity = pathname === '/activity';
  const showSettings = pathname === '/settings';
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
  const [notificationPermission, setNotificationPermission] = useState('Checking…');
  const [introVisible, setIntroVisible] = useState(false);
  const [introReducedMotion, setIntroReducedMotion] = useState(false);
  const introPath = useRef(pathname);

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

  useEffect(() => {
    updateQueueBadge(counts.queued + counts.converting);
  }, [counts.converting, counts.queued]);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void Notifications.getPermissionsAsync().then((permission) => {
        if (active) setNotificationPermission(permission.granted ? 'Allowed' : permission.status === 'undetermined' ? 'Not asked' : 'Off');
      }).catch(() => { if (active) setNotificationPermission('Unavailable'); });
    };
    refresh();
    const subscription = AppState.addEventListener('change', (stateName) => { if (stateName === 'active') refresh(); });
    return () => { active = false; subscription.remove(); };
  }, []);

  // Show the assembly animation only on a normal cold launch; notification launches skip it.
  useEffect(() => {
    if (introAlreadyShown) return;
    introAlreadyShown = true;
    let active = true;
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      const response = await Notifications.getLastNotificationResponseAsync().catch(() => null);
      if (!active || !shouldPlayOpeningIntro(introPath.current, response?.notification.request.content.data)) return;
      const reducedMotion = await AccessibilityInfo.isReduceMotionEnabled().catch(() => true);
      if (!active) return;
      setIntroReducedMotion(reducedMotion);
      setIntroVisible(true);
      const duration = reducedMotion ? 350 : 1550;
      fallbackTimer = setTimeout(() => { if (active) setIntroVisible(false); }, duration + 300);
    })();
    return () => {
      active = false;
      if (fallbackTimer !== undefined) clearTimeout(fallbackTimer);
    };
  }, []);

  useEffect(() => {
    if (pathname !== '/' && pathname !== '/index') setIntroVisible(false);
  }, [pathname]);

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
          {showHome ? (
            <HomeDashboard
              queue={queue}
              running={running}
              onConvert={() => router.push('/convert' as never)}
              onVideo={() => { handleSelectPreset('mp4'); router.push('/convert' as never); }}
              onAudio={() => { handleSelectPreset('mp3'); router.push('/convert' as never); }}
              onSubtitles={() => { handleSelectPreset('mp4'); router.push('/convert' as never); }}
              onActivity={() => router.push('/activity' as never)}
              onQueue={() => router.push('/queue' as never)}
              onResults={() => router.push('/results' as never)}
            />
          ) : null}
          {showConvert ? <View style={styles.header}>
            <BrandHeader />
            <Text style={styles.subtitle} allowFontScaling>
              Convert video or extract audio on this device. Nothing is uploaded.
            </Text>
          </View> : null}

          {showConvert ? <View style={styles.section}>
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

          {showConvert && pickFailure !== null ? (
            <Banner
              variant="error"
              title={pickFailure.title}
              message={pickFailure.message}
              recovery={pickFailure.recovery}
              {...(pickFailure.detail ? { detail: pickFailure.detail } : {})}
            />
          ) : null}

          {showConvert && recoveryNotice !== null ? (
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

          {showConvert ? <View style={styles.section}>
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

          {showConvert && previewJob !== null && state.summary ? (
            <ConversionSummary
              sourceName={previewJob.source.name}
              summary={state.summary}
              preset={preset}
            />
          ) : null}

          {showConvert && previewJob !== null && state.source && state.summary ? (
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

          {showActivity ? (
            <View style={styles.section}>
              <Text style={styles.title} accessibilityRole="header" allowFontScaling>Notifications</Text>
              <Text style={styles.caption} allowFontScaling>Conversion activity from this app session. It clears when Transmute restarts.</Text>
              {recoveryNotice !== null ? (
                <View style={styles.activityRow}>
                  <Text style={styles.resultTitle}>Interrupted</Text>
                  <Text style={styles.caption}>{recoveryNotice}</Text>
                </View>
              ) : null}
              {queue.jobs.filter((job) => ['complete', 'failed', 'cancelled'].includes(job.status)).slice().reverse().map((job) => (
                <Pressable
                  key={job.id}
                  style={styles.activityRow}
                  accessibilityRole="button"
                  accessibilityLabel={`${job.status === 'complete' ? 'Completed' : job.status === 'failed' ? 'Failed' : 'Cancelled'}: ${job.source.name}`}
                  onPress={() => job.status === 'complete' ? (setFocusId(job.id), router.push(`/results/${job.id}` as never)) : router.push('/queue' as never)}
                >
                  <Text style={styles.resultTitle}>{job.status === 'complete' ? 'Completed' : job.status === 'failed' ? 'Failed' : 'Cancelled'}</Text>
                  <Text style={styles.caption}>{job.source.name}</Text>
                  {job.failure ? <Text style={styles.caption}>{job.failure.message}</Text> : null}
                </Pressable>
              ))}
              {recoveryNotice === null && !queue.jobs.some((job) => ['complete', 'failed', 'cancelled'].includes(job.status)) ? (
                <Text style={styles.caption}>Completed or failed conversions will appear here.</Text>
              ) : null}
              <SecondaryButton label="Back" onPress={() => router.back()} />
            </View>
          ) : null}

          {showSettings ? (
            <View style={styles.section}>
              <Text style={styles.title} accessibilityRole="header" allowFontScaling>Settings</Text>
              <View style={styles.activityRow}>
                <Text style={styles.resultTitle}>Notifications</Text>
                <Text style={styles.caption}>Permission status: {notificationPermission}</Text>
                <SecondaryButton label="Open system notification settings" onPress={() => { void Linking.openSettings(); }} />
              </View>
              <View style={styles.activityRow}>
                <Text style={styles.resultTitle}>About Transmute</Text>
                <Text style={styles.caption}>Version {Constants.expoConfig?.version ?? 'unknown'}</Text>
                <Text style={styles.caption}>Transmute converts video and extracts audio locally on this device. Media files are not uploaded. Results and activity stay in memory for this app session and clear when it restarts.</Text>
              </View>
              <SecondaryButton label="Third-party notices and licenses" onPress={() => router.push('/notices' as never)} />
            </View>
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
              <SecondaryButton label="Back to Settings" onPress={() => router.replace('/settings' as never)} />
            </View>
          ) : null}

          {showConvert ? <SecondaryButton label="Open-source notices" onPress={() => router.push('/notices' as never)} /> : null}

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
      {showConvert && queue.jobs.length > 0 ? (
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
      {introVisible ? <IntroOverlay reducedMotion={introReducedMotion} /> : null}
    </View>
  );
}

function HomeDashboard({
  queue,
  running,
  onConvert,
  onVideo,
  onAudio,
  onSubtitles,
  onActivity,
  onQueue,
  onResults,
}: {
  readonly queue: QueueState;
  readonly running: QueueJob | null;
  readonly onConvert: () => void;
  readonly onVideo: () => void;
  readonly onAudio: () => void;
  readonly onSubtitles: () => void;
  readonly onActivity: () => void;
  readonly onQueue: () => void;
  readonly onResults: () => void;
}): React.JSX.Element {
  const recent = queue.jobs.filter((job) => job.status === 'complete' && job.output !== null).slice(-3).reverse();
  return (
    <View style={styles.dashboard}>
      <Entrance delay={0}><View style={styles.homeHeader}>
        <BrandHeader />
        <Pressable onPress={onActivity} accessibilityRole="button" accessibilityLabel="Open notifications and conversion activity" style={({ pressed }) => [styles.bell, pressed && styles.pressed]}>
          <View accessible={false} style={styles.bellShape}><View style={styles.bellDome} /><View style={styles.bellClapper} /></View>
        </Pressable>
      </View></Entrance>
      <Entrance delay={75}><View style={styles.introCopy}>
        <Text style={styles.title} accessibilityRole="header" allowFontScaling>Media tools, kept local.</Text>
        <Text style={styles.subtitle} allowFontScaling>Convert video, extract audio, and work with subtitles on this device. Your files stay on your phone.</Text>
      </View></Entrance>
      <Entrance delay={150}><Pressable onPress={onConvert} accessibilityRole="button" accessibilityLabel="Convert files" style={({ pressed }) => [styles.primaryCard, pressed && styles.pressed]}>
        <Text style={styles.primaryCardTitle}>Convert files</Text>
        <Text style={styles.primaryCardCopy}>Choose media and set an output format</Text>
        <Text style={styles.cardArrow} accessible={false}>→</Text>
      </Pressable></Entrance>
      <Entrance delay={225}><View style={styles.section}>
        <Text style={styles.sectionLabel} accessibilityRole="header">Quick tools</Text>
        <Shortcut label="Video conversion" detail="Choose a video and output format" icon="▶" onPress={onVideo} />
        <Shortcut label="Extract audio" detail="Start with MP3 audio output" icon="♫" onPress={onAudio} />
        <Shortcut label="Subtitle tools" detail="Choose a video to view its subtitle options" icon="CC" onPress={onSubtitles} />
      </View></Entrance>
      {running ? (
        <Pressable onPress={onQueue} accessibilityRole="button" accessibilityLabel="View the active conversion in Queue" style={styles.activityRow}>
          <Text style={styles.resultKind}>IN PROGRESS</Text>
          <Text style={styles.resultTitle} numberOfLines={2}>{running.source.name}</Text>
          <Text style={styles.caption}>{running.indeterminate ? 'Converting…' : `${running.progress}% complete`}</Text>
        </Pressable>
      ) : null}
      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionLabel} accessibilityRole="header">Recent results</Text>
          {recent.length > 0 ? <Pressable onPress={onResults} accessibilityRole="button" accessibilityLabel="View all results"><Text style={styles.link}>View all</Text></Pressable> : null}
        </View>
        {recent.length === 0 ? (
          <Text style={styles.caption}>Your converted files will appear here for this session.</Text>
        ) : recent.map((job) => (
          <Pressable key={job.id} onPress={onResults} accessibilityRole="button" style={styles.recentRow}>
            <Text style={styles.resultTitle} numberOfLines={1}>{job.output?.name}</Text>
            <Text style={styles.caption}>Ready to save or share</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Shortcut({ label, detail, icon, onPress }: { label: string; detail: string; icon: string; onPress: () => void }): React.JSX.Element {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.shortcut, pressed && styles.pressed]}>
      <Text style={styles.shortcutIcon} accessible={false}>{icon}</Text>
      <View style={styles.shortcutCopy}>
        <Text style={styles.resultTitle} allowFontScaling>{label}</Text>
        <Text style={styles.caption} allowFontScaling>{detail}</Text>
      </View>
      <Text style={styles.cardArrow} accessible={false}>›</Text>
    </Pressable>
  );
}

function Entrance({ children, delay }: { readonly children: React.ReactNode; readonly delay: number }): React.JSX.Element {
  const entrance = React.useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!active) return;
      if (reduced) {
        entrance.setValue(1);
        return;
      }
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(entrance, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    }).catch(() => entrance.setValue(1));
    return () => { active = false; };
  }, [delay, entrance]);
  return <Animated.View style={{ opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>{children}</Animated.View>;
}

/** The animated pieces assemble over a static copy of the established brand mark. */
function IntroOverlay({ reducedMotion }: { readonly reducedMotion: boolean }): React.JSX.Element {
  const progress = React.useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: reducedMotion ? 350 : 1550, useNativeDriver: true }).start();
  }, [progress, reducedMotion]);
  const pieceStyle = (dx: number, dy: number, rotation = '0deg') => ({
    opacity: progress.interpolate({ inputRange: [0, 0.65, 0.78], outputRange: [0.15, 1, 0] }),
    transform: [
      { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [dx, 0] }) },
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [dy, 0] }) },
      { rotate: rotation },
    ],
  });
  const finalMarkOpacity = reducedMotion
    ? progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] })
    : progress.interpolate({ inputRange: [0.5, 0.78, 1], outputRange: [0, 1, 1] });
  const wordmarkOpacity = reducedMotion
    ? progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] })
    : progress.interpolate({ inputRange: [0.78, 1], outputRange: [0, 1] });
  return (
    <View style={styles.introOverlay} accessible accessibilityViewIsModal accessibilityLabel="Transmute is starting">
      <View style={styles.markCanvas}>
        {!reducedMotion ? <>
          <Animated.View style={[styles.logoFrame, pieceStyle(-36, -24)]} />
          <Animated.View style={[styles.logoPlay, pieceStyle(0, 38)]} />
          <Animated.View style={[styles.logoArrow, pieceStyle(36, 22, '28deg')]} />
          <Animated.View style={[styles.logoArrowHeadOne, pieceStyle(-18, 20, '-50deg')]} />
          <Animated.View style={[styles.logoArrowHeadTwo, pieceStyle(-18, 20, '56deg')]} />
        </> : null}
        <Animated.Image source={require('../../../assets/brand-mark.png')} resizeMode="contain" style={[styles.assembledMark, { opacity: finalMarkOpacity }]} />
      </View>
      <Animated.Text style={[styles.introWordmark, { opacity: wordmarkOpacity }]}>Transmute</Animated.Text>
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
    paddingBottom: 120,
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
    marginBottom: 94,
    borderTopWidth: 1,
    borderTopColor: color.border,
    backgroundColor: color.bg,
  },
  dashboard: { gap: layout.sectionGap },
  homeHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bell: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: color.surface, borderWidth: 1, borderColor: color.border },
  bellShape: { width: 18, height: 21, alignItems: 'center', justifyContent: 'flex-end' },
  bellDome: { width: 15, height: 15, borderTopLeftRadius: 9, borderTopRightRadius: 9, borderWidth: 2, borderBottomWidth: 0, borderColor: color.textPrimary },
  bellClapper: { width: 19, height: 3, borderRadius: 2, backgroundColor: color.textPrimary, marginTop: 1 },
  introCopy: { gap: spacing.sm, paddingTop: spacing.sm },
  primaryCard: { minHeight: 104, borderRadius: 18, backgroundColor: color.accent, padding: spacing.lg, justifyContent: 'center', gap: spacing.xs, position: 'relative' },
  primaryCardTitle: { color: color.accentInk, fontSize: type.title.fontSize, lineHeight: type.title.lineHeight, fontWeight: '700' },
  primaryCardCopy: { color: color.accentInk, fontSize: type.body.fontSize, lineHeight: type.body.lineHeight },
  cardArrow: { color: color.textPrimary, fontSize: 23, lineHeight: 28 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { color: color.accent, fontSize: type.label.fontSize, lineHeight: type.label.lineHeight, textDecorationLine: 'underline' },
  shortcut: { minHeight: 64, padding: spacing.md, borderRadius: 14, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  shortcutIcon: { width: 36, height: 36, textAlign: 'center', textAlignVertical: 'center', color: color.accent, fontSize: 20, lineHeight: 36 },
  shortcutCopy: { flex: 1, gap: 2 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  activityRow: { gap: spacing.xs, padding: spacing.md, minHeight: 56, borderWidth: 1, borderColor: color.border, borderRadius: 12, backgroundColor: color.surface },
  recentRow: { minHeight: 54, justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border },
  introOverlay: { ...StyleSheet.absoluteFill, zIndex: 5, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  markCanvas: { width: 144, height: 144, position: 'relative' },
  logoFrame: { position: 'absolute', left: 24, top: 39, width: 68, height: 52, borderWidth: 8, borderColor: color.brandMint, borderRadius: 16 },
  logoPlay: { position: 'absolute', left: 54, top: 54, width: 0, height: 0, borderTopWidth: 13, borderBottomWidth: 13, borderLeftWidth: 22, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: color.textPrimary },
  logoArrow: { position: 'absolute', left: 83, top: 82, width: 38, height: 4, borderRadius: 2, backgroundColor: color.brandAmber },
  logoArrowHeadOne: { position: 'absolute', left: 105, top: 81, width: 17, height: 4, borderRadius: 2, backgroundColor: color.brandAmber },
  logoArrowHeadTwo: { position: 'absolute', left: 114, top: 82, width: 17, height: 4, borderRadius: 2, backgroundColor: color.brandAmber },
  assembledMark: { position: 'absolute', width: 144, height: 144, left: 0, top: 0 },
  introWordmark: { color: color.textPrimary, fontSize: type.title.fontSize, lineHeight: type.title.lineHeight, fontWeight: '700', letterSpacing: 0.2 },
});
