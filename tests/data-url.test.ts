import { describe, expect, it } from "vitest";
import { fileFromDataUrl } from "@/lib/data-url";

describe("fileFromDataUrl", () => {
  it("keeps the file's type for storage (issue #84)", () => {
    const { buffer, contentType } = fileFromDataUrl(`data:application/pdf;base64,${Buffer.from("%PDF-1.7").toString("base64")}`);
    expect(contentType).toBe("application/pdf");
    expect(buffer.toString()).toBe("%PDF-1.7");
  });

  it("reads image types", () => {
    expect(fileFromDataUrl("data:image/jpeg;base64,AAAA").contentType).toBe("image/jpeg");
  });

  it("falls back to a binary type, never text/plain", () => {
    expect(fileFromDataUrl("data:;base64,AAAA").contentType).toBe("application/octet-stream");
    expect(fileFromDataUrl("nonsense").buffer.length).toBe(0);
  });
});
