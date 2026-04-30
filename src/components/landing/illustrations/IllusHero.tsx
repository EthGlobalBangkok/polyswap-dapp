interface Props {
  size?: number;
  className?: string;
}

/**
 * Hero illustration — dial connected to a swap lever.
 *
 * SVG attribute values like `fill="var(--color-…)"` do NOT resolve CSS variables;
 * we use Tailwind's `fill-*` / `stroke-*` utilities so the values come through CSS,
 * and inline `style.fontFamily` for `<text>` (no Tailwind utility for it on SVG text).
 */
export function IllusHero({ size = 460, className }: Props) {
  return (
    <svg
      width={size}
      height={size * 0.78}
      viewBox="0 0 460 360"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      strokeLinecap="round"
      style={{ fontFamily: "var(--font-mono)" }}
      aria-hidden
    >
      <rect x="10" y="10" width="440" height="340" className="fill-paper-2" />
      <rect x="10" y="10" width="440" height="340" />

      <rect x="40" y="40" width="180" height="42" className="fill-ink" />
      <text
        x="130"
        y="68"
        textAnchor="middle"
        fontSize="13"
        letterSpacing="3"
        stroke="none"
        className="fill-paper"
      >
        THE WORLD →
      </text>

      <circle cx="120" cy="180" r="60" className="fill-paper" />
      <circle cx="120" cy="180" r="60" />
      <circle cx="120" cy="180" r="48" className="stroke-ink-3" strokeWidth="1" />
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        return (
          <line
            key={i}
            x1={120 + Math.cos(a) * 52}
            y1={180 + Math.sin(a) * 52}
            x2={120 + Math.cos(a) * 60}
            y2={180 + Math.sin(a) * 60}
          />
        );
      })}
      <line x1="120" y1="180" x2="155" y2="148" strokeWidth="2.5" className="stroke-accent" />
      <circle cx="120" cy="180" r="5" className="fill-ink" />
      <text
        x="120"
        y="248"
        textAnchor="middle"
        fontSize="18"
        stroke="none"
        style={{ fontFamily: "var(--font-serif)", fontStyle: "italic" }}
      >
        odds rising
      </text>

      <path d="M180 180 Q 230 180 250 200 T 320 200" strokeWidth="3" />

      <rect x="300" y="160" width="120" height="100" className="fill-paper" />
      <rect x="300" y="160" width="120" height="100" />
      <circle cx="360" cy="240" r="8" className="fill-ink" />
      <line x1="360" y1="240" x2="395" y2="180" strokeWidth="4" />
      <circle cx="395" cy="180" r="10" className="fill-accent stroke-ink" />
      <rect x="312" y="172" width="34" height="20" className="fill-ink" />
      <text x="329" y="186" textAnchor="middle" fontSize="10" stroke="none" className="fill-paper">
        SWAP
      </text>

      <circle cx="430" cy="120" r="14" className="fill-paper" />
      <circle cx="430" cy="120" r="14" />
      <text x="430" y="125" textAnchor="middle" fontSize="14" fontWeight="600" stroke="none">
        Ξ
      </text>
      <circle cx="395" cy="100" r="10" className="fill-paper" />
      <circle cx="395" cy="100" r="10" />
      <text x="395" y="104" textAnchor="middle" fontSize="10" fontWeight="600" stroke="none">
        $
      </text>
      <path d="M398 130 q 10 -10 30 -8" strokeDasharray="2 4" />
      <path d="M403 145 q 8 -2 22 -2" strokeDasharray="2 4" />

      <path d="M40 310 Q 230 340 420 305" strokeWidth="2" />
      <path d="M420 305 L408 300 M420 305 L412 314" />
      <text
        x="230"
        y="335"
        textAnchor="middle"
        fontSize="16"
        stroke="none"
        style={{ fontFamily: "var(--font-serif)", fontStyle: "italic" }}
      >
        … and your swap fires.
      </text>

      <text
        x="42"
        y="100"
        fontSize="12"
        stroke="none"
        className="fill-ink-3"
        style={{ fontFamily: "var(--font-serif)", fontStyle: "italic" }}
      >
        a question on Polymarket
      </text>
    </svg>
  );
}
