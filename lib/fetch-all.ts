/**
 * Shared by the scheduled jobs and the portal API — everything that reads
 * across more rows than one request can return.
 */

/**
 * Read every row a query matches, a page at a time.
 *
 * Supabase returns at most 1,000 rows per request (`max_rows`) and silently
 * drops the rest — no error. These jobs run across every organisation at once,
 * so they were the first thing to cross that line: past row 1,000, reminders
 * and certificate expiries would simply not happen, with nothing in the logs.
 *
 * Advances by the rows actually received rather than a fixed page size, so it
 * stays correct if the server's cap is ever lowered; the caller must order by
 * a unique column so pages don't overlap. A failed read throws: a job acting
 * on half the data is exactly the silent failure this exists to prevent.
 */
/**
 * Ids in groups small enough for one `.in()` filter. The ids travel in the
 * request URL, which fails past roughly 390 uuids; 100 a time is what the
 * scheduled jobs use.
 */
export function chunked<T>(items: readonly T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; ) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(`Paged read failed: ${error.message}`);
    const got = data ?? [];
    if (got.length === 0) return rows;
    rows.push(...got);
    from += got.length;
  }
}
