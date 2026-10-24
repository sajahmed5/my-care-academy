import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored H5P runtime + content-type libraries (third-party, not ours).
    "public/h5p/**",
    // Claude's worktrees are whole checkouts of this repo, build output and
    // all. Without this, `npm run lint` walks every compiled .js in their
    // .next directories and reports ~16,000 problems in code nobody wrote —
    // which buries the handful that are real. The ignore above only matches
    // the .next at the root.
    ".claude/**",
  ]),
]);

export default eslintConfig;
