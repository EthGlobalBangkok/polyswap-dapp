"use client";

import { useId, useState, type MouseEvent as ReactMouseEvent } from "react";
import { cn } from "@/lib/cn";
import type { Side } from "@/types/design";

interface TapeProps {
  data: number[];
  threshold?: number;
  /** Hide the dashed threshold line (still uses `threshold` for downstream callers if drawn). */
  showThreshold?: boolean;
  side?: Side;
  width?: number;
  height?: number;
  className?: string;
  /**
   * Draw the line in once on mount via stroke-dasharray (~600ms).
   * Pure CSS — safe to render server-side. Defaults to false.
   */
  animate?: boolean;
  /** When true, show a vertical hover indicator + tooltip with value and date. */
  interactive?: boolean;
  /**
   * The date represented by the last data point. Earlier points are spaced
   * one day apart going backwards. Used only when `interactive` is true and
   * `timestamps` is not provided.
   */
  endDate?: Date | string | number;
  /**
   * Per-point Unix-seconds timestamps. When provided, the hover tooltip uses
   * the actual point's date instead of the synthesised one-per-day spacing.
   */
  timestamps?: number[];
}

const DAY_MS = 86_400_000;

function formatHoverDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Probability tape — sparkline with an optional threshold line and hover
 * tooltip. Always wrapped in its own viewBox so it can never bleed out.
 */
export function Tape({
  data,
  threshold = 0.7,
  showThreshold = true,
  side = "YES",
  width = 240,
  height = 56,
  className,
  animate = false,
  interactive = false,
  endDate,
  timestamps,
}: TapeProps) {
  const clipId = useId();
  const [hover, setHover] = useState<number | null>(null);

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
  const fillCol =
    side === "YES"
      ? "color-mix(in srgb, var(--color-yes) 12%, transparent)"
      : "color-mix(in srgb, var(--color-no) 12%, transparent)";

  const onMouseMove = (e: ReactMouseEvent<SVGSVGElement>) => {
    if (!interactive) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPx = ((e.clientX - rect.left) / rect.width) * width;
    const i = Math.round((xPx - padX) / stepX);
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  };
  const onMouseLeave = () => {
    if (interactive) setHover(null);
  };

  const hoverPoint = hover !== null ? (points[hover] ?? null) : null;
  const hoverValue = hover !== null ? (data[hover] ?? null) : null;
  const hoverDate = (() => {
    if (!interactive || hover === null) return null;
    if (timestamps && timestamps[hover] !== undefined) {
      return new Date(timestamps[hover]! * 1000);
    }
    if (endDate !== undefined) {
      const end = new Date(endDate);
      return new Date(end.getTime() - (data.length - 1 - hover) * DAY_MS);
    }
    return null;
  })();

  // Anchor the tooltip so it doesn't overflow the right edge.
  const tooltipX = hoverPoint ? Math.min(hoverPoint[0] + 6, width - 110) : 0;
  const tooltipY = hoverPoint ? Math.max(hoverPoint[1] - 38, 4) : 0;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn(animate && "tape-anim", className)}
      preserveAspectRatio="none"
      aria-hidden
      style={{ display: "block", maxWidth: "100%" }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="0" width={width} height={height} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <path d={fillD} fill={fillCol} stroke="none" />
        {showThreshold && (
          <line
            x1={padX}
            y1={yT}
            x2={width - padX}
            y2={yT}
            stroke="var(--color-accent)"
            strokeWidth="1.2"
            strokeDasharray="3 3"
          />
        )}
        <path
          d={pathD}
          fill="none"
          stroke={stroke}
          strokeWidth="1.6"
          pathLength={animate ? 1 : undefined}
        />
        <circle cx={xC} cy={yC} r="2.5" fill={stroke} />

        {hoverPoint && hoverValue !== null && (
          <>
            <line
              x1={hoverPoint[0]}
              y1={padY}
              x2={hoverPoint[0]}
              y2={height - padY}
              stroke="var(--color-ink)"
              strokeOpacity="0.35"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            <circle cx={hoverPoint[0]} cy={hoverPoint[1]} r="3.5" fill={stroke} />
            <g transform={`translate(${tooltipX}, ${tooltipY})`}>
              <rect
                width="100"
                height="34"
                rx="2"
                fill="var(--color-paper)"
                stroke="var(--color-ink)"
                strokeWidth="1"
              />
              <text
                x="6"
                y="14"
                fontSize="11"
                fontFamily="var(--font-sans)"
                fill="var(--color-ink)"
                fontWeight="600"
              >
                {(hoverValue * 100).toFixed(1)}%
              </text>
              <text x="6" y="27" fontSize="10" fill="var(--color-ink-3)">
                {hoverDate ? formatHoverDate(hoverDate) : ""}
              </text>
            </g>
          </>
        )}
      </g>
    </svg>
  );
}
