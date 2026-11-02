import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // `import "server-only"` is Next's build-time guard; under Vitest there
      // is no such package, so a test importing lib/due-badge (via a server
      // action's module) failed to load. An empty module is what Next's own
      // test setup substitutes.
      "server-only": fileURLToPath(new URL("./tests/empty-module.ts", import.meta.url)),
    },
  },
  test: {
    // RLS tests hit the live Supabase project sequentially and share state.
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
