import Image from "next/image";

interface LogoProps {
  /** Rendered height in px. Width follows the SVG's natural 374:434 ratio. */
  size?: number;
  className?: string;
}

// Source SVG is 374×434 — preserve that ratio so the mark doesn't squash when
// callers pass an arbitrary size.
const NATURAL_W = 374;
const NATURAL_H = 434;

export function Logo({ size = 24, className }: LogoProps) {
  const width = Math.round((size * NATURAL_W) / NATURAL_H);
  return (
    <Image
      src="/logo/Logo_black.svg"
      alt="Polyswap"
      width={width}
      height={size}
      className={className}
      priority
    />
  );
}
