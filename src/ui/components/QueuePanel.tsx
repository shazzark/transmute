import React, { type ReactNode } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import {
  canRetry,
  isCancellable,
  queueCounts,
  type QueueJob,
  type QueueState,
} from '../../domain/queue';
import { formatBytes, queueStatusLabel } from '../format';
import { color, layout, radius, spacing, type, weight } from '../tokens';
import { bottomNavigationClearance } from '../layout';
import { ProgressBar, type ProgressTone } from './ProgressBar';
import { SecondaryButton } from './SecondaryButton';

export interface QueuePanelProps {
  readonly state: QueueState;
  /** The converted row whose copy panel is showing, if any. */
  readonly focusId: string | null;
  /** True while a copy is running: cancelling or retrying now would race it. */
  readonly disabled: boolean;
  readonly bottomInset?: number;
  readonly onCancelJob: (job: QueueJob) => void;
  readonly onRetryJob: (job: QueueJob) => void;
  /** A converted row becomes the row whose file the copy panel works on. */
  readonly onSelectJob: (job: QueueJob) => void;
  readonly onCancelAll: () => void;
  readonly onClearFinished: () => void;
  readonly leadingContent?: ReactNode;
  readonly trailingContent?: ReactNode;
}

const TONES: Record<QueueJob['status'], ProgressTone> = {
  queued: 'accent',
  converting: 'accent',
  complete: 'success',
  failed: 'danger',
  cancelled: 'accent',
};

/** A sentence that says how much of the batch is left, in the user's terms. */
function summaryLine(state: QueueState): string {
  const counts = queueCounts(state);
  const parts = [`${counts.total} ${counts.total === 1 ? 'video' : 'videos'}`];
  if (counts.converting > 0) {
    parts.push('converting now');
  }
  if (counts.queued > 0) {
    parts.push(`${counts.queued} waiting`);
  }
  const finished = counts.complete + counts.failed + counts.cancelled;
  if (finished > 0 && counts.converting === 0 && counts.queued === 0) {
    parts.push('all finished');
  }
  return parts.join(' · ');
}

function JobRow({
  job,
  focused,
  disabled,
  onCancel,
  onRetry,
  onSelect,
}: {
  readonly job: QueueJob;
  readonly focused: boolean;
  readonly disabled: boolean;
  readonly onCancel: () => void;
  readonly onRetry: () => void;
  readonly onSelect: () => void;
}): React.JSX.Element {
  const status = queueStatusLabel(job);
  const size = formatBytes(job.source.sizeBytes);
  const showBar = job.status === 'converting' || job.status === 'complete';
  const percent = job.indeterminate ? null : job.progress;

  return (
    <View
      style={[styles.row, focused ? styles.rowFocused : null]}
      accessibilityLabel={`${job.source.name}, ${status}`}
    >
      <Text style={styles.name} allowFontScaling numberOfLines={2}>
        {job.source.name}
      </Text>
      <Text style={[styles.status, job.status === 'failed' ? styles.statusFailed : null]} allowFontScaling>
        {size === null ? status : `${status} · ${size}`}
      </Text>

      {showBar ? (
        <ProgressBar
          percent={job.status === 'complete' ? 100 : percent}
          tone={TONES[job.status]}
          label={`${job.source.name}: ${status}`}
        />
      ) : null}

      {job.status === 'failed' && job.failure ? (
        <>
          <Text style={styles.failure} allowFontScaling>
            {job.failure.message}
          </Text>
          <Text style={styles.failure} allowFontScaling>
            {job.failure.recovery}
          </Text>
        </>
      ) : null}

      <View style={styles.actions}>
        {isCancellable(job) ? (
          <SecondaryButton
            label={job.status === 'queued' ? 'Remove' : job.cancelRequested ? 'Cancelling…' : 'Cancel'}
            onPress={onCancel}
            disabled={disabled || job.cancelRequested}
            destructive
            accessibilityLabel={job.status === 'queued' ? `Remove ${job.source.name} from the queue` : `Cancel ${job.source.name}`}
          />
        ) : null}
        {canRetry(job) ? (
          <SecondaryButton
            label={job.attempts > 0 ? 'Try again' : 'Retry'}
            onPress={onRetry}
            disabled={disabled}
            accessibilityLabel={`Try converting ${job.source.name} again`}
          />
        ) : null}
        {job.status === 'complete' ? (
          <SecondaryButton
            label={focused ? 'Showing' : 'Show file'}
            onPress={onSelect}
            disabled={disabled || focused}
            accessibilityLabel={`Show the converted ${job.source.name}`}
          />
        ) : null}
      </View>
    </View>
  );
}

