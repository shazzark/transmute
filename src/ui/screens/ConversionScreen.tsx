import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, Text, View } from 'react-native';

import { canConvert, initialJobState, isBusy, jobReducer } from '../../application/convertJob';
import { prepareSource, runConversion, type CancelSignal } from '../../application/runConversion';
import { describePickFailure } from '../../domain/errors';
import { getPreset, type PresetId } from '../../domain/presets';
import { cancelActiveConversion, enginePorts } from '../../native/ffmpeg';
import { pickSourceFile } from '../../native/documentPicker';
import { Banner } from '../components/Banner';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ConversionSummary } from '../components/ConversionSummary';
import { PresetSelector } from '../components/PresetSelector';
import { PrimaryButton } from '../components/PrimaryButton';
import { ProgressPanel } from '../components/ProgressPanel';
import { SecondaryButton } from '../components/SecondaryButton';
import { VideoPreviewCard, type PreviewState } from '../components/VideoPreviewCard';
import { color, layout, spacing, type } from '../tokens';

/**
 * The Phase 1 screen: one source video, one output format, one conversion.
 *
 * The layout is the familiar converter shape — Select Video, file preview,
 * output format, Convert — and the source → output card states, before the job
 * starts, exactly which file will be written. State lives in the job reducer;
 * this component only translates taps into actions and engine calls into
 * actions.
 */
