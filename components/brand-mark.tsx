import { Logo } from "@/components/logo";

/**
 * The logo at the top of the app: the organisation's own when it has
 * white-label and has uploaded one (ROADMAP §2), ours otherwise. Plain props
 * so the client sidebar can use it as well as server pages.
 */
export function BrandMark({
  logoUrl,
  orgName,
  width,
}: {
  logoUrl?: string | null;
  orgName?: string | null;
  width: number;
}) {
  if (!logoUrl) return <Logo width={width} />;
  return (
    // A user-uploaded image on the storage domain; next/image would need that
    // domain configured, and the file is capped at 512 KB.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt={orgName ? `${orgName} logo` : "Logo"}
      style={{ maxWidth: width, maxHeight: Math.round(width * 0.35) }}
      className="object-contain"
    />
  );
}
