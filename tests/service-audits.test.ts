import { describe, expect, it } from "vitest";
import {
  DEFAULT_SERVICE_FORMS,
  clientDueRows,
  clientsFor,
  itemFindings,
  itemsScore,
  legacyItems,
  needsReview,
  ownAuditKey,
  readItems,
  readServiceQuestions,
  resolveServiceForms,
  type ServiceFormOverride,
  type ServiceQuestion,
} from "../lib/service-audits";

const Q: ServiceQuestion[] = [
  { id: "a", label: "A", type: "yes_no" },
  { id: "b", label: "B", type: "rating" },
  { id: "c", label: "C", type: "text" },
  { id: "d", label: "D", type: "photo" },
];

describe("service audit forms", () => {
  it("starts from ours, with unique question ids", () => {
    const forms = resolveServiceForms([]);
    expect(forms.map((f) => f.key)).toEqual(["medication", "care_plan", "infection_control"]);
    for (const f of DEFAULT_SERVICE_FORMS) expect(new Set(f.questions.map((q) => q.id)).size).toBe(f.questions.length);
    expect(forms.find((f) => f.key === "medication")?.scope).toBe("client");
    expect(forms.find((f) => f.key === "infection_control")?.scope).toBe("service");
  });

  it("lays a company's changes over ours, drops what it stopped, and adds its own", () => {
    const o = (p: Partial<ServiceFormOverride>): ServiceFormOverride => ({
      key: "x",
      label: null,
      scope: "service",
      questions: [],
      due_every: 3,
      due_unit: "months",
      archived: false,
      ...p,
    });
    const forms = resolveServiceForms([
      o({ key: "medication", questions: [Q[0]], due_every: 2 }),
      o({ key: "care_plan", archived: true }),
      o({ key: "own_falls", label: "Falls", scope: "client", questions: [Q[0]] }),
      o({ key: "own_empty", label: "Empty", questions: [] }),
    ]);
    expect(forms.map((f) => f.key)).toEqual(["medication", "infection_control", "own_falls"]);
    const med = forms[0];
    expect(med.questions).toEqual([Q[0]]);
    expect(med.due).toEqual({ every: 2, unit: "months" });
    expect(med.medicationOnly).toBe(true);
    expect(forms[2]).toMatchObject({ scope: "client", ours: false, label: "Falls" });
  });
});

describe("answers", () => {
  it("needs every Yes / No and rating answered, and drops what isn't on the form", () => {
    expect(readItems(Q, [{ id: "a", answer: "yes" }])).toEqual({ ok: false, error: 'Rate "B" from 1 to 5.' });
    expect(readItems(Q, [{ id: "b", answer: 3 }])).toEqual({ ok: false, error: 'Answer "A".' });
    const r = readItems(Q, [
      { id: "a", answer: "no", comment: " broken " },
      { id: "b", answer: "4" },
      { id: "c", answer: " fine " },
      { id: "d", answer: "x", photo: "someone-elses/path.jpg" },
      { id: "zz", answer: "yes" },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items.map((i) => i.answer)).toEqual(["no", 4, "fine", null]);
    expect(r.items[0].comment).toBe("broken");
    // A photo path is the server's to set, never the browser's.
    expect(r.items[3].photo).toBeNull();
  });

  it("scores Yes / No and ratings, leaving out N/A, text and photos", () => {
    expect(itemsScore([{ type: "yes_no", answer: "yes" }, { type: "yes_no", answer: "no" }, { type: "yes_no", answer: "na" }])).toBe(50);
    expect(itemsScore([{ type: "yes_no", answer: "yes" }, { type: "rating", answer: 3 }])).toBe(80);
    expect(itemsScore([{ type: "text", answer: "x" }, { type: "yes_no", answer: "na" }])).toBeNull();
  });

  it("finds each No and each rating of 2 or under", () => {
    const items = [
      { id: "1", label: "", type: "yes_no" as const, answer: "no" as const },
      { id: "2", label: "", type: "rating" as const, answer: 2 },
      { id: "3", label: "", type: "rating" as const, answer: 3 },
      { id: "4", label: "", type: "yes_no" as const, answer: "na" as const },
    ];
    expect(itemFindings(items).map((i) => i.id)).toEqual(["1", "2"]);
  });

  it("waits for review below the company's level, never with no score", () => {
    expect(needsReview(79, 80)).toBe(true);
    expect(needsReview(80, 80)).toBe(false);
    expect(needsReview(null, 80)).toBe(false);
  });

  it("reads the audit from before forms were editable", () => {
    const items = legacyItems("medication", { mar_complete: "yes", fridge: "no" });
    expect(items[0]).toMatchObject({ id: "mar_complete", answer: "yes", type: "yes_no" });
    expect(items.find((i) => i.id === "fridge")?.answer).toBe("no");
    expect(items.find((i) => i.id === "stock")?.answer).toBeNull();
  });
});

describe("editing", () => {
  it("checks questions, and keeps at least one that scores", () => {
    expect(readServiceQuestions([{ id: "q_1", label: "Notes", type: "text" }])).toMatchObject({ ok: false });
    expect(readServiceQuestions([{ id: "Bad id", label: "X", type: "yes_no" }])).toMatchObject({ ok: false });
    expect(readServiceQuestions([{ id: "q_1", label: "X", type: "sliders" }])).toMatchObject({ ok: false });
    const r = readServiceQuestions([
      { id: "q_1", label: " Checked? ", type: "yes_no", help: "" },
      { id: "q_2", label: "", type: "text" },
      { id: "q_3", label: "Photo of the kit", type: "photo", help: "Close up" },
    ]);
    expect(r).toEqual({
      ok: true,
      questions: [
        { id: "q_1", label: "Checked?", type: "yes_no" },
        { id: "q_3", label: "Photo of the kit", type: "photo", help: "Close up" },
      ],
    });
  });

  it("makes a key for a company's own audit that doesn't clash", () => {
    expect(ownAuditKey("Falls prevention!", [])).toBe("own_falls_prevention");
    expect(ownAuditKey("Falls prevention", ["own_falls_prevention"])).toBe("own_falls_prevention_2");
  });
});

describe("client by client", () => {
  const clients = [
    { id: "c1", name: "Ann", region: null, medicationSupport: true },
    { id: "c2", name: "Bob", region: null, medicationSupport: false },
  ];
  it("asks for medication audits only where the company helps with medicines", () => {
    expect(clientsFor({ medicationOnly: true }, clients).map((c) => c.id)).toEqual(["c1"]);
    expect(clientsFor({}, clients)).toHaveLength(2);
  });
  it("takes each client's latest record", () => {
    const now = new Date("2026-10-30T12:00:00Z");
    const rows = clientDueRows(
      clients,
      [
        { id: "old", clientId: "c1", heldOn: "2026-06-01", nextDue: "2026-07-01" },
        { id: "new", clientId: "c1", heldOn: "2026-10-20", nextDue: "2026-11-20" },
      ],
      now,
    );
    expect(rows[0]).toMatchObject({ lastId: "new", status: "due_soon", next: "2026-11-20" });
    expect(rows[1]).toMatchObject({ status: "never", last: null });
  });
});
