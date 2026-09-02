import { parseInline, parseMarkdown } from "./parseMarkdown";

describe("parseInline", () => {
  it("splits bold out of surrounding text", () => {
    expect(parseInline("Open the **menu** now")).toEqual([
      { text: "Open the " },
      { text: "menu", bold: true },
      { text: " now" },
    ]);
  });

  it("prefers bold over italic for a double star", () => {
    expect(parseInline("**both**")).toEqual([{ text: "both", bold: true }]);
  });

  it("reads italic and inline code", () => {
    expect(parseInline("*soft* and `code`")).toEqual([
      { text: "soft", italic: true },
      { text: " and " },
      { text: "code", code: true },
    ]);
  });

  it("keeps a link label and drops its target", () => {
    expect(parseInline("see [the docs](https://example.com) here")).toEqual([
      { text: "see " },
      { text: "the docs" },
      { text: " here" },
    ]);
  });

  it("returns plain text unchanged", () => {
    expect(parseInline("nothing special")).toEqual([
      { text: "nothing special" },
    ]);
  });
});

describe("parseMarkdown", () => {
  it("reads headings at each supported level", () => {
    const blocks = parseMarkdown("# One\n\n## Two\n\n### Three");

    expect(blocks.map((b) => b.kind === "heading" && b.level)).toEqual([
      1, 2, 3,
    ]);
  });

  it("joins a wrapped paragraph back into one block", () => {
    const blocks = parseMarkdown("A line\nthat wrapped.\n\nA second one.");

    expect(blocks).toEqual([
      { kind: "paragraph", spans: [{ text: "A line that wrapped." }] },
      { kind: "paragraph", spans: [{ text: "A second one." }] },
    ]);
  });

  it("reads bullets with either marker", () => {
    const blocks = parseMarkdown("- first\n* second");

    expect(blocks).toEqual([
      { kind: "bullet", spans: [{ text: "first" }] },
      { kind: "bullet", spans: [{ text: "second" }] },
    ]);
  });

  it("reads a horizontal rule", () => {
    expect(parseMarkdown("---")).toEqual([{ kind: "rule" }]);
  });

  it("keeps unrecognised syntax as text rather than dropping it", () => {
    expect(parseMarkdown("> a quote")).toEqual([
      { kind: "paragraph", spans: [{ text: "> a quote" }] },
    ]);
  });

  it("returns nothing for an empty body", () => {
    expect(parseMarkdown("   \n\n  ")).toEqual([]);
  });
});
