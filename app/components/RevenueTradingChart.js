"use client";

import { useMemo, useState } from "react";

const formatCompactMoney = (value) => {
  const amount = Number(value || 0);

  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `${Math.round(amount / 1000)}K`;

  return amount.toLocaleString("th-TH");
};

const getPointY = (value, minValue, maxValue, chartTop, chartHeight) => {
  const range = Math.max(maxValue - minValue, 1);
  return chartTop + chartHeight - ((value - minValue) / range) * chartHeight;
};

export default function RevenueTradingChart({ data, total }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const chart = useMemo(() => {
    const points = data.map((item, index) => {
      const close = Number(item.total || 0);
      const previousClose = index > 0 ? Number(data[index - 1]?.total || 0) : close;
      const open = index === 0 ? close * 0.92 : previousClose;
      const isUp = close >= open;
      const high = Math.max(open, close) * (close > 0 || open > 0 ? 1.08 : 1);
      const low = Math.max(0, Math.min(open, close) * 0.92);

      return {
        ...item,
        open,
        close,
        high,
        low,
        isUp,
      };
    });
    const values = points.flatMap((item) => [item.high, item.low, item.close]);
    const maxValue = Math.max(...values, 1);
    const minValue = Math.min(...values, 0);
    const paddedMax = maxValue * 1.06;
    const paddedMin = Math.max(0, minValue * 0.9);

    return {
      points,
      maxValue: paddedMax,
      minValue: paddedMin,
      yLabels: Array.from({ length: 6 }, (_, index) => {
        const ratio = index / 5;
        return paddedMax - (paddedMax - paddedMin) * ratio;
      }),
    };
  }, [data]);

  const width = 1200;
  const height = 520;
  const left = 26;
  const right = 96;
  const top = 34;
  const bottom = 86;
  const volumeTop = 392;
  const chartHeight = 342;
  const plotWidth = width - left - right;
  const count = Math.max(chart.points.length, 1);
  const slotWidth = plotWidth / count;
  const candleWidth = Math.max(10, Math.min(28, slotWidth * 0.5));
  const maxVolume = Math.max(...chart.points.map((item) => item.close), 1);
  const hoveredPoint =
    hoveredIndex == null ? null : chart.points[hoveredIndex] || null;
  const lastPoint = chart.points[chart.points.length - 1] || null;
  const lastY = lastPoint
    ? getPointY(lastPoint.close, chart.minValue, chart.maxValue, top, chartHeight)
    : top + chartHeight;

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3">
        <div>
          <p className="text-sm font-bold text-zinc-900">Revenue Chart</p>
          <p className="text-xs text-zinc-500">
            รายได้จากคลังข้อมูลที่สถานะงานเสร็จแล้ว
          </p>
        </div>
        <div className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white">
          ฿ {Number(total || 0).toLocaleString("th-TH")}
        </div>
      </div>

      <div className="relative">
        {hoveredPoint && (
          <div className="absolute left-4 top-4 z-10 rounded-xl border border-zinc-200 bg-white/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
            <p className="font-bold text-zinc-900">{hoveredPoint.label}</p>
            <p className="mt-1 text-zinc-500">
              รายได้: ฿ {hoveredPoint.close.toLocaleString("th-TH")}
            </p>
            <p
              className={`mt-1 font-semibold ${
                hoveredPoint.isUp ? "text-emerald-600" : "text-red-500"
              }`}
            >
              {hoveredPoint.isUp ? "เพิ่มขึ้น" : "ลดลง"} จากช่วงก่อน
            </p>
          </div>
        )}

        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-[520px] w-full touch-pan-x bg-white 2xl:h-[600px]"
          role="img"
          aria-label="Revenue trading style chart"
        >
          <rect x="0" y="0" width={width} height={height} fill="#ffffff" />

          {chart.yLabels.map((value, index) => {
            const y = getPointY(value, chart.minValue, chart.maxValue, top, chartHeight);

            return (
              <g key={`grid-${index}`}>
                <line
                  x1={left}
                  y1={y}
                  x2={width - right + 30}
                  y2={y}
                  stroke="#e5e7eb"
                  strokeWidth="1"
                />
                <text
                  x={width - right + 42}
                  y={y + 5}
                  fill="#111827"
                  fontSize="16"
                  fontWeight="600"
                >
                  {formatCompactMoney(value)}
                </text>
              </g>
            );
          })}

          {chart.points.map((point, index) => {
            if (index % Math.max(1, Math.ceil(count / 8)) !== 0) return null;
            const x = left + slotWidth * index + slotWidth / 2;

            return (
              <line
                key={`vgrid-${point.label}`}
                x1={x}
                y1={top}
                x2={x}
                y2={height - bottom + 12}
                stroke="#eef2f7"
                strokeWidth="1"
              />
            );
          })}

          {lastPoint && (
            <g>
              <line
                x1={left}
                y1={lastY}
                x2={width - right + 30}
                y2={lastY}
                stroke="#0f9f76"
                strokeDasharray="2 4"
                strokeWidth="1.5"
              />
              <rect
                x={width - right + 36}
                y={lastY - 16}
                width="72"
                height="32"
                rx="4"
                fill="#40977f"
              />
              <text
                x={width - right + 72}
                y={lastY + 5}
                fill="#ffffff"
                fontSize="16"
                fontWeight="800"
                textAnchor="middle"
              >
                {formatCompactMoney(lastPoint.close)}
              </text>
            </g>
          )}

          {chart.points.map((point, index) => {
            const x = left + slotWidth * index + slotWidth / 2;
            const openY = getPointY(point.open, chart.minValue, chart.maxValue, top, chartHeight);
            const closeY = getPointY(point.close, chart.minValue, chart.maxValue, top, chartHeight);
            const highY = getPointY(point.high, chart.minValue, chart.maxValue, top, chartHeight);
            const lowY = getPointY(point.low, chart.minValue, chart.maxValue, top, chartHeight);
            const bodyTop = Math.min(openY, closeY);
            const bodyHeight = Math.max(Math.abs(closeY - openY), 5);
            const fill = point.isUp ? "#40977f" : "#df464d";
            const volumeHeight = Math.max(4, (point.close / maxVolume) * 88);

            return (
              <g
                key={point.label}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <rect
                  x={x - slotWidth / 2}
                  y={top}
                  width={slotWidth}
                  height={height - bottom}
                  fill="transparent"
                />
                <line
                  x1={x}
                  y1={highY}
                  x2={x}
                  y2={lowY}
                  stroke={fill}
                  strokeWidth="2"
                />
                <rect
                  x={x - candleWidth / 2}
                  y={bodyTop}
                  width={candleWidth}
                  height={bodyHeight}
                  fill={fill}
                  rx="1"
                />
                <rect
                  x={x - candleWidth / 1.7}
                  y={volumeTop + 96 - volumeHeight}
                  width={candleWidth * 1.2}
                  height={volumeHeight}
                  fill={point.isUp ? "#8dc9c2" : "#efaaa9"}
                  opacity="0.78"
                />
              </g>
            );
          })}

          {chart.points.map((point, index) => {
            const step = Math.max(1, Math.ceil(count / 6));
            if (index % step !== 0 && index !== count - 1) return null;

            const x = left + slotWidth * index + slotWidth / 2;

            return (
              <text
                key={`x-${point.label}`}
                x={x}
                y={height - 42}
                fill="#111827"
                fontSize="16"
                fontWeight="700"
                textAnchor="middle"
              >
                {point.label}
              </text>
            );
          })}
        </svg>

        <div className="flex items-center gap-2 border-t border-zinc-100 px-4 py-3 text-sm font-bold text-zinc-800">
          <span className="rounded-lg bg-zinc-100 px-3 py-1.5">1D</span>
          <span className="rounded-lg bg-zinc-100 px-3 py-1.5">1M</span>
          <span className="rounded-lg bg-zinc-900 px-3 py-1.5 text-white">YTD</span>
          <span className="rounded-lg bg-zinc-100 px-3 py-1.5">ALL</span>
          <span className="ml-auto text-xs font-semibold text-zinc-400">
            Revenue adjusted
          </span>
        </div>
      </div>
    </div>
  );
}
