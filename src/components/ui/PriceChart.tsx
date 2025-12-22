"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import styles from "./PriceChart.module.css";

interface PricePoint {
  t: number;
  p: number;
}

interface PriceChartProps {
  clobTokenId?: string;
  onPriceSelect: (price: number) => void;
  selectedPrice?: number | null;
  isYesOutcome: boolean; // Determines color context
}

export default function PriceChart({
  clobTokenId,
  onPriceSelect,
  selectedPrice,
  isYesOutcome,
}: PriceChartProps) {
  const [data, setData] = useState<PricePoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!clobTokenId) return;

    const fetchHistory = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `https://clob.polymarket.com/prices-history?market=${clobTokenId}&interval=max`
        );
        const result = await response.json();

        if (result.history) {
          const processedData = result.history.map((item: any) => ({
            t: item.t * 1000,
            p: item.p,
          }));
          setData(processedData);

          // Set default to 0.5 (50%) if not set
          if (selectedPrice === null || selectedPrice === undefined) {
            onPriceSelect(0.5);
          }
        }
      } catch (err) {
        console.error("Failed to fetch price history:", err);
        setError("Failed to load chart data");
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, [clobTokenId]);

  // Processed data based on selected outcome (Yes/No)
  const chartData = React.useMemo(() => {
    if (!data.length) return [];
    if (isYesOutcome) return data;
    // Invert for "No" outcome: 1 - p
    return data.map((d) => ({ ...d, p: 1 - d.p }));
  }, [data, isYesOutcome]);

  // Mouse Event Handlers for Dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    updatePriceFromEvent(e);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const updatePriceFromEvent = (e: any) => {
    if (!chartRef.current) return;

    const rect = chartRef.current.getBoundingClientRect();
    const clientY = e.clientY || e.touches?.[0]?.clientY;
    if (clientY === undefined) return;

    const relativeY = clientY - rect.top;

    // Calibrated for the new height (350px) and margins
    // ResponsiveContainer height = 350
    // Chart Area margins: top 20, bottom 20 (defined in AreaChart)
    const chartHeight = 350;
    const topMargin = 20;
    const bottomMargin = 20;
    const plottingHeight = chartHeight - topMargin - bottomMargin;

    // Adjust relativeY to be relative to the plotting area start (topMargin)
    // We explicitly clamp the visual drag area to the plotting area
    const adjustedY = relativeY - 50; // Offset for header + top padding approximation

    // Simplified: Just use the container height logic which is robust enough for "slider" feel
    // chart Y = 1 - (mouseY / height)
    // Visual correction: The cursor misalignement usually happens because the mouse events
    // are relative to the container, but the chart has padding.

    // Let's refine based on the container rect:
    // The chart is roughly in the middle.
    // Let's assume the plotting area is 80% of the container height centered.

    const effectiveHeight = rect.height * 0.8;
    const effectiveTop = rect.height * 0.15; // Header takes some space

    const yInChart = relativeY - effectiveTop;
    let percentage = 1 - yInChart / effectiveHeight;

    percentage = Math.max(0, Math.min(1, percentage));
    onPriceSelect(percentage);
  };

  const formatXAxis = (tickItem: number) => {
    const date = new Date(tickItem);
    return date.toLocaleDateString();
  };

  // 0-100% formatter
  const formatYAxis = (tickItem: number) => {
    return `${(tickItem * 100).toFixed(0)}%`;
  };

  const handleManualInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Allow empty string for typing
    if (val === "") {
      onPriceSelect(0);
      return;
    }
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0 && num <= 100) {
      onPriceSelect(num / 100);
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div
          style={{
            backgroundColor: "#1f2937",
            padding: "4px 8px",
            borderRadius: "4px",
            fontSize: "0.8rem",
            fontWeight: "bold",
            color: chartColor,
            border: "1px solid #374151",
          }}
        >
          {`${(payload[0].value * 100).toFixed(1)}%`}
        </div>
      );
    }
    return null;
  };

  if (isLoading) return <div className={styles.loading}>Loading chart...</div>;
  if (error) return <div className={styles.error}>{error}</div>;
  if (chartData.length === 0) return <div className={styles.empty}>No price history available</div>;

  const currentPrice = chartData[chartData.length - 1].p;
  const chartColor = isYesOutcome ? "#10b981" : "#ef4444";

  return (
    <div
      className={styles.chartContainer}
      ref={chartRef}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{
        cursor: isDragging ? "grabbing" : "default",
        userSelect: "none",
        outline: "none",
        WebkitUserSelect: "none",
      }}
    >
      <div className={styles.header}>
        {/* Removed Current Price as requested */}
        <div style={{ flex: 1 }}></div>
        {selectedPrice !== null && selectedPrice !== undefined && (
          <div style={{ display: "flex", alignItems: "center" }}>
            <span className={styles.triggerPrice}>Trigger:</span>
            <input
              type="number"
              className={styles.priceInput}
              value={(selectedPrice * 100).toFixed(1)}
              onChange={handleManualInput}
              step="0.1"
              min="0"
              max="100"
            />
            <span className={styles.triggerPrice}>%</span>
          </div>
        )}
      </div>

      <div
        className={styles.chartWrapper}
        onMouseDown={handleMouseDown}
        onMouseMove={(e) => isDragging && updatePriceFromEvent(e)}
        style={{
          cursor: isDragging ? "grabbing" : "pointer",
          outline: "none",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={chartData} margin={{ top: 20, right: 0, left: 10, bottom: 20 }}>
            <defs>
              <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
                <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="t"
              tickFormatter={formatXAxis}
              stroke="#4b5563"
              tick={{ fontSize: 10, fill: "#6b7280" }}
              minTickGap={50}
              axisLine={false}
              tickLine={false}
              dy={10}
            />
            <YAxis domain={[0, 1]} hide={true} />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: "#6b7280", strokeWidth: 1, strokeDasharray: "3 3" }}
            />
            <Area
              type="monotone"
              dataKey="p"
              stroke={chartColor}
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#colorPrice)"
              activeDot={{ r: 6, strokeWidth: 0 }}
            />
            {/* Draggable Threshold Line */}
            {selectedPrice !== null && selectedPrice !== undefined && (
              <ReferenceLine
                y={selectedPrice}
                stroke="white"
                strokeDasharray="4 4"
                strokeWidth={2}
                label={({ viewBox }) => {
                  const { x, y, width } = viewBox;
                  return (
                    <g>
                      {/* Handle Dot */}
                      <circle
                        cx={x}
                        cy={y}
                        r="6"
                        fill="white"
                        stroke={chartColor}
                        strokeWidth="2"
                        style={{ cursor: "ns-resize" }}
                      />
                      {/* Label Text */}
                      <text
                        x={width - 10}
                        y={y - 10}
                        fill="white"
                        textAnchor="end"
                        fontSize="14"
                        fontWeight="bold"
                        style={{ filter: "drop-shadow(0px 2px 2px rgba(0,0,0,0.8))" }}
                      >
                        {`${(selectedPrice * 100).toFixed(1)}%`}
                      </text>
                    </g>
                  );
                }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>

        {/* Overlay Slider Hint */}
        <div className={styles.overlayHint}>Click and drag to set trigger probability</div>
      </div>
    </div>
  );
}
