interface Props {
  size?: number;
  className?: string;
}

export function IllusWallet({ size = 300, className }: Props) {
  return (
    <svg
      width={size}
      height={size * 0.78}
      viewBox="0 0 320 250"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      strokeLinecap="round"
      style={{ fontFamily: "var(--font-mono)" }}
      aria-hidden
    >
      <rect x="50" y="80" width="220" height="130" className="fill-paper-2" />
      <rect x="50" y="80" width="220" height="130" />
      <path d="M50 80 L160 50 L270 80" className="fill-paper-3" />
      <path d="M50 80 L160 50 L270 80" />
      <rect x="180" y="140" width="60" height="40" className="fill-accent" />
      <rect x="180" y="140" width="60" height="40" />
      <circle cx="200" cy="160" r="8" className="fill-paper stroke-ink" />
      <circle cx="220" cy="160" r="8" className="fill-paper stroke-ink" />
      <text x="200" y="164" textAnchor="middle" fontSize="9" stroke="none" fill="currentColor">
        $
      </text>
      <text x="220" y="164" textAnchor="middle" fontSize="9" stroke="none" fill="currentColor">
        $
      </text>
      <rect x="140" y="115" width="40" height="32" className="fill-ink" />
      <path
        d="M148 115 v-8 a12 12 0 0 1 24 0 v8"
        fill="none"
        strokeWidth="2"
        className="stroke-ink"
      />
      <circle cx="160" cy="131" r="3" stroke="none" className="fill-paper" />
      <circle cx="80" cy="115" r="22" className="fill-paper" />
      <circle cx="80" cy="115" r="22" />
      <line x1="80" y1="115" x2="80" y2="100" />
      <line x1="80" y1="115" x2="92" y2="118" />
      <circle cx="80" cy="115" r="2" fill="currentColor" />
      <text
        x="240"
        y="60"
        fontSize="22"
        stroke="none"
        fill="currentColor"
        style={{ fontFamily: "var(--font-serif)", fontStyle: "italic" }}
      >
        z
      </text>
      <text
        x="255"
        y="48"
        fontSize="18"
        stroke="none"
        fill="currentColor"
        style={{ fontFamily: "var(--font-serif)", fontStyle: "italic" }}
      >
        z
      </text>
      <text
        x="266"
        y="38"
        fontSize="14"
        stroke="none"
        fill="currentColor"
        style={{ fontFamily: "var(--font-serif)", fontStyle: "italic" }}
      >
        z
      </text>
    </svg>
  );
}
