/**
 * When leaving the screen has to be confirmed.
 *
 * The prompt is worth it exactly when there is something to lose, and a
 * nuisance otherwise: a driver who opened the form, saw the wrong screen and
 * hit back immediately should not have to answer a question about work they
 * never did. So "unsaved" is measured against the saved row, on trimmed text —
 * whitespace a driver never sees is not a change worth interrupting them over.
 */

import { hasUnsavedChanges } from "@/features/backlog-tickets/utils/hasUnsavedChanges";

const saved = { title: "Trip list scrolls", description: "It jumps to the top." };

describe("hasUnsavedChanges — a new ticket", () => {
  it("is clean while both fields are untouched", () => {
    expect(
      hasUnsavedChanges("create", { title: "", description: "" }, null),
    ).toBe(false);
  });

  it("is clean when the fields hold nothing but whitespace", () => {
    expect(
      hasUnsavedChanges("create", { title: "   ", description: "\n" }, null),
    ).toBe(false);
  });

  it("is dirty once either field has real text", () => {
    expect(
      hasUnsavedChanges("create", { title: "Something", description: "" }, null),
    ).toBe(true);
    expect(
      hasUnsavedChanges("create", { title: "", description: "Something" }, null),
    ).toBe(true);
  });
});

describe("hasUnsavedChanges — editing an existing ticket", () => {
  it("is clean while the draft still matches the saved ticket", () => {
    expect(hasUnsavedChanges("edit", { ...saved }, saved)).toBe(false);
  });

  it("ignores whitespace the driver cannot see", () => {
    expect(
      hasUnsavedChanges(
        "edit",
        { title: `  ${saved.title}  `, description: `${saved.description}\n` },
        saved,
      ),
    ).toBe(false);
  });

  it("is dirty when either field was actually changed", () => {
    expect(
      hasUnsavedChanges("edit", { ...saved, title: "Reworded" }, saved),
    ).toBe(true);
    expect(
      hasUnsavedChanges("edit", { ...saved, description: "More detail" }, saved),
    ).toBe(true);
  });

  /**
   * A ticket whose row has not arrived yet: anything typed is unsaved by
   * definition, and the driver must not lose it to a stray back-swipe.
   */
  it("treats text with no saved row behind it as unsaved", () => {
    expect(hasUnsavedChanges("edit", { ...saved }, null)).toBe(true);
  });
});

describe("hasUnsavedChanges — just reading a ticket", () => {
  it("never asks anything in view mode", () => {
    expect(hasUnsavedChanges("view", { title: "x", description: "y" }, saved)).toBe(
      false,
    );
  });
});
