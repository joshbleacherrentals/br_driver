/**
 * The tiny slice of markdown release notes are written in.
 *
 * The web changelog leans on react-markdown; pulling a markdown library plus a
 * renderer into the app bundle to display a handful of headings and bullets is
 * not worth the weight, so this parses the shapes `versions/*.md` actually use
 * and nothing else. Anything unrecognised falls through as a paragraph rather
 * than disappearing.
 *
 * Raw HTML is not supported, by design — there is no HTML renderer downstream,
 * so anything HTML-shaped shows up as literal text.
 */

export type InlineSpan = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
};

export type MarkdownBlock =
  | { kind: "heading"; level: 1 | 2 | 3; spans: InlineSpan[] }
  | { kind: "paragraph"; spans: InlineSpan[] }
  | { kind: "bullet"; spans: InlineSpan[] }
  | { kind: "rule" };

const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^[-*]\s+(.+)$/;
const RULE = /^(-{3,}|\*{3,}|_{3,})$/;

export function parseMarkdown(body: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: "paragraph", spans: parseInline(paragraph.join(" ")) });
    paragraph = [];
  };

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line === "") {
      flushParagraph();
      continue;
    }

    if (RULE.test(line)) {
      flushParagraph();
      blocks.push({ kind: "rule" });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({
        kind: "heading",
        level: heading[1].length as 1 | 2 | 3,
        spans: parseInline(heading[2]),
      });
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      flushParagraph();
      blocks.push({ kind: "bullet", spans: parseInline(bullet[1]) });
      continue;
    }

    // Release notes wrap prose across lines; a paragraph is joined back into one.
    paragraph.push(line);
  }

  flushParagraph();
  return blocks;
}

// Ordered so `**` is consumed before `*`, and code before either — backticks
// are literal inside a code span.
const INLINE = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\([^)]*\)/g;

/** Split one line into styled runs. Links keep their label and drop the URL. */
export function parseInline(line: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  let cursor = 0;

  for (const match of line.matchAll(INLINE)) {
    const [full, code, bold, italic, linkLabel] = match;

    if (match.index > cursor) {
      spans.push({ text: line.slice(cursor, match.index) });
    }

    if (code !== undefined) spans.push({ text: code, code: true });
    else if (bold !== undefined) spans.push({ text: bold, bold: true });
    else if (italic !== undefined) spans.push({ text: italic, italic: true });
    // A link's target is dropped rather than rendered: the notes are read
    // offline, so a tappable URL would usually go nowhere.
    else spans.push({ text: linkLabel });

    cursor = match.index + full.length;
  }

  if (cursor < line.length) spans.push({ text: line.slice(cursor) });

  return spans.length > 0 ? spans : [{ text: line }];
}
