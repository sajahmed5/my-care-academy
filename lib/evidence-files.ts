/**
 * Naming the files in an evidence pack's ZIP (CARER-FILE.md §4, "plus the
 * source files"). Pure, so the naming rules can be tested without storage.
 */

const INVALID = /[\\/:*?"<>|]/g;

/** A name safe as a ZIP entry on Windows and macOS alike. */
export function safeEntry(s: string): string {
  return s.replace(INVALID, "").replace(/\s+/g, " ").trim() || "file";
}

/** The extension of a stored path or file name, or "bin" when there is none. */
export function extOf(name: string | null | undefined): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name ?? "");
  return m ? m[1].toLowerCase() : "bin";
}

/**
 * Hands out unique paths inside the ZIP: a second "Fire Safety.pdf" in the
 * same folder becomes "Fire Safety (2).pdf" rather than overwriting the first.
 */
export function entryNamer(): (folder: string, base: string, ext: string) => string {
  const used = new Set<string>();
  return (folder, base, ext) => {
    const stem = `${safeEntry(folder)}/${safeEntry(base)}`;
    let path = `${stem}.${ext}`;
    for (let n = 2; used.has(path.toLowerCase()); n++) path = `${stem} (${n}).${ext}`;
    used.add(path.toLowerCase());
    return path;
  };
}
