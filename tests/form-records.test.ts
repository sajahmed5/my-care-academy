import { describe, expect, it } from "vitest";
import { cleanSignatures, signerLabel } from "@/lib/form-records";
import { responseRows } from "@/lib/form-library";
import type { FormField } from "@/lib/forms";

const now = new Date("2026-10-30T10:00:00Z");
const png = "data:image/png;base64,iVBORw0KGgo=";

describe("cleanSignatures", () => {
  it("keeps a client's signature, timed by the server", () => {
    const [s] = cleanSignatures([{ role: "client", name: " Jane Smith ", image: png, signed_at: "1999-01-01" }], now);
    expect(s).toEqual({ role: "client", name: "Jane Smith", relationship: null, image: png, signed_at: now.toISOString() });
  });

  it("keeps a family member's relationship, never a client's", () => {
    const [f] = cleanSignatures([{ role: "family", name: "Pat", relationship: "Daughter" }], now);
    expect(f.relationship).toBe("Daughter");
    const [c] = cleanSignatures([{ role: "client", name: "Jane", relationship: "Self" }], now);
    expect(c.relationship).toBeNull();
  });

  it("drops an unknown role, a missing name, and anything that is not a list", () => {
    expect(cleanSignatures([{ role: "boss", name: "X" }, { role: "client", name: "  " }], now)).toEqual([]);
    expect(cleanSignatures("nope", now)).toEqual([]);
  });

  it("drops an image that is not a PNG data URL, keeping the name", () => {
    const [s] = cleanSignatures([{ role: "client", name: "Jane", image: "javascript:alert(1)" }], now);
    expect(s.image).toBeNull();
  });

  it("labels who signed", () => {
    expect(signerLabel({ role: "client", relationship: null })).toBe("Client");
    expect(signerLabel({ role: "family", relationship: "Son" })).toBe("Family member (Son)");
  });
});

describe("responseRows dates", () => {
  it("reads a date answer as a date", () => {
    const fields: FormField[] = [
      { id: "d", label: "Date", type: "date", options: [], required: false, conditional: null, sort_order: 0 },
    ];
    expect(responseRows(fields, { d: "2026-10-30" })[0].value).toBe("30 October 2026");
  });
});

describe("responseRows headings", () => {
  const fields: FormField[] = [
    { id: "h", label: "Mobility", type: "heading", options: [], required: false, conditional: null, sort_order: 0 },
    { id: "q", label: "Aid", type: "text", options: [], required: false, conditional: null, sort_order: 1 },
  ];
  it("leaves headings out unless asked, then marks them", () => {
    expect(responseRows(fields, { q: "Frame" }).map((r) => r.label)).toEqual(["Aid"]);
    expect(responseRows(fields, { q: "Frame" }, { withHeadings: true })).toEqual([
      { fieldId: "h", label: "Mobility", value: "", heading: true },
      { fieldId: "q", label: "Aid", value: "Frame", filePath: undefined },
    ]);
  });
});
