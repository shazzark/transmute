import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

import { color, radius, spacing } from '../tokens';

export interface ResultPlayerProps {
  readonly uri: string;
  readonly label: string;
  readonly mimeType: string | null;
}

/** Uses Android's native media player for both audio-only and video results. */
export function ResultPlayer({ uri, label, mimeType }: ResultPlayerProps): React.JSX.Element {
  const player = useVideoPlayer(uri);
  const audioOnly = mimeType?.startsWith('audio/') ?? false;

  return (
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
  );
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
});
