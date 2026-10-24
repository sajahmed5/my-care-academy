// Preloaded into `next dev` by scripts/perf/measure.mjs (NODE_OPTIONS=--require).
// Wraps fetch before Next patches it and appends one JSON line per call to
// Supabase: method, path, query, status and the body's size in bytes
// (uncompressed). Does nothing unless PERF_METER_OUT is set.
// A --require preload runs before any module loader, so it has to be CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("fs");

const OUT = process.env.PERF_METER_OUT;
const original = globalThis.fetch;

globalThis.fetch = async function meteredFetch(input, init) {
  const url = typeof input === "string" ? input : input?.url ?? String(input);
  const res = await original(input, init);
  if (OUT && url.includes(".supabase.co")) {
    const at = Date.now();
    res
      .clone()
      .arrayBuffer()
      .then((body) => {
        const u = new URL(url);
        fs.appendFileSync(
          OUT,
          JSON.stringify({
            at,
            method: (init && init.method) || (input && input.method) || "GET",
            path: u.pathname,
            query: decodeURIComponent(u.search).slice(0, 300),
            status: res.status,
            bytes: body.byteLength,
          }) + "\n",
        );
      })
      .catch(() => {});
  }
  return res;
};
