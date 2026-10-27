import Image from "next/image";

/**
 * Lazy by default. The app once rendered two logos per page (the desktop
 * sidebar's and the phone header's) and both were `priority`, so every device
 * preloaded both; the top bar has one, and it sits at the top of the viewport
 * so it loads at once anyway. Pass `eager` only
 * where the logo is the first thing on screen at every width (marketing
 * header, sign-in card).
 */
export function Logo({
  width = 150,
  className,
  eager = false,
}: {
  width?: number;
  className?: string;
  eager?: boolean;
}) {
  return (
    <Image
      src="/logo.png"
      alt="My Care Academy"
      width={width}
      height={Math.round(width * 0.235)}
      loading={eager ? "eager" : "lazy"}
      className={className}
    />
  );
}
