import "server-only";
import { BorderStyle, Document, ImageRun, Packer, Paragraph, TextRun } from "docx";
import type { LetterDoc } from "./letterhead";

/**
 * An HR letter as a Word document (issue #89), from the same LetterDoc the
 * PDF prints: the logo (with white label), the company's name and
 * letterhead, the date, the subject, the letter and the signature, so the
 * company can change it in Word before printing or sending it itself.
 */
export async function renderLetterDocx(doc: LetterDoc, logoUrl: string | null | undefined): Promise<Buffer> {
  const font = "Arial";
  const text = (t: string, opts: { bold?: boolean; size?: number; color?: string } = {}) =>
    new TextRun({ text: t, font, bold: opts.bold, size: opts.size ?? 22, color: opts.color });
  const para = (t: string, opts: { bold?: boolean; size?: number; after?: number; color?: string } = {}) =>
    new Paragraph({ children: [text(t, opts)], spacing: { after: opts.after ?? 200, line: 300 } });

  const logo = await logoImage(logoUrl);
  const head: Paragraph[] = [];
  if (logo) head.push(new Paragraph({ children: [logo], spacing: { after: 160 } }));
  head.push(para(doc.company || "—", { bold: true, size: 30, after: doc.letterhead.length ? 40 : 120 }));
  doc.letterhead.forEach((l) => head.push(para(l, { size: 18, color: "374151", after: 20 })));
  // The rule under the letterhead, as on the PDF.
  head.push(new Paragraph({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: "1E293B", space: 4 } }, spacing: { after: 360 } }));

  const body = [
    ...(doc.recipient ? [para(doc.recipient, { after: 40 })] : []),
    para(doc.date, { after: 300 }),
    para(doc.subject, { bold: true, size: 26, after: 300 }),
    para(doc.greeting),
    ...doc.paragraphs.flatMap((p) => p.split("\n").length > 1
      ? [new Paragraph({ children: p.split("\n").flatMap((l, i) => (i ? [new TextRun({ text: l, font, size: 22, break: 1 })] : [text(l)])), spacing: { after: 200, line: 300 } })]
      : [para(p)]),
    para("Yours sincerely,", { after: 600 }),
    para(doc.signer.name || doc.company, { bold: true, after: 0 }),
    para([doc.signer.title, doc.company].filter(Boolean).join(", "), { after: 0 }),
  ];

  const file = new Document({
    creator: doc.company || "My Care Academy",
    title: doc.subject,
    sections: [
      {
        properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } },
        children: [...head, ...body],
      },
    ],
    styles: { default: { document: { run: { font } } } },
  });
  return Packer.toBuffer(file);
}

/** The company's logo for the top of the letter, sized to fit; nothing if it can't be fetched. */
async function logoImage(url: string | null | undefined): Promise<ImageRun | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = Buffer.from(await res.arrayBuffer());
    const type = /\.jpe?g($|\?)/i.test(url) || res.headers.get("content-type")?.includes("jpeg") ? "jpg" : "png";
    const { width, height } = imageSize(data, type) ?? { width: 200, height: 60 };
    const scale = Math.min(200 / width, 60 / height, 1);
    return new ImageRun({ type, data, transformation: { width: Math.round(width * scale), height: Math.round(height * scale) } });
  } catch {
    return null;
  }
}

/** Width and height from a PNG or JPEG's own header. */
function imageSize(b: Buffer, type: "png" | "jpg"): { width: number; height: number } | null {
  if (type === "png" && b.length > 24 && b.readUInt32BE(12) === 0x49484452) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (type === "jpg") {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xc3) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}

/** Word's own type, for the download. */
export const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
