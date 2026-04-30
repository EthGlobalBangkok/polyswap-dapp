import { useId } from "react";
import { cn } from "@/lib/cn";
import type { Side } from "@/types/design";

interface TapeProps {
  data: number[];
  threshold?: number;
  side?: Side;
  width?: number;
  height?: number;
  className?: string;
  /**
   * Draw the line in once on mount via stroke-dasharray (~600ms).
   * Pure CSS — safe to render server-side. Defaults to false.
   */
  animate?: boolean;
}

/**
 * Probability tape — sparkline with the threshold drawn as a dashed accent line.
 * Always wrapped in its own viewBox so it can never bleed out of its container.
 */
export function Tape({
  data,
  threshold = 0.7,
  side = "YES",
  width = 240,
  height = 56,
  className,
  animate = false,
}: TapeProps) {
  const clipId = useId();
  if (data.length < 2) {
    return null;
  }

  const padX = 2;
  const padY = 4;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const stepX = innerW / (data.length - 1);

  const points = data.map((v, i) => {
    const clamped = Math.max(0, Math.min(1, v));
    return [padX + i * stepX, padY + innerH - clamped * innerH] as const;
  });

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(2)} ${p[1].toFixed(2)}`)
    .join(" ");
  const fillD = `${pathD} L ${width - padX} ${height - padY} L ${padX} ${height - padY} Z`;

  const yT = padY + innerH - Math.max(0, Math.min(1, threshold)) * innerH;
  const last = data[data.length - 1] ?? 0;
  const yC = padY + innerH - last * innerH;
  const xC = width - padX;

  const stroke = side === "YES" ? "var(--color-yes)" : "var(--color-no)";
  const fillCol = side === "YES" ? "rgba(46,107,63,.12)" : "rgba(176,58,46,.12)";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn(animate && "tape-anim", className)}
      preserveAspectRatio="none"
      aria-hidden
      style={{ display: "block", maxWidth: "100%" }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="0" width={width} height={height} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <path d={fillD} fill={fillCol} stroke="none" />
        <line
          x1={padX}
          y1={yT}
          x2={width - padX}
          y2={yT}
          stroke="var(--color-accent)"
          strokeWidth="1.2"
          strokeDasharray="3 3"
        />
        <path
          d={pathD}
          fill="none"
          stroke={stroke}
          strokeWidth="1.6"
          pathLength={animate ? 1 : undefined}
        />
        <circle cx={xC} cy={yC} r="2.5" fill={stroke} />
      </g>
    </svg>
  );
}
