import { parseVersionFile } from "./parseVersionFile";

describe("parseVersionFile", () => {
  it("pulls the date out of frontmatter and returns the body below it", () => {
    const result = parseVersionFile(
      "---\ndate: 2026-09-02\n---\n\n### Heading\n\nBody.",
    );

    expect(result.date).toBe("2026-09-02");
    expect(result.body).toBe("### Heading\n\nBody.");
  });

  it("tolerates a file with no frontmatter", () => {
    const result = parseVersionFile("### Heading\n\nBody.");

    expect(result.date).toBeNull();
    expect(result.body).toBe("### Heading\n\nBody.");
  });

  it("ignores frontmatter keys other than date", () => {
    const result = parseVersionFile(
      "---\nauthor: someone\ndate: 2026-01-05\n---\n\nBody.",
    );

    expect(result.date).toBe("2026-01-05");
  });

  it("rejects a date that is not a real day", () => {
    expect(
      parseVersionFile("---\ndate: 2026-13-40\n---\n\nBody.").date,
    ).toBeNull();
  });

  it("rejects a malformed date without losing the body", () => {
    const result = parseVersionFile("---\ndate: Sept 2\n---\n\nBody.");

    expect(result.date).toBeNull();
    expect(result.body).toBe("Body.");
  });

  it("handles CRLF line endings", () => {
    expect(
      parseVersionFile("---\r\ndate: 2026-09-02\r\n---\r\n\r\nBody.").date,
    ).toBe("2026-09-02");
  });
});
