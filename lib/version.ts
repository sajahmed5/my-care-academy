import pkg from "../package.json";

/**
 * App/build version, surfaced in the UI (person menu + marketing footer) so it's
 * clear which build is live. The version is the single source of truth in
 * package.json; on Vercel we append the short commit SHA of the deploy.
 *
 * Server-only: this imports package.json, so keep it out of client components
 * (pass VERSION_LABEL down as a prop instead) to avoid bundling package.json.
 */
export const APP_VERSION: string = pkg.version;

/** Short commit SHA of the current deploy (Vercel sets the env var at build). */
export const BUILD_SHA: string = (
  process.env.VERCEL_GIT_COMMIT_SHA ?? ""
).slice(0, 7);

/** e.g. "v1.0.0" locally, "v1.0.0 · a1b2c3d" on a Vercel deploy. */
export const VERSION_LABEL: string = BUILD_SHA
  ? `v${APP_VERSION} · ${BUILD_SHA}`
  : `v${APP_VERSION}`;
