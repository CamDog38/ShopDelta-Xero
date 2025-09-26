'use client';

import React, { useState } from 'react';

type BarChartProps = {
  series: Array<{
    key: string;
    label: string;
    sales: number;
    quantity: number;
  }>;
  metric: 'sales' | 'qty';
  currency?: string;
  svgWidth: number;
  svgHeight: number;
  padding: { top: number; right: number; bottom: number; left: number };
};

// Tooltip component for the bar chart
const BarTooltip = ({ visible, x, y, label, value }: { 
  visible: boolean, 
  x: number, 
  y: number, 
  label: string, 
  value: string 
}) => {
  if (!visible) return null;
  return (
    <foreignObject x={x - 75} y={y - 70} width="150" height="60">
      <div style={{
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        color: '#fff',
        padding: '8px 10px',
        borderRadius: '6px',
        fontSize: '12px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.1)',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center'
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{label}</div>
        <div>{value}</div>
      </div>
    </foreignObject>
  );
};

export function InteractiveBarChart({ series, metric, currency, svgWidth, svgHeight, padding }: BarChartProps) {
  // Track which bar is being hovered
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);

  // Format money values
  const fmtMoney = (n: number | undefined) => {
    const v = Number(n ?? 0);
    const formatted = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
    return currency ? `${currency} ${formatted}` : formatted;
  };

  // Calculate dimensions
  const innerW = svgWidth - padding.left - padding.right;
  const innerH = svgHeight - padding.top - padding.bottom;
  
  // Calculate scales
  const maxMetric = Math.max(1, ...series.map((s) => (metric === 'sales' ? s.sales : s.quantity)));
  const yScale = (v: number) => innerH - (v / maxMetric) * innerH;
  const xBand = (i: number) => (innerW / Math.max(1, series.length)) * i + (innerW / Math.max(1, series.length)) / 2;

  return (
    <svg width={svgWidth} height={svgHeight} role="img" aria-label="Chart">
      <g transform={`translate(${padding.left},${padding.top})`}>
        <line x1={0} y1={0} x2={0} y2={innerH} stroke="#d0d4d9" />
        
        {/* Y-axis ticks */}
        {Array.from({ length: 5 }).map((_, i) => {
          const v = (maxMetric / 4) * i;
          const y = yScale(v);
          return (
            <g key={i}>
              <line x1={-4} y1={y} x2={0} y2={y} stroke="#aeb4bb" />
              <text x={-8} y={y + 4} textAnchor="end" fontSize={10} fill="#6b7177">{Math.round(v)}</text>
              <line x1={0} y1={y} x2={innerW} y2={y} stroke="#f1f3f5" />
            </g>
          );
        })}
        
        {/* X-axis */}
        <line x1={0} y1={innerH} x2={innerW} y2={innerH} stroke="#d0d4d9" />
        
        {/* X-axis labels */}
        {series.map((s, i) => (
          <text key={s.key} x={xBand(i)} y={innerH + 16} textAnchor="middle" fontSize={10} fill="#6b7177">{s.label}</text>
        ))}
        
        {/* Bars with tooltips */}
        {series.map((s, i) => {
          const barW = Math.max(12, innerW / Math.max(1, series.length) - 24);
          const x = xBand(i) - barW / 2;
          const value = metric === 'sales' ? s.sales : s.quantity;
          const y = yScale(value);
          const h = innerH - y;
          const formattedValue = metric === 'sales' ? fmtMoney(value) : value.toString();
          
          return (
            <g key={s.key}>
              <rect 
                x={x} 
                y={y} 
                width={barW} 
                height={h} 
                fill="#4facfe"
                onMouseEnter={() => setHoveredBarIndex(i)}
                onMouseLeave={() => setHoveredBarIndex(null)}
                style={{ cursor: 'pointer' }}
              />
              <BarTooltip 
                visible={hoveredBarIndex === i}
                x={x + barW/2}
                y={y}
                label={s.label}
                value={`${metric === 'sales' ? 'Sales' : 'Quantity'}: ${formattedValue}`}
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
