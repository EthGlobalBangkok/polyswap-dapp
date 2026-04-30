interface Props {
  size?: number;
  className?: string;
}

const TICKS = [0, 0.25, 0.5, 0.75, 1] as const;

export function IllusTrigger({ size = 300, className }: Props) {
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
      <rect x="30" y="40" width="260" height="170" className="fill-paper-2" />
      <rect x="30" y="40" width="260" height="170" />
      {TICKS.map((p) => (
        <g key={p}>
          <line x1="28" y1={210 - p * 170} x2="34" y2={210 - p * 170} />
          <text
            x="22"
            y={213 - p * 170}
            textAnchor="end"
            fontSize="9"
            stroke="none"
            fill="currentColor"
          >
            {Math.round(p * 100)}
          </text>
        </g>
      ))}
      <line
        x1="30"
        y1="80"
        x2="290"
        y2="80"
        strokeWidth="1.8"
        strokeDasharray="6 5"
        className="stroke-accent"
      />
      <rect x="240" y="68" width="50" height="16" className="fill-accent" />
      <text
        x="265"
        y="80"
        textAnchor="middle"
        fontSize="10"
        fontWeight="600"
        stroke="none"
        className="fill-paper"
      >
        70%
      </text>
      <path
        d="M40 175 Q 80 165, 100 155 T 150 130 T 200 100 T 250 75"
        fill="none"
        strokeWidth="2.2"
      />
      <line x1="80" y1="220" x2="225" y2="85" strokeWidth="2" className="stroke-accent" />
      <path d="M225 85 L218 88 L222 92 Z" className="fill-accent stroke-accent" />
      <g transform="rotate(-8 235 130)">
        <rect
          x="195"
          y="115"
          width="80"
          height="28"
          fill="none"
          strokeWidth="2.5"
          className="stroke-accent"
        />
        <text
          x="235"
          y="135"
          textAnchor="middle"
          fontWeight="600"
          fontSize="18"
          letterSpacing="2"
          stroke="none"
          className="fill-accent"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          SWAP!
        </text>
      </g>
      <path d="M50 215 Q 70 200 90 215" strokeWidth="2" />
      <line x1="60" y1="219" x2="80" y2="222" />
    </svg>
  );
}
