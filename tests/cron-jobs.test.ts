import { describe, expect, it, vi } from "vitest";
import { runCronJobs } from "../lib/cron-jobs";

describe("runCronJobs", () => {
  it("merges every job's counts in order", async () => {
    const out = await runCronJobs([
      { name: "a", run: async () => ({ sent: 1 }) },
      { name: "b", run: async () => ({ chased: 2 }) },
    ]);
    expect(out).toEqual({ results: { sent: 1, chased: 2 }, errors: {} });
  });

  it("keeps going after a job throws, and names it", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const later = vi.fn(async () => ({ later: 3 }));
    const out = await runCronJobs([
      { name: "first", run: async () => ({ first: 1 }) },
      {
        name: "broken",
        run: async () => {
          throw new Error("database away");
        },
      },
      { name: "later", run: later },
    ]);
    expect(later).toHaveBeenCalledOnce();
    expect(out.results).toEqual({ first: 1, later: 3 });
    expect(out.errors).toEqual({ broken: "database away" });
    spy.mockRestore();
  });

  it("runs the jobs one after another, not at once", async () => {
    const order: string[] = [];
    await runCronJobs([
      {
        name: "slow",
        run: async () => {
          await new Promise((r) => setTimeout(r, 5));
          order.push("slow");
          return {};
        },
      },
      { name: "fast", run: async () => (order.push("fast"), {}) },
    ]);
    expect(order).toEqual(["slow", "fast"]);
  });
});