export function ConversionScreen(): React.JSX.Element {
  const [state, dispatch] = useReducer(jobReducer, initialJobState);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const cancelSignal = useRef<CancelSignal>({ cancelled: false });
  const working = useRef(false);

  const busy = isBusy(state.status);
  const preset = getPreset(state.presetId);
  const converting = state.status === 'converting' || state.status === 'cancelling';

  // Announce phase changes once, not on every statistics tick (TR-20).
  useEffect(() => {
    if (state.status === 'done') {
      AccessibilityInfo.announceForAccessibility('Conversion complete');
    } else if (state.status === 'failed' && state.failure) {
      AccessibilityInfo.announceForAccessibility(state.failure.message);
    } else if (state.status === 'cancelled') {
      AccessibilityInfo.announceForAccessibility('Conversion cancelled');
    }
  }, [state.status, state.failure]);

  const handleChoose = useCallback(async () => {
    if (working.current) {
      return;
    }
    working.current = true;
    try {
      const outcome = await pickSourceFile();

      if (outcome.status === 'cancelled') {
        dispatch({ type: 'pick/cancelled' });
        return;
      }
      if (outcome.status === 'failed') {
        dispatch({ type: 'pick/failed', failure: describePickFailure(outcome.error) });
        return;
      }

      cancelSignal.current = { cancelled: false };
      await prepareSource({
        source: outcome.source,
        preset: getPreset(state.presetId),
        ports: enginePorts,
        dispatch,
        cancelSignal: cancelSignal.current,
      });
    } finally {
      working.current = false;
    }
  }, [state.presetId]);

  const handleConvert = useCallback(async () => {
    if (!state.source || !state.summary || working.current) {
      return;
    }
    working.current = true;
    try {
      cancelSignal.current = { cancelled: false };
      await runConversion({
        source: state.source,
        preset: getPreset(state.presetId),
        ports: enginePorts,
        dispatch,
        cancelSignal: cancelSignal.current,
        prepared: { summary: state.summary, encoderName: state.encoderName ?? 'audio-only' },
      });
    } finally {
      working.current = false;
    }
  }, [state.source, state.summary, state.presetId, state.encoderName]);

  const handleSelectPreset = useCallback((presetId: PresetId) => {
    dispatch({ type: 'preset/selected', presetId });
  }, []);

  const handleConfirmCancel = useCallback(() => {
    setConfirmVisible(false);
    cancelSignal.current.cancelled = true;
    dispatch({ type: 'convert/cancelRequested' });
    cancelActiveConversion();
  }, []);

  const summaryState: PreviewState =
    state.status === 'probing'
      ? 'probing'
      : state.source === null
        ? 'empty'
        : state.failure && state.summary === null
          ? 'unsupported'
          : 'ready';

  const convertDisabledReason =
    state.status === 'probing'
      ? 'Reading the video. This takes a moment.'
      : state.failure && state.summary === null
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
              Convert a video into another format on this device. Nothing is uploaded.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel} allowFontScaling accessibilityRole="header">
              Source video
            </Text>
            {state.source === null ? (
              <PrimaryButton
                label="Select Video"
                onPress={handleChoose}
                disabled={busy}
                accessibilityLabel="Select a video to convert"
              />
            ) : (
              <SecondaryButton
                label="Select Video"
                onPress={handleChoose}
                disabled={busy}
                accessibilityLabel={`Select a different video to replace ${state.source.name}`}
              />
            )}
            <VideoPreviewCard
              state={summaryState}
              name={state.source?.name ?? null}
              sizeBytes={state.source?.sizeBytes ?? null}
              summary={state.summary}
              reason={state.failure?.message ?? null}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel} allowFontScaling accessibilityRole="header">
              Output format
            </Text>
            <PresetSelector
              selectedId={state.presetId}
              onSelect={handleSelectPreset}
              disabled={busy}
            />
            {state.source === null ? (
              <Text style={styles.caption} allowFontScaling>
                Select a video above, then tap Convert to write a new file in this format.
              </Text>
            ) : null}
            {state.encoderName ? (
              <Text style={styles.caption} allowFontScaling>
                Encoder: {state.encoderName}
              </Text>
            ) : null}
          </View>

          {state.source && state.summary ? (
            <ConversionSummary
              sourceName={state.source.name}
              summary={state.summary}
              preset={preset}
            />
          ) : null}

          {state.status === 'converting' || state.status === 'cancelling' ? (
            <ProgressPanel
              phaseLabel={
                state.status === 'cancelling' ? 'Cancelling…' : `Converting to ${preset.label}`
              }
              percent={state.indeterminate ? null : state.progress}
              elapsedMs={state.elapsedMs}
              variant={state.indeterminate ? 'indeterminate' : 'determinate'}
            />
          ) : null}

          {state.status === 'done' && state.output ? (
            <View style={styles.section}>
              <ProgressPanel
                phaseLabel="Conversion complete"
                percent={100}
                elapsedMs={state.elapsedMs}
                variant="complete"
              />
              <Text style={styles.pathLabel} allowFontScaling>
                Saved to the app cache
              </Text>
              <Text style={styles.path} allowFontScaling selectable>
                {state.output.path}
              </Text>
              <Text style={styles.caption} allowFontScaling>
                Saving to a folder you choose arrives in the next phase. Copy this file out
                before you uninstall the app.
              </Text>
            </View>
          ) : null}

          {state.status === 'cancelled' ? (
            <Banner
              variant="info"
              title="Cancelled"
              message="The conversion stopped and its temporary files were removed."
              recovery="Convert again to start a new attempt."
            />
          ) : null}

          {state.failure && state.status === 'failed' ? (
            <Banner
              variant="error"
              title={state.failure.title}
              message={state.failure.message}
              recovery={state.failure.recovery}
              {...(state.failure.detail ? { detail: state.failure.detail } : {})}
            />
          ) : null}
        </View>
      </ScrollView>

      {/* Without a source there is nothing to convert, so Convert stays hidden. */}
      {state.source !== null ? (
        <View style={styles.actionBar}>
          {converting ? (
            <SecondaryButton
              label={state.status === 'cancelling' ? 'Cancelling…' : 'Cancel conversion'}
              onPress={() => setConfirmVisible(true)}
              disabled={state.status === 'cancelling'}
              destructive
            />
          ) : (
            <PrimaryButton
              label={`Convert to ${preset.label}`}
              onPress={handleConvert}
              disabled={!canConvert(state) || busy}
              disabledReason={convertDisabledReason}
              accessibilityLabel={`Convert ${state.source.name} to ${preset.label}`}
            />
          )}
        </View>
      ) : null}

      <ConfirmDialog
        visible={confirmVisible}
        title="Cancel this conversion?"
        message="The partial output is deleted. The original file is not touched."
        confirmLabel="Cancel conversion"
        cancelLabel="Keep converting"
        onConfirm={handleConfirmCancel}
        onCancel={() => setConfirmVisible(false)}
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

