/**
 * A file sent to a server action as a data URL ("data:application/pdf;base64,…"),
 * as bytes plus its type. The type has to go to storage with the upload: without
 * it Supabase stores the file as text/plain and a browser can't open a PDF or a
 * photo from its signed link (issue #84).
 */
export function fileFromDataUrl(dataUrl: string): { buffer: Buffer; contentType: string } {
  const comma = dataUrl.indexOf(",");
  const head = comma > 0 ? dataUrl.slice(0, comma) : "";
  const type = /^data:([\w.+-]+\/[\w.+-]+)/.exec(head)?.[1]?.toLowerCase();
  return {
    buffer: Buffer.from(comma > 0 ? dataUrl.slice(comma + 1) : "", "base64"),
    contentType: type ?? "application/octet-stream",
  };
}
