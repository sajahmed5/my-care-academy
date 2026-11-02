import { describe, expect, it } from "vitest";
import { checkUpload, checkUploadBytes, extensionOf, looksLike, storedType } from "@/lib/upload-check";

const MB = 1024 * 1024;

describe("checkUpload", () => {
  it("takes a PDF and a photo for a document field", () => {
    expect(checkUpload({ name: "dbs.pdf", type: "application/pdf", size: 2 * MB }, { maxBytes: 10 * MB, kinds: ["pdf", "image"] })).toBeNull();
    expect(checkUpload({ name: "passport.JPG", type: "image/jpeg", size: 2 * MB }, { maxBytes: 10 * MB, kinds: ["pdf", "image"] })).toBeNull();
  });

  it("refuses a program renamed to .pdf, by its declared type", () => {
    const err = checkUpload({ name: "invoice.pdf", type: "application/x-msdownload", size: 1 * MB }, { maxBytes: 10 * MB, kinds: ["pdf", "image"] });
    expect(err).toMatch(/isn't a kind we can take/);
  });

  it("refuses HTML, SVG, scripts and archives whatever they claim to be", () => {
    for (const [name, type] of [["page.html", "text/html"], ["logo.svg", "image/svg+xml"], ["run.exe", "application/octet-stream"], ["x.zip", "application/zip"], ["a.pdf.js", "text/javascript"]]) {
      expect(checkUpload({ name, type, size: 1000 }, { maxBytes: 10 * MB, kinds: ["pdf", "image", "document"] }), name).not.toBeNull();
    }
  });

  it("judges a file with no declared type on its name alone", () => {
    expect(checkUpload({ name: "note.pdf", type: "", size: 1000 }, { maxBytes: MB, kinds: ["pdf"] })).toBeNull();
    expect(checkUpload({ name: "note", type: "", size: 1000 }, { maxBytes: MB, kinds: ["pdf"] })).not.toBeNull();
    expect(checkUpload({ name: "note.pdf", type: "application/octet-stream", size: 1000 }, { maxBytes: MB, kinds: ["pdf"] })).toBeNull();
  });

  it("refuses an empty or oversized file with a plain sentence", () => {
    expect(checkUpload({ name: "a.pdf", type: "application/pdf", size: 0 }, { maxBytes: MB, kinds: ["pdf"] })).toMatch(/empty/);
    expect(checkUpload({ name: "a.pdf", type: "application/pdf", size: 11 * MB }, { maxBytes: 10 * MB, kinds: ["pdf"], label: "The fit note" })).toBe("The fit note is too big: keep it under 10 MB.");
  });

  it("names the stored type from the file name when the browser gave none", () => {
    expect(storedType({ name: "a.docx", type: "", size: 1 })).toMatch(/wordprocessingml/);
    expect(storedType({ name: "a.pdf", type: "application/pdf", size: 1 })).toBe("application/pdf");
    expect(extensionOf("weird.name.PNG")).toBe("png");
  });
});

describe("checkUploadBytes", () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  it("takes a real PDF and a real PNG", () => {
    expect(checkUploadBytes({ name: "a.pdf", type: "application/pdf", size: 8 }, pdf, { maxBytes: MB, kinds: ["pdf"] })).toBeNull();
    expect(checkUploadBytes({ name: "a.png", type: "image/png", size: 8 }, png, { maxBytes: MB, kinds: ["image"] })).toBeNull();
  });

  it("refuses a program renamed .pdf even when the browser calls it a PDF", () => {
    expect(checkUploadBytes({ name: "invoice.pdf", type: "application/pdf", size: 8 }, exe, { maxBytes: MB, kinds: ["pdf"] })).toMatch(/isn't really a \.pdf/);
  });

  it("has no opinion on kinds without a signature", () => {
    expect(looksLike(new Uint8Array([0x41, 0x42]), "notes.txt")).toBeNull();
    expect(looksLike(exe, "a.jpg")).toBe(false);
  });
});
