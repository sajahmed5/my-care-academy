import { describe, expect, it } from "vitest";
import { carerSignature, kindLabel, nextDueOf, type Supervision } from "../lib/supervisions";

function supervision(over: Partial<Supervision> = {}): Supervision {
  return {
    id: "s1",
    kind: "supervision",
    held_on: "2026-10-01",
    summary: null,
    next_due: null,
    supervisor_name: "A Manager",
    carer_signature: null,
    carer_signed_name: null,
    carer_signed_at: null,
    carer_unsigned_reason: null,
    ...over,
  };
}

describe("nextDueOf", () => {
  it("takes the latest record's date, because it supersedes", () => {
    // The loader returns newest first.
    const list = [
      supervision({ id: "new", held_on: "2026-10-01", next_due: "2027-04-01" }),
      supervision({ id: "old", held_on: "2026-04-01", next_due: "2026-10-01" }),
    ];
    expect(nextDueOf(list)).toBe("2027-04-01");
  });

  it("is null when there are none", () => {
    expect(nextDueOf([])).toBeNull();
  });
});

describe("kindLabel", () => {
  it("reads as a manager would say it", () => {
    expect(kindLabel("return_to_work")).toBe("Return to work");
    expect(kindLabel("appraisal")).toBe("Appraisal");
  });

  it("falls back to the raw value for anything unknown", () => {
    expect(kindLabel("something_else")).toBe("something_else");
  });
});

describe("the carer's signature on a new supervision", () => {
  const now = new Date("2026-10-25T10:00:00Z");
  const ink = "data:image/png;base64,iVBORw0KGgo=";

  it("keeps the drawn signature, the typed name and when they signed", () => {
    const r = carerSignature({ signature: ink, name: " Sam Ilyas ", unsignedReason: "", now });
    expect(r).toEqual({
      ok: true,
      fields: { carer_signature: ink, carer_signed_name: "Sam Ilyas", carer_signed_at: now.toISOString(), carer_unsigned_reason: null },
    });
  });
  it("accepts a reason in place of a signature, and keeps no signature with it", () => {
    const r = carerSignature({ signature: ink, name: "Sam", unsignedReason: "Held by phone", now });
    expect(r).toEqual({
      ok: true,
      fields: { carer_signature: null, carer_signed_name: null, carer_signed_at: null, carer_unsigned_reason: "Held by phone" },
    });
  });
  it("refuses neither, a signature without a name, and anything that is not a PNG", () => {
    expect(carerSignature({ signature: "", name: "", unsignedReason: "", now }).ok).toBe(false);
    expect(carerSignature({ signature: ink, name: " ", unsignedReason: "", now }).ok).toBe(false);
    expect(carerSignature({ signature: "data:text/html,<b>", name: "Sam", unsignedReason: "", now }).ok).toBe(false);
  });
});
