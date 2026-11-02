import { describe, expect, it } from "vitest";
import { chunked, fetchAll } from "@/lib/fetch-all";

describe("chunked", () => {
  it("splits ids into groups of a hundred, keeping order and the remainder", () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    const groups = chunked(ids);
    expect(groups.map((g) => g.length)).toEqual([100, 100, 50]);
    expect(groups.flat()).toEqual(ids);
    expect(chunked([])).toEqual([]);
    expect(chunked(["a", "b", "c"], 2)).toEqual([["a", "b"], ["c"]]);
  });
});

describe("fetchAll", () => {
  it("keeps asking until a page comes back empty, so a 1,000-row cap never truncates", async () => {
    const total = 2345;
    const calls: [number, number][] = [];
    const rows = await fetchAll<number>(async (from, to) => {
      calls.push([from, to]);
      const page = Array.from({ length: Math.max(0, Math.min(1000, total - from)) }, (_, i) => from + i);
      return { data: page, error: null };
    });
    expect(rows.length).toBe(total);
    expect(rows[2344]).toBe(2344);
    expect(calls.length).toBe(4);
  });

  it("throws rather than acting on half the data", async () => {
    await expect(fetchAll(async () => ({ data: null, error: { message: "boom" } }))).rejects.toThrow(/boom/);
  });
});