/**
 * The batch, as rows.
 *
 * Every row shows its own state, so the screen never has to explain a queue in
 * prose: the row is queued, converting with a real percentage, converted, failed
 * with the reason, or cancelled. Cancel all is offered only while there is
 * something to cancel, and clearing finished rows is offered only when something
 * has actually finished — a button that does nothing is worse than no button.
 */
export function QueuePanel({
  state,
  focusId,
  disabled,
  bottomInset = 0,
  onCancelJob,
  onRetryJob,
  onSelectJob,
  onCancelAll,
  onClearFinished,
  leadingContent,
  trailingContent,
}: QueuePanelProps): React.JSX.Element {
  const counts = queueCounts(state);
  const canCancelAll = counts.queued > 0 || counts.converting > 0;
  const finished = counts.total - counts.queued - counts.converting;

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={[styles.panel, { paddingBottom: bottomNavigationClearance(bottomInset) + layout.screenPadding }]}
      data={state.jobs}
      keyExtractor={(job) => job.id}
      initialNumToRender={8}
      maxToRenderPerBatch={8}
      windowSize={7}
      ListHeaderComponent={(
        <>
          {leadingContent}
          <View style={styles.header}>
            <Text style={styles.label} allowFontScaling accessibilityRole="header">Queue</Text>
            <Text style={styles.summary} allowFontScaling>{summaryLine(state)}</Text>
          </View>
        </>
      )}
      ListEmptyComponent={<Text style={styles.summary}>The queue is empty.</Text>}
      renderItem={({ item: job }) => (
        <JobRow
          job={job}
          focused={job.id === focusId}
          disabled={disabled}
          onCancel={() => onCancelJob(job)}
          onRetry={() => onRetryJob(job)}
          onSelect={() => onSelectJob(job)}
        />
      )}
      ListFooterComponent={(
        <>
      <View style={styles.actions}>
        {canCancelAll ? (
          <SecondaryButton
            label="Cancel all"
            onPress={onCancelAll}
            disabled={disabled}
            destructive
            accessibilityLabel="Cancel every conversion in the queue"
          />
        ) : null}
        {finished > 0 ? (
          <SecondaryButton
            label="Clear finished"
            onPress={onClearFinished}
            disabled={disabled}
            accessibilityLabel="Remove finished, failed, and cancelled rows from the queue"
          />
        ) : null}
      </View>
          {trailingContent}
        </>
      )}
    />
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.sm,
    padding: layout.screenPadding,
  },
  list: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  label: {
    fontSize: type.label.fontSize,
    lineHeight: type.label.lineHeight,
    color: color.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summary: {
    flexShrink: 1,
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    color: color.textSecondary,
    textAlign: 'right',
  },
  row: {
    backgroundColor: color.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  rowFocused: {
    borderColor: color.accent,
  },
  name: {
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    fontWeight: weight.label,
    color: color.textPrimary,
  },
  status: {
    fontSize: type.label.fontSize,
    lineHeight: type.label.lineHeight,
    color: color.textSecondary,
  },
  statusFailed: {
    color: color.danger,
  },
  failure: {
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    color: color.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
