import Image from "next/image";

interface LogoProps {
  size?: number;
  className?: string;
}

/**
 * Company logo — a stylized "S" mark with red accent bar.
 */
export function Logo({ size = 24, className }: LogoProps) {
  return (
    <div style={{ width: size, height: size }}>
      <Image
        src="/polyswap_logo.png"
        alt="Polyswap"
        width={size}
        height={size}
        className={className}
        priority
      />
    </div>
  );
}
