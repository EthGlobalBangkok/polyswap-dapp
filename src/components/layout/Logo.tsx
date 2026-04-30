interface LogoProps {
  size?: number;
  className?: string;
}

/**
 * Minimal geometric mark — a hard-ruled square with a diagonal cut.
 * Sits next to the wordmark; never gets gradients or fills beyond ink/paper.
 */
export function Logo({ size = 24, className }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <rect
        x="1.5"
        y="1.5"
        width="21"
        height="21"
        fill="var(--color-paper)"
        stroke="var(--color-ink)"
        strokeWidth="1.5"
      />
      <path
        d="M1.5 16.5 L7.5 22.5 M16.5 1.5 L22.5 7.5 M1.5 9 L15 22.5 M9 1.5 L22.5 15"
        stroke="var(--color-ink)"
        strokeWidth="1"
      />
      <rect
        x="9"
        y="9"
        width="6"
        height="6"
        fill="var(--color-accent)"
        stroke="var(--color-ink)"
        strokeWidth="1.2"
      />
    </svg>
  );
}
