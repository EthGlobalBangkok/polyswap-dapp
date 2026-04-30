interface Props {
  size?: number;
  className?: string;
}

const HEADS = [60, 100, 150, 200, 245] as const;

export function IllusMarket({ size = 300, className }: Props) {
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
      <path d="M40 38 L280 38 L290 58 L280 78 L40 78 L30 58 Z" className="fill-accent" />
      <text
        x="160"
        y="64"
        textAnchor="middle"
        fontSize="20"
        stroke="none"
        className="fill-paper"
        style={{ fontFamily: "var(--font-serif)", fontStyle: "italic" }}
      >
        Will it happen?
      </text>
      <line x1="50" y1="38" x2="50" y2="20" />
      <line x1="270" y1="38" x2="270" y2="20" />
      <circle cx="50" cy="20" r="3" fill="currentColor" />
      <circle cx="270" cy="20" r="3" fill="currentColor" />
      {HEADS.map((x, i) => {
        const yes = i % 2 === 0;
        return (
          <g key={x}>
            <circle cx={x} cy={130} r="14" className="fill-paper" />
            <circle cx={x} cy={130} r="14" />
            <path d={`M${x - 12} 145 L${x - 18} 175 L${x - 22} 220`} />
            <path d={`M${x + 12} 145 L${x + 18} 175 L${x + 22} 220`} />
            <path d={`M${x - 2} 145 L${x - 2} 220`} />
            <path d={`M${x + 8} 130 L${x + 22} 100 L${x + 18} 88`} />
            <rect x={x + 18} y={75} width="22" height="14" className="fill-paper" />
            <rect x={x + 18} y={75} width="22" height="14" />
            <text
              x={x + 29}
              y={86}
              textAnchor="middle"
              fontSize="9"
              stroke="none"
              fill="currentColor"
            >
              {yes ? "YES" : "NO"}
            </text>
          </g>
        );
      })}
      <line x1="20" y1="220" x2="300" y2="220" strokeWidth="2" />
    </svg>
  );
}
