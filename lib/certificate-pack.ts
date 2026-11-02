/**
 * The certificate ZIP (/org/certificates/pack): how many files one download
 * holds, and the note that goes inside when it does not hold every
 * certificate. Pure, so the wording can be tested without storage.
 */

/**
 * Files in one ZIP. The read is complete — every certificate is fetched, paged
 * (Saj, 2 Nov 2026) — but downloading and zipping more than this in one go
 * runs past the 60-second function limit, so the rest are named in a
 * README.txt inside the ZIP rather than left out in silence.
 */
export const PACK_MAX_FILES = 400;

/** One certificate as a README line: who, what, when. */
export function describeCertificate(r: { issued_at: unknown; courses: unknown; users: unknown }): string {
  const course = (r.courses as { title?: string } | null)?.title ?? "Course";
  const u = r.users as { full_name?: string; email?: string } | null;
  return `${u?.full_name || u?.email || "Learner"} - ${course} (issued ${String(r.issued_at).slice(0, 10)})`;
}

/**
 * The README for a ZIP short of certificates: how many are in, which were
 * left out and how to get them, and which could not be read from storage.
 * Empty when the ZIP is complete, so no README is written.
 */
export function packReadme({
  packed,
  total,
  leftOut,
  unreadable,
  byCourse,
  max = PACK_MAX_FILES,
}: {
  packed: number;
  total: number;
  leftOut: string[];
  unreadable: string[];
  /** A course's pack (every carer) rather than one carer's (every course). */
  byCourse: boolean;
  max?: number;
}): string {
  if (!leftOut.length && !unreadable.length) return "";
  const lines = [`${packed} of ${total} certificate(s) are in this ZIP.`, ""];
  if (leftOut.length) {
    lines.push(
      `${leftOut.length} were left out: a single download holds at most ${max} files, so it finishes inside the time allowed.`,
      byCourse
        ? "To get them, open each person below under Staff and download their own certificate pack, which holds every certificate they have."
        : "To get them, open each certificate below from the Certificates page and download it on its own.",
      "",
      ...leftOut,
      "",
    );
  }
  if (unreadable.length) {
    lines.push(`${unreadable.length} are recorded but could not be read from storage:`, "", ...unreadable, "");
  }
  return lines.join("\n");
}
