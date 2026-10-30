import { describe, it, expect } from "vitest";
import {
  anonymiseUserRecords,
  groupByBucket,
  purgeUserFiles,
  REDACTED_EMAIL,
} from "../lib/user-erasure";

describe("groupByBucket", () => {
  it("merges tables that share a bucket into one remove call", () => {
    // observation evidence and sign-off PDFs both live in observation-evidence;
    // two separate remove() calls would be two round trips for no reason.
    const out = groupByBucket([
      { bucket: "certificates", path: "a/1.pdf" },
      { bucket: "observation-evidence", path: "b/2.pdf" },
      { bucket: "observation-evidence", path: "b/3.pdf" },
    ]);
    expect(out).toHaveLength(2);
    expect(out.find((b) => b.bucket === "observation-evidence")!.paths).toEqual([
      "b/2.pdf",
      "b/3.pdf",
    ]);
  });

  it("drops empty paths and de-duplicates", () => {
    const out = groupByBucket([
      { bucket: "certificates", path: "a/1.pdf" },
      { bucket: "certificates", path: "a/1.pdf" },
      { bucket: "certificates", path: "" },
    ]);
    expect(out).toEqual([{ bucket: "certificates", paths: ["a/1.pdf"] }]);
  });

  it("finds nothing when the user has no files", () => {
    expect(groupByBucket([])).toEqual([]);
  });
});

/** Minimal stub of the bits of the client purgeUserFiles touches. */
function fakeAdmin(
  rows: Record<string, Record<string, string>[]>,
  removeError?: string,
) {
  const removed: { bucket: string; paths: string[] }[] = [];
  return {
    client: {
      from: (table: string) => ({
        select: () => ({
          eq: async () => ({ data: rows[table] ?? [] }),
        }),
      }),
      storage: {
        from: (bucket: string) => ({
          remove: async (paths: string[]) => {
            removed.push({ bucket, paths });
            return removeError ? { error: { message: removeError } } : { error: null };
          },
        }),
      },
    },
    removed,
  };
}

describe("purgeUserFiles", () => {
  it("collects paths across every table that cascades on the user", async () => {
    const { client, removed } = fakeAdmin({
      certificates: [{ pdf_path: "cert/1.pdf" }, { pdf_path: "cert/2.pdf" }],
      care_cert_observations: [{ evidence_path: "obs/1.jpg" }],
      care_cert_signoffs: [{ pdf_path: "obs/signoff.pdf" }],
      staff_documents: [{ file_path: "org/u1/dbs.pdf" }],
      hr_letters: [{ pdf_path: "org/u1/letters/l1.pdf" }],
      sickness_absences: [{ fit_note_path: "org/u1/fit-notes/f1.jpg" }],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await purgeUserFiles(client as any, "u1");
    expect(res.removed).toBe(7);
    expect(res.failures).toEqual([]);
    expect(removed.map((r) => r.bucket).sort()).toEqual([
      "certificates",
      "hr-docs",
      "observation-evidence",
      "staff-docs",
    ]);
  });

  it("reports a storage failure instead of throwing, so deletion is never blocked", async () => {
    const { client } = fakeAdmin(
      { certificates: [{ pdf_path: "cert/1.pdf" }] },
      "bucket unavailable",
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await purgeUserFiles(client as any, "u1");
    expect(res.removed).toBe(0);
    expect(res.failures).toEqual([
      { bucket: "certificates", error: "bucket unavailable" },
    ]);
    // Still reported, so the audit log records what to clean up by hand.
    expect(res.found).toEqual([
      { bucket: "certificates", paths: ["cert/1.pdf"] },
    ]);
  });

  it("is a no-op for a user with no stored files", async () => {
    const { client, removed } = fakeAdmin({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await purgeUserFiles(client as any, "u1");
    expect(res).toEqual({ found: [], removed: 0, failures: [] });
    expect(removed).toEqual([]);
  });
});

/** Stub supporting the update().eq().select() chain anonymiseUserRecords uses. */
function fakeUpdatable(tables: Record<string, Record<string, unknown>[]>) {
  const calls: { table: string; patch: Record<string, unknown>; on: [string, unknown] }[] = [];
  const client = {
    from: (table: string) => ({
      update: (patch: Record<string, unknown>) => ({
        eq: (col: string, val: unknown) => ({
          select: async () => {
            const rows = (tables[table] ?? []).filter((r) => r[col] === val);
            calls.push({ table, patch, on: [col, val] });
            for (const r of rows) Object.assign(r, patch);
            return { data: rows.map(() => ({ id: "x" })) };
          },
        }),
      }),
    }),
  };
  return { client, calls };
}

describe("anonymiseUserRecords", () => {
  it("redacts the address in email_log and clears it on their reports", async () => {
    const tables = {
      email_log: [
        { to_email: "sam@care.co.uk" },
        { to_email: "sam@care.co.uk" },
        { to_email: "other@care.co.uk" },
      ],
      issue_reports: [
        { user_id: "u1", reporter_email: "sam@care.co.uk" },
        { user_id: "u2", reporter_email: "other@care.co.uk" },
      ],
    };
    const { client } = fakeUpdatable(tables);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await anonymiseUserRecords(client as any, "u1", "sam@care.co.uk");

    expect(res.emailLog).toBe(2);
    // The rows survive — only the identifier goes.
    expect(tables.email_log).toHaveLength(3);
    expect(tables.email_log[0].to_email).toBe(REDACTED_EMAIL);
    expect(tables.email_log[2].to_email).toBe("other@care.co.uk");
    expect(tables.issue_reports[0].reporter_email).toBeNull();
    expect(tables.issue_reports[1].reporter_email).toBe("other@care.co.uk");
  });

  it("still clears reports when the account has no address on file", async () => {
    const tables = { issue_reports: [{ user_id: "u1", reporter_email: "x@y.z" }] };
    const { client, calls } = fakeUpdatable(tables);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await anonymiseUserRecords(client as any, "u1", null);
    expect(res.emailLog).toBe(0);
    expect(res.issueReports).toBe(1);
    // No address means nothing to match email_log on, so it isn't touched.
    expect(calls.some((c) => c.table === "email_log")).toBe(false);
  });
});
