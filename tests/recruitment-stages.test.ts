import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  currentStage,
  nextMove,
  outstandingSteps,
  progress,
  readyToHire,
  stepsFor,
  type CandidateDocRecord,
} from "../lib/recruitment";

const ok = (doc_type: string): CandidateDocRecord => ({ doc_type, file_path: `x/${doc_type}`, expires_at: null, not_required: false, review_status: "confirmed" });
const facts = { dbsConviction: false };
const TODAY = "2026-10-29";

const stage1 = ["application", "literacy"].map(ok);
const stage2 = [ok("interview")];
const stage3 = ["starter_form", "proof_id", "proof_address_1", "proof_address_2", "proof_ni", "reference_1", "reference_2", "dbs", "training"].map(ok);
const stage4 = ["role_acceptance", "contract", "refund_training", "shadowing"].map(ok);

describe("stepsFor", () => {
  it("leaves out switched-off steps and the risk assessment without a conviction", () => {
    const keys = stepsFor({ ...DEFAULT_SETTINGS, stepsOff: ["shadowing"] }, facts).map((s) => s.key);
    expect(keys).not.toContain("shadowing");
    expect(keys).not.toContain("dbs_risk_assessment");
    expect(stepsFor(DEFAULT_SETTINGS, { dbsConviction: true }).map((s) => s.key)).toContain("dbs_risk_assessment");
  });
  it("makes the share code optional, and the third reference required only by setting", () => {
    const req = (settings = DEFAULT_SETTINGS) => Object.fromEntries(stepsFor(settings, facts).map((s) => [s.key, s.required]));
    expect(req().share_code).toBe(false);
    expect(req().reference_3).toBe(false);
    expect(req({ ...DEFAULT_SETTINGS, thirdReference: true }).reference_3).toBe(true);
  });
});

describe("progress", () => {
  it("locks later stages until the earlier ones are done, when stages go in order", () => {
    const stages = progress([ok("application")], DEFAULT_SETTINGS, facts, TODAY);
    expect(stages.map((s) => s.locked)).toEqual([false, true, true, true]);
    expect(currentStage(stages)).toBe(1);
    const free = progress([ok("application")], { ...DEFAULT_SETTINGS, stagesInOrder: false }, facts, TODAY);
    expect(free.every((s) => !s.locked)).toBe(true);
  });

  it("is ready to hire with every required step confirmed or not needed", () => {
    const docs = [...stage1, ...stage2, ...stage3, ...stage4];
    const stages = progress(docs, DEFAULT_SETTINGS, facts, TODAY);
    expect(readyToHire(stages)).toBe(true);
    expect(nextMove(stages).who).toBe("done");
  });

  it("holds the hire for the DBS by default, and not when a start before it is allowed", () => {
    const docs = [...stage1, ...stage2, ...stage3.filter((d) => d.doc_type !== "dbs"), ...stage4];
    expect(readyToHire(progress(docs, DEFAULT_SETTINGS, facts, TODAY))).toBe(false);
    expect(outstandingSteps(progress(docs, DEFAULT_SETTINGS, facts, TODAY), DEFAULT_SETTINGS).map((s) => s.key)).toEqual(["dbs"]);
    const later = { ...DEFAULT_SETTINGS, dbsBeforeStart: false };
    expect(readyToHire(progress(docs, later, facts, TODAY))).toBe(true);
  });

  it("treats an expired DBS as outstanding, even when it may follow", () => {
    const old: CandidateDocRecord = { ...ok("dbs"), expires_at: "2026-01-01" };
    const docs = [...stage1, ...stage2, ...stage3.filter((d) => d.doc_type !== "dbs"), old, ...stage4];
    expect(readyToHire(progress(docs, { ...DEFAULT_SETTINGS, dbsBeforeStart: false }, facts, TODAY))).toBe(false);
  });

  it("says who the next move is with", () => {
    const sent: CandidateDocRecord = { ...ok("application"), review_status: "submitted" };
    expect(nextMove(progress([sent], DEFAULT_SETTINGS, facts, TODAY))).toEqual({ who: "us", text: "Review application form" });
    const back: CandidateDocRecord = { ...ok("application"), review_status: "sent_back" };
    expect(nextMove(progress([back], DEFAULT_SETTINGS, facts, TODAY)).who).toBe("them");
  });
});
