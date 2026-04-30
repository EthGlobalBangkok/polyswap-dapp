import type { MarketCategory } from "@/types/design";

interface Props {
  category: MarketCategory;
  size?: number;
  className?: string;
}

export function CatIllus({ category, size = 64, className }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 80 80",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
    className,
    "aria-hidden": true,
  };

  switch (category) {
    case "Macro":
      // Stylised candle/line chart with an up-trend and a percent mark.
      return (
        <svg {...common} style={{ fontFamily: "var(--font-mono)" }}>
          {/* Frame */}
          <line x1="12" y1="14" x2="12" y2="64" />
          <line x1="12" y1="64" x2="68" y2="64" />
          {/* Trend line climbing through the frame */}
          <path d="M16 56 L26 50 L36 42 L46 36 L56 26 L64 20" strokeWidth="2.2" />
          {/* Up-arrow head */}
          <path d="M64 20 L58 22 M64 20 L62 26" strokeWidth="2.2" />
          {/* Percent symbol — accent */}
          <circle cx="22" cy="26" r="3.5" className="fill-accent" />
          <circle cx="34" cy="38" r="3.5" className="fill-accent" />
          <line x1="34" y1="22" x2="22" y2="42" strokeWidth="2" className="stroke-accent" />
        </svg>
      );
    case "Politics":
      return (
        <svg {...common}>
          <path d="M16 64 V36 L16 22 L40 14 L64 22 V36 V64" />
          <line x1="10" y1="64" x2="70" y2="64" strokeWidth="2.5" />
          <line x1="24" y1="36" x2="24" y2="64" />
          <line x1="40" y1="36" x2="40" y2="64" />
          <line x1="56" y1="36" x2="56" y2="64" />
          <line x1="14" y1="36" x2="66" y2="36" />
          <path d="M40 14 L40 6 L52 9 L40 14" className="fill-accent" />
        </svg>
      );
    case "Crypto":
      return (
        <svg {...common} style={{ fontFamily: "var(--font-mono)" }}>
          <circle cx="40" cy="40" r="26" />
          <text
            x="40"
            y="48"
            textAnchor="middle"
            fontWeight="700"
            fontSize="22"
            stroke="none"
            fill="currentColor"
          >
            ₿
          </text>
          <path d="M62 18 L70 10 M70 10 L70 18 M70 10 L62 10" strokeWidth="2" />
        </svg>
      );
    case "Geopolitics":
      // Globe with meridians + a marker pin in the accent colour.
      return (
        <svg {...common}>
          <circle cx="40" cy="40" r="26" />
          {/* Meridians */}
          <ellipse cx="40" cy="40" rx="10" ry="26" />
          <ellipse cx="40" cy="40" rx="22" ry="26" />
          {/* Equator */}
          <line x1="14" y1="40" x2="66" y2="40" strokeWidth="1.4" />
          {/* Marker pin */}
          <path
            d="M52 22 C 52 16 60 16 60 22 C 60 28 56 32 56 32 C 56 32 52 28 52 22 Z"
            className="fill-accent stroke-ink"
          />
          <circle cx="56" cy="22" r="2" className="fill-paper" stroke="none" />
        </svg>
      );
  }
}
