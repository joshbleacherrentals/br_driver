/**
 * Specification-first tests — see `./support.ts` for why this suite is red and
 * why it must not be edited to match a future implementation.
 *
 * Covers: design doc §3 ("PhotoAttachmentQueue.ts currently hardcodes
 * media_type: 'image/jpeg' for every file — meaning PDFs get uploaded to
 * Supabase Storage with the wrong Content-Type ... derive the type from the
 * file extension") and §10 ("Correct Content-Type for PDF").
 */

import {
  DEFAULT_CONTENT_TYPE,
  resolveContentType,
} from "@/library/photoUploadQueue/contentType";

describe("Content-Type resolution (§3, §10)", () => {
  it.each([
    ["photo.jpg", "image/jpeg"],
    ["photo.jpeg", "image/jpeg"],
    ["license.pdf", "application/pdf"],
  ])("maps %s to %s", (fileName, expected) => {
    expect(resolveContentType(fileName)).toBe(expected);
  });

  it("resolves bucket paths and local file URIs, not just bare names", () => {
    expect(resolveContentType("damage-report-uuid/photo-1.jpg")).toBe(
      "image/jpeg",
    );
    expect(resolveContentType("file:///var/mobile/tmp/capture.jpeg")).toBe(
      "image/jpeg",
    );
    expect(resolveContentType("driver-uuid/insurance.pdf")).toBe(
      "application/pdf",
    );
  });

  it("ignores extension casing", () => {
    expect(resolveContentType("photo.JPG")).toBe("image/jpeg");
    expect(resolveContentType("scan.PDF")).toBe("application/pdf");
  });

  it("falls back to a neutral type when the extension is unknown or absent", () => {
    for (const name of [
      "scan",
      "driver-uuid/medical-card",
      "note.xyz",
      "backup.v2/license",
    ]) {
      expect(resolveContentType(name)).toBe(DEFAULT_CONTENT_TYPE);
    }
  });

  // The bug being replaced: everything, PDFs included, went up as image/jpeg.
  it("never falls back to the image/jpeg hardcode it replaces", () => {
    expect(DEFAULT_CONTENT_TYPE).not.toBe("image/jpeg");
    expect(resolveContentType("license.pdf")).not.toBe("image/jpeg");
    expect(resolveContentType("scan")).not.toBe("image/jpeg");
  });

  it("always returns a well-formed MIME type", () => {
    for (const name of ["photo.jpg", "license.pdf", "scan", "note.xyz"]) {
      expect(resolveContentType(name)).toMatch(/^[a-z]+\/[a-z0-9.+-]+$/);
    }
  });
});
