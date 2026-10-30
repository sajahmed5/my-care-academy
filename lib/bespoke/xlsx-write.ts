import JSZip from "jszip";

/**
 * Write an .xlsx file: one sheet per table, a bold header row, real numbers
 * and real dates (so Excel can sort and sum them), and nothing else.
 *
 * The reading side (lib/xlsx.ts) already treats an .xlsx as the zip of XML it
 * is, with the JSZip we ship; this is the same idea the other way round,
 * rather than a spreadsheet library for one download. Strings are written
 * inline, so there is no shared-strings table to keep in step.
 */

export type XlsxCell = string | number | boolean | null | { date: string };

export interface XlsxSheet {
  name: string;
  /** The first row is the header, written bold. */
  rows: XlsxCell[][];
}

const xml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Control characters other than tab and newlines are not allowed in XML.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

/** "A", "B", … "Z", "AA" for a zero-based column. */
export function columnName(i: number): string {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Excel's day number for an ISO day: days since 30 Dec 1899. */
export function excelDate(isoDay: string): number {
  return Math.round((Date.parse(`${isoDay.slice(0, 10)}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

/** A sheet name Excel accepts: 31 characters, none of []:*?/\, unique in the book. */
export function sheetNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((raw) => {
    const base = (raw.replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim() || "Sheet").slice(0, 31);
    let name = base;
    for (let i = 2; used.has(name.toLowerCase()); i++) {
      const tail = ` (${i})`;
      name = base.slice(0, 31 - tail.length) + tail;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

function cell(ref: string, v: XlsxCell, header: boolean): string {
  const style = header ? ' s="1"' : "";
  if (v === null || v === "") return "";
  if (typeof v === "object") return `<c r="${ref}" s="2"><v>${excelDate(v.date)}</v></c>`;
  if (typeof v === "number") return Number.isFinite(v) ? `<c r="${ref}"${style}><v>${v}</v></c>` : "";
  if (typeof v === "boolean") return `<c r="${ref}" t="b"${style}><v>${v ? 1 : 0}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xml(v.slice(0, 32_000))}</t></is></c>`;
}

function sheetXml(rows: XlsxCell[][]): string {
  const width = Math.max(1, ...rows.map((r) => r.length));
  const widths = Array.from({ length: width }, (_, c) => {
    const longest = Math.max(
      8,
      ...rows.slice(0, 200).map((r) => {
        const v = r[c];
        return v === null || v === undefined ? 0 : typeof v === "object" ? 11 : String(v).length;
      }),
    );
    return Math.min(60, longest + 2);
  });
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  const body = rows
    .map((r, i) => `<row r="${i + 1}">${r.map((v, c) => cell(`${columnName(c)}${i + 1}`, v, i === 0)).join("")}</row>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${body}</sheetData></worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>
</styleSheet>`;

export async function buildXlsx(sheets: XlsxSheet[]): Promise<Uint8Array> {
  const names = sheetNames(sheets.map((s) => s.name));
  const zip = new JSZip();
  // No folder entries: Excel doesn't need them and some readers object.
  const add = (path: string, content: string) => zip.file(path, content, { createFolders: false });
  add(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${names
      .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
      .join("")}</Types>`,
  );
  add(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  add(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
      .map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join("")}</sheets></workbook>`,
  );
  add(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join("")}<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  add("xl/styles.xml", STYLES);
  sheets.forEach((s, i) => add(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s.rows)));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
