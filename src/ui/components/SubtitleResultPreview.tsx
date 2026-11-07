import React, { useEffect, useState } from 'react';
import { File } from 'expo-file-system';
import { StyleSheet, Text, View } from 'react-native';

import { color, radius, spacing, type } from '../tokens';

const PREVIEW_LINE_LIMIT = 100;

/** Reads durable subtitle text for an in-app preview after a restart. */
export function SubtitleResultPreview({ uri }: { readonly uri: string }): React.JSX.Element {
  const [content, setContent] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void new File(uri).text().then((text) => {
      if (active) setContent(text.replace(/^\uFEFF/, ''));
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => { active = false; };
  }, [uri]);

  const preview = content === null ? null : content.split(/\r?\n/).slice(0, PREVIEW_LINE_LIMIT).join('\n');
  const truncated = content !== null && content.split(/\r?\n/).length > PREVIEW_LINE_LIMIT;

  return (
    <View style={styles.container}>
      <Text style={styles.heading} allowFontScaling accessibilityRole="header">Subtitle preview</Text>
      {content === null && !failed ? <Text style={styles.message} allowFontScaling>Loading saved subtitle…</Text> : null}
      {failed ? <Text style={styles.message} allowFontScaling>The saved subtitle could not be read.</Text> : null}
      {preview !== null ? (
        <>
          <Text style={styles.content} allowFontScaling selectable>{preview || '(This subtitle file is empty.)'}</Text>
          {truncated ? <Text style={styles.message} allowFontScaling>Preview shows the first {PREVIEW_LINE_LIMIT} lines. Share or save the file to view the rest.</Text> : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  heading: { color: color.textPrimary, fontSize: type.body.fontSize, lineHeight: type.body.lineHeight },
  message: { color: color.textSecondary, fontSize: type.caption.fontSize, lineHeight: type.caption.lineHeight },
  content: {
    color: color.textPrimary,
    backgroundColor: color.surface,
    borderColor: color.border,
    borderWidth: 1,
    borderRadius: radius.control,
    padding: spacing.md,
    fontSize: type.caption.fontSize,
    lineHeight: type.body.lineHeight,
  },
});
