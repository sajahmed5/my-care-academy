#!/usr/bin/env node
/**
 * Refuse to deploy a dirty working tree.
 *
 * `npm run deploy` is `vercel --prod`, which uploads the working DIRECTORY,
 * not the commit. That is easy to forget, and on 24 Oct 2026 it took the
 * Learners page down: a deploy ran while another session had an unfinished
 * database change in the tree, so half-written code went to production and
 * every request to /org/learners 500'd against a function that no longer
 * matched it. More than one Claude session works in this checkout at a time,
 * so "the tree is clean" is not something you can assume by remembering.
 *
 * Anything git reports — staged, unstaged or untracked — stops the deploy.
 * Untracked files count: a new migration or route sitting unversioned is
 * exactly the kind of thing that should not reach production by accident.
 *
 * Override with DEPLOY_DIRTY=1 when you genuinely mean to publish what is on
 * disk, which should be rare enough to feel odd.
 */

import { execFileSync } from "node:child_process";

if (process.env.DEPLOY_DIRTY === "1") {
  console.log("⚠️  DEPLOY_DIRTY=1 — deploying the working tree as it stands.");
  process.exit(0);
}

let status;
try {
  status = execFileSync("git", ["status", "--porcelain"], {
    encoding: "utf8",
  }).trim();
} catch {
  // Not a git checkout, or git is unavailable: nothing to check against, and
  // failing here would block a deploy for a reason that isn't about safety.
  process.exit(0);
}

if (!status) {
  const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    encoding: "utf8",
  }).trim();
  console.log(`✅ Working tree clean — deploying ${branch} at ${sha}.`);
  process.exit(0);
}

const lines = status.split("\n");
const shown = lines.slice(0, 20);

console.error(
  [
    "",
    `❌ Refusing to deploy: ${lines.length} uncommitted change${lines.length === 1 ? "" : "s"} in the working tree.`,
    "",
    "   vercel --prod uploads this directory, not the last commit, so these",
    "   would go to production exactly as they are:",
    "",
    ...shown.map((l) => `     ${l}`),
    ...(lines.length > shown.length
      ? [`     … and ${lines.length - shown.length} more`]
      : []),
    "",
    "   Commit them, or deploy from a clean checkout.",
    "   To publish the tree as it stands anyway: DEPLOY_DIRTY=1 npm run deploy",
    "",
  ].join("\n"),
);
process.exit(1);
