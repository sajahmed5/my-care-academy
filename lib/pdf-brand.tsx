import { Image } from "@react-pdf/renderer";

/**
 * The company's logo at the top of a PDF it hands out, with white label
 * (INTEGRATION-WHITE-LABEL.md: "the logo everywhere — every PDF"). Pass
 * orgBranding().logoUrl: null without white label, so nothing changes.
 * Wherever a logo is shown, the footer says "Powered by My Care Academy".
 */
export function PdfLogo({ url }: { url: string | null | undefined }) {
  if (!url) return null;
  // eslint-disable-next-line jsx-a11y/alt-text -- a PDF image has no alt
  return <Image src={url} style={{ maxHeight: 44, maxWidth: 200, objectFit: "contain", marginBottom: 12 }} />;
}

export const POWERED_BY = "Powered by My Care Academy";

/** A footer line, with our name after it under a company's logo. */
export function withPoweredBy(text: string, logoUrl: string | null | undefined): string {
  return logoUrl ? `${text} · ${POWERED_BY}` : text;
}
