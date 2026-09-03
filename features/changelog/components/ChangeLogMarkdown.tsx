import { ThemeColors, typeScale } from "@/constants/theme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import React, { useMemo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import {
  parseMarkdown,
  type InlineSpan,
  type MarkdownBlock,
} from "../util/parseMarkdown";

const HEADING_STYLE_KEY = {
  1: "heading1",
  2: "heading2",
  3: "heading3",
} as const;

/** Renders one release body. See `util/parseMarkdown` for the supported syntax. */
export default function ChangeLogMarkdown({ body }: { body: string }) {
  const styles = useThemedStyles(makeStyles);
  const blocks = useMemo(() => parseMarkdown(body), [body]);

  return (
    <View style={styles.container}>
      {blocks.map((block, index) => (
        <Block key={index} block={block} styles={styles} />
      ))}
    </View>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function Block({ block, styles }: { block: MarkdownBlock; styles: Styles }) {
  if (block.kind === "rule") return <View style={styles.rule} />;

  if (block.kind === "heading") {
    return (
      <Text style={styles[HEADING_STYLE_KEY[block.level]]}>
        <Spans spans={block.spans} styles={styles} />
      </Text>
    );
  }

  if (block.kind === "bullet") {
    return (
      <View style={styles.bulletRow}>
        <Text style={styles.bulletDot}>•</Text>
        <Text style={[styles.paragraph, styles.bulletText]}>
          <Spans spans={block.spans} styles={styles} />
        </Text>
      </View>
    );
  }

  return (
    <Text style={styles.paragraph}>
      <Spans spans={block.spans} styles={styles} />
    </Text>
  );
}

function Spans({ spans, styles }: { spans: InlineSpan[]; styles: Styles }) {
  return (
    <>
      {spans.map((span, index) => (
        <Text
          key={index}
          style={[
            span.bold && styles.bold,
            span.italic && styles.italic,
            span.code && styles.code,
          ]}
        >
          {span.text}
        </Text>
      ))}
    </>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: { gap: 12 },
    heading1: {
      ...typeScale.title2,
      fontWeight: "700",
      color: theme.textPrimary,
    },
    heading2: {
      ...typeScale.title3,
      fontWeight: "700",
      color: theme.textPrimary,
    },
    // Release notes lead with `###`, so this is the common case.
    heading3: {
      ...typeScale.headline,
      fontWeight: "600",
      color: theme.textPrimary,
    },
    paragraph: { ...typeScale.subhead, color: theme.textSecondary },
    bulletRow: { flexDirection: "row", gap: 8, paddingLeft: 4 },
    bulletDot: { ...typeScale.subhead, color: theme.textTertiary },
    // Without this the label cannot wrap — it would run off the row.
    bulletText: { flex: 1 },
    bold: { fontWeight: "600", color: theme.textPrimary },
    italic: { fontStyle: "italic" },
    code: {
      fontFamily: Platform.select({
        ios: "Menlo",
        android: "monospace",
        default: "monospace",
      }),
      color: theme.textPrimary,
    },
    rule: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.separator,
      marginVertical: 4,
    },
  });
