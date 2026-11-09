import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';

import type { SubtitleTrack } from 'expo-video';

import { color, radius, spacing, touchTarget, type, weight } from '../tokens';

export interface ResultPlayerProps {
  readonly uri: string;
  readonly label: string;
  readonly mimeType: string | null;
}

/** Uses Android's native media player for both audio-only and video results. */
export function ResultPlayer({ uri, label, mimeType }: ResultPlayerProps): React.JSX.Element {
  const player = useVideoPlayer(uri);
  const audioOnly = mimeType?.startsWith('audio/') ?? false;
  const [tracks, setTracks] = useState<SubtitleTrack[]>(() => player.availableSubtitleTracks);
  const [selectedKey, setSelectedKey] = useState<string | null>(() => trackKey(player.subtitleTrack, 0));

  // Read the snapshot as well as listening for load events, since a cached local
  // file can report its tracks before the component's event subscription mounts.
  useEffect(() => {
    setTracks(player.availableSubtitleTracks);
  }, [player]);
  useEventListener(player, 'sourceLoad', ({ availableSubtitleTracks }) => {
    setTracks(availableSubtitleTracks);
  });
  useEventListener(player, 'availableSubtitleTracksChange', ({ availableSubtitleTracks }) => {
    setTracks(availableSubtitleTracks);
  });
  useEventListener(player, 'subtitleTrackChange', ({ subtitleTrack }) => {
    setSelectedKey(trackKey(subtitleTrack, tracks.findIndex((track) => track === subtitleTrack)));
  });

  return (
    <View>
      <View style={[styles.frame, audioOnly ? styles.audioFrame : null]}>
        <VideoView
          player={player}
          style={styles.player}
          nativeControls
          contentFit="contain"
          surfaceType="textureView"
          accessibilityLabel={`Play ${audioOnly ? 'audio' : 'video'} ${label}`}
        />
      </View>
      {!audioOnly && tracks.length > 0 ? (
        <View style={styles.subtitlePicker} accessibilityRole="radiogroup" accessibilityLabel="Subtitle tracks">
          <Text style={styles.subtitleHeading} allowFontScaling accessibilityRole="header">Subtitles</Text>
          <View style={styles.trackOptions}>
            <Pressable
              accessibilityRole="radio"
              accessibilityLabel="Subtitles off"
              accessibilityState={{ selected: selectedKey === null }}
              onPress={() => {
                player.subtitleTrack = null;
                setSelectedKey(null);
              }}
              style={[styles.trackOption, selectedKey === null ? styles.trackOptionSelected : null]}
            >
              <Text style={[styles.trackText, selectedKey === null ? styles.trackTextSelected : null]} allowFontScaling>
                Off
              </Text>
            </Pressable>
            {tracks.map((track, index) => {
              const key = trackKey(track, index)!;
              const selected = selectedKey === key;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="radio"
                  accessibilityLabel={`Subtitle track ${track.label || track.name || track.language || `Track ${index + 1}`}`}
                  accessibilityState={{ selected }}
                  onPress={() => {
                    player.subtitleTrack = track;
                    setSelectedKey(key);
                  }}
                  style={[styles.trackOption, selected ? styles.trackOptionSelected : null]}
                >
                  <Text style={[styles.trackText, selected ? styles.trackTextSelected : null]} allowFontScaling>
                    {track.label || track.name || track.language || `Track ${index + 1}`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function trackKey(track: SubtitleTrack | null, index: number): string | null {
  if (track === null) return null;
  return track.id ?? `${track.language}:${track.label}:${index}`;
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: '#000000',
  },
  audioFrame: {
    padding: spacing.sm,
  },
  player: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  subtitlePicker: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  subtitleHeading: {
    color: color.textSecondary,
    fontSize: type.label.fontSize,
    lineHeight: type.label.lineHeight,
    fontWeight: weight.label,
  },
  trackOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  trackOption: {
    minHeight: touchTarget,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  trackOptionSelected: {
    borderColor: color.accent,
    backgroundColor: color.surfaceRaised,
  },
  trackText: {
    color: color.textPrimary,
    fontSize: type.label.fontSize,
    lineHeight: type.label.lineHeight,
  },
  trackTextSelected: {
    color: color.accent,
  },
});
