/**
 * One rule for every file a person uploads: a size cap and an allow-list of
 * kinds, checked by the declared type AND the file's name, so a program
 * renamed .pdf, an HTML page or an SVG with a script in it never lands in a
 * bucket. Pure, so the server actions and the tests share it.
 */

export type UploadKind = "image" | "pdf" | "document" | "spreadsheet";

/**
 * The most any upload can be. A server action's whole request is capped at
 * 4 MB (next.config.ts, inside Vercel's 4.5 MB), and a file bigger than
 * that never reaches the code that would explain the limit: the page just
 * fails. So the limit is 3 MB everywhere, checked in the browser before the
 * request is sent and again on the server.
 */
export const UPLOAD_LIMIT_BYTES = 3 * 1024 * 1024;

/** For a file input's onChange: the sentence to show, or null when it fits. */
export function tooBigMessage(file: { size: number; name: string } | null | undefined, label = "That file"): string | null {
  if (!file || file.size <= UPLOAD_LIMIT_BYTES) return null;
  return `${label} is ${formatBytes(file.size)}: keep it under ${formatBytes(UPLOAD_LIMIT_BYTES)}.`;
}

interface Rule {
  types: RegExp;
  extensions: Set<string>;
}

const RULES: Record<UploadKind, Rule> = {
  image: { types: /^image\/(jpeg|png|webp|gif|heic|heif)$/, extensions: new Set(["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"]) },
  pdf: { types: /^application\/pdf$/, extensions: new Set(["pdf"]) },
  // Office files and plain text: what a fit note, a reference or a piece of
  // evidence tends to arrive as. Never HTML, SVG, scripts or archives.
  document: {
    types: /^(application\/(pdf|msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)|vnd\.ms-excel|rtf|vnd\.ms-outlook)|text\/(plain|csv|rtf)|message\/rfc822)$/,
    extensions: new Set(["pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "rtf", "msg", "eml"]),
  },
  spreadsheet: { types: /^(text\/csv|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|application\/vnd\.ms-excel)$/, extensions: new Set(["csv", "xlsx", "xls"]) },
};

export interface UploadFacts {
  name: string;
  /** The declared MIME type; browsers leave it empty for unknown files. */
  type: string;
  size: number;
}

/** The file's extension, lower case, or "" when it has none. */
export function extensionOf(name: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name.trim());
  return m ? m[1].toLowerCase() : "";
}

/**
 * Null when the file may be stored, otherwise the sentence to show. The
 * declared type and the extension must BOTH fit one of the kinds: a
 * program renamed to .pdf arrives as application/octet-stream or
 * application/x-msdownload and is turned away; a .pdf with a PDF type is
 * fine. A file with no declared type is judged on its name alone.
 */
export function checkUpload(file: UploadFacts, opts: { maxBytes: number; kinds: UploadKind[]; label?: string }): string | null {
  const what = opts.label ?? "That file";
  if (!(file.size > 0)) return `${what} looks empty. Try again.`;
  if (file.size > opts.maxBytes) return `${what} is too big: keep it under ${formatBytes(opts.maxBytes)}.`;
  const ext = extensionOf(file.name);
  const type = (file.type || "").toLowerCase().split(";")[0].trim();
  const extOk = opts.kinds.some((k) => RULES[k].extensions.has(ext));
  const typeOk = !type || type === "application/octet-stream" ? extOk && !!ext : opts.kinds.some((k) => RULES[k].types.test(type));
  if (!extOk || !typeOk) return `${what} isn't a kind we can take. Use ${describe(opts.kinds)}.`;
  return null;
}

/** The content type to store: the declared one, or one implied by the name. */
export function storedType(file: UploadFacts): string {
  const type = (file.type || "").toLowerCase().split(";")[0].trim();
  if (type && type !== "application/octet-stream") return type;
  const byExt: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic", heif: "image/heif", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv", txt: "text/plain", rtf: "application/rtf", msg: "application/vnd.ms-outlook", eml: "message/rfc822" };
  return byExt[extensionOf(file.name)] ?? "application/octet-stream";
}

function describe(kinds: UploadKind[]): string {
  const words = kinds.map((k) => ({ image: "a photo (JPG, PNG, WebP, HEIC)", pdf: "a PDF", document: "a PDF, Word, Excel or text file", spreadsheet: "a CSV or Excel spreadsheet" })[k]);
  return words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${Math.round(n / (1024 * 1024))} MB`;
  return `${Math.round(n / 1024)} KB`;
}

/** The first bytes a file of this kind always starts with. */
const MAGIC: Record<string, (b: Uint8Array) => boolean> = {
  pdf: (b) => ascii(b, 0, "%PDF"),
  png: (b) => b[0] === 0x89 && ascii(b, 1, "PNG"),
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  jpeg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  gif: (b) => ascii(b, 0, "GIF8"),
  webp: (b) => ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP"),
  heic: (b) => ascii(b, 4, "ftyp"),
  heif: (b) => ascii(b, 4, "ftyp"),
  docx: (b) => ascii(b, 0, "PK"),
  xlsx: (b) => ascii(b, 0, "PK"),
  doc: (b) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0,
  xls: (b) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0,
  msg: (b) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0,
};

function ascii(b: Uint8Array, at: number, text: string): boolean {
  if (b.length < at + text.length) return false;
  for (let i = 0; i < text.length; i++) if (b[at + i] !== text.charCodeAt(i)) return false;
  return true;
}

/**
 * Whether the file's first bytes match its name: false for a program renamed
 * .pdf, null when the kind has no fixed signature (text, csv, rtf, eml).
 */
export function looksLike(bytes: Uint8Array, name: string): boolean | null {
  const check = MAGIC[extensionOf(name)];
  return check ? check(bytes) : null;
}

/**
 * checkUpload, then the file's own bytes: the name and the declared type
 * can both be whatever the sender likes; the first bytes cannot.
 */
export function checkUploadBytes(file: UploadFacts, bytes: Uint8Array, opts: { maxBytes: number; kinds: UploadKind[]; label?: string }): string | null {
  const first = checkUpload(file, opts);
  if (first) return first;
  if (looksLike(bytes, file.name) === false) return `${opts.label ?? "That file"} isn't really a .${extensionOf(file.name)} file. Use ${describe(opts.kinds)}.`;
  return null;
}
