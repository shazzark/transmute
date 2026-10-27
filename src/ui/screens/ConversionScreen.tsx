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
import { FileSummaryCard } from '../components/FileSummaryCard';
import { PresetSelector } from '../components/PresetSelector';
import { PrimaryButton } from '../components/PrimaryButton';
import { ProgressPanel } from '../components/ProgressPanel';
import { SecondaryButton } from '../components/SecondaryButton';
import { color, layout, spacing, type } from '../tokens';

/**
 * The Phase 1 screen: one file, one preset, one conversion, real progress.
 *
 * State lives in the job reducer; this component only translates taps into
 * actions and engine calls into actions.
 */
export function ConversionScreen(): React.JSX.Element {
  const [state, dispatch] = useReducer(jobReducer, initialJobState);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const cancelSignal = useRef<CancelSignal>({ cancelled: false });
  const working = useRef(false);

  const busy = isBusy(state.status);
  const preset = getPreset(state.presetId);

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

  const summaryState =
    state.status === 'probing'
      ? 'probing'
      : state.source === null
        ? 'empty'
        : state.failure && state.summary === null
          ? 'unsupported'
          : 'ready';

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} style={styles.scroll}>
        <View style={styles.inner}>
          <Text style={styles.title} allowFontScaling accessibilityRole="header">
            Transmute
          </Text>
          <Text style={styles.subtitle} allowFontScaling>
            Convert on this device. Nothing is uploaded.
          </Text>

          <FileSummaryCard
            state={summaryState}
            name={state.source?.name ?? null}
            sizeBytes={state.source?.sizeBytes ?? null}
            summary={state.summary}
            reason={state.failure?.message ?? null}
          />

          <View style={styles.section}>
            <Text style={styles.sectionLabel} allowFontScaling>
              Output format
            </Text>
            <PresetSelector
              selectedId={state.presetId}
              onSelect={handleSelectPreset}
              disabled={busy}
            />
            {state.encoderName ? (
              <Text style={styles.caption} allowFontScaling>
                Encoder: {state.encoderName}
              </Text>
            ) : null}
          </View>

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

      <View style={styles.actionBar}>
        {state.status === 'converting' || state.status === 'cancelling' ? (
          <SecondaryButton
            label={state.status === 'cancelling' ? 'Cancelling…' : 'Cancel conversion'}
            onPress={() => setConfirmVisible(true)}
            disabled={state.status === 'cancelling'}
            destructive
          />
        ) : (
          <>
            <PrimaryButton
              label={state.source ? 'Choose another file' : 'Choose file'}
              onPress={handleChoose}
              disabled={busy}
              accessibilityLabel="Choose a video file"
            />
            <PrimaryButton
              label="Convert"
              onPress={handleConvert}
              disabled={!canConvert(state) || busy}
              disabledReason={
                state.source === null
                  ? 'Choose a file first.'
                  : state.summary === null
                    ? 'This file cannot be converted.'
                    : undefined
              }
              accessibilityLabel={`Convert ${state.source?.name ?? 'the chosen file'} to ${preset.label}`}
            />
          </>
        )}
      </View>

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
  title: {
    fontSize: type.display.fontSize,
    lineHeight: type.display.lineHeight,
    color: color.textPrimary,
  },
  subtitle: {
    marginTop: -spacing.md,
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

