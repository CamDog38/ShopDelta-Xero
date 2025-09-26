'use client';

import { useState, useRef, useEffect } from 'react';
import styles from '../page.module.css';

type DataPoint = {
  key: string;
  label: string;
  products: {
    id: string;
    title: string;
    value: number;
    color?: string;
  }[];
};

type LineChartProps = {
  data: DataPoint[];
  title?: string;
  yAxisLabel?: string;
  xAxisLabel?: string;
  height?: number;
  formatValue?: (value: number) => string;
  formatType?: 'money' | 'number' | 'string';
  currency?: string;
  onPointClick?: (key: string) => void;
};

// Generate a consistent color based on string
const stringToColor = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 60%)`;
};

export function LineChart({
  data,
  title,
  yAxisLabel,
  xAxisLabel,
  height = 400,
  formatValue,
  formatType = 'number',
  currency,
  onPointClick
}: LineChartProps) {
  const [hoveredPoint, setHoveredPoint] = useState<{seriesId: string, pointIndex: number} | null>(null);
  const [hoveredProduct, setHoveredProduct] = useState<string | null>(null);
  const [visibleProducts, setVisibleProducts] = useState<Record<string, boolean>>({});
  const [tooltipContent, setTooltipContent] = useState<{ x: number; y: number; content: string } | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  
  // Get all unique product IDs
  const allProductIds = Array.from(
    new Set(data.flatMap(d => d.products.map(p => p.id)))
  );
  
  // Initialize visible products
  useEffect(() => {
    const initialVisibility = allProductIds.reduce((acc, id) => {
      acc[id] = true;
      return acc;
    }, {} as Record<string, boolean>);
    setVisibleProducts(initialVisibility);
  }, [allProductIds.join(',')]);
  
  // Get max value for y-axis scale
  const maxValue = Math.max(
    ...data.flatMap(d => 
      d.products
        .filter(p => visibleProducts[p.id])
        .map(p => p.value)
    ),
    0.1 // Minimum to avoid empty chart
  );
  
  // Round up to a nice number for the y-axis
  const yAxisMax = Math.ceil(maxValue * 1.1);
  
  // Generate y-axis ticks
  const yAxisTicks = Array.from({ length: 6 }, (_, i) => Math.round((yAxisMax / 5) * i));
  
  // Get product colors
  const productColors = allProductIds.reduce((acc, id) => {
    const product = data.flatMap(d => d.products).find(p => p.id === id);
    acc[id] = product?.color || stringToColor(id);
    return acc;
  }, {} as Record<string, string>);
  
  // Toggle product visibility
  const toggleProductVisibility = (productId: string) => {
    setVisibleProducts(prev => ({
      ...prev,
      [productId]: !prev[productId]
    }));
  };
  
  // Show only one product
  const showOnlyProduct = (productId: string) => {
    const newVisibility = allProductIds.reduce((acc, id) => {
      acc[id] = id === productId;
      return acc;
    }, {} as Record<string, boolean>);
    setVisibleProducts(newVisibility);
  };
  
  // Show all products
  const showAllProducts = () => {
    const newVisibility = allProductIds.reduce((acc, id) => {
      acc[id] = true;
      return acc;
    }, {} as Record<string, boolean>);
    setVisibleProducts(newVisibility);
  };
  
  // Handle mouse move for tooltip
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!chartRef.current) return;
    
    const rect = chartRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setTooltipContent({ x, y, content: '' });
  };
  
  // Handle mouse leave
  const handleMouseLeave = () => {
    setTooltipContent(null);
    setHoveredPoint(null);
    setHoveredProduct(null);
  };
  
  // Format value with currency if provided
  const formatValueWithCurrency = (value: number) => {
    if (formatType === 'money' || currency) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(value);
    }
    if (formatValue) {
      return formatValue(value);
    }
    return formatType === 'number' ? value.toString() : String(value);
  };
  
  // Format tooltip content
  const formatTooltipContent = (series: { id: string; title: string }, value: number, periodLabel: string) => {
    const valueFormatted = formatValueWithCurrency(value);
    return (
      `<div style="font-weight: bold; margin-bottom: 4px;">${series.title}</div>
       <div>Period: ${periodLabel}</div>
       <div>Value: ${valueFormatted}</div>`
    );
  };
  
  // Calculate chart dimensions
  const chartWidth = data.length * 100; // Each data point gets 100px width
  const minWidth = Math.max(chartWidth, Math.min(1200, window.innerWidth - 100)); // Responsive width
  
  // Filter for product dropdown
  const [filterValue, setFilterValue] = useState('all');
  
  // Handle filter change
  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setFilterValue(value);
    
    if (value === 'all') {
      showAllProducts();
    } else {
      showOnlyProduct(value);
    }
  };
  
  // Prepare series data for each product
  const seriesData = allProductIds
    .filter(id => visibleProducts[id])
    .map(productId => {
      const product = data.flatMap(d => d.products).find(p => p.id === productId);
      const title = product?.title || productId;
      const color = productColors[productId];
      
      const points = data.map((d, i) => {
        const productData = d.products.find(p => p.id === productId);
        return {
          x: i,
          y: productData?.value || 0,
          label: d.label,
          value: productData?.value || 0
        };
      });
      
      return {
        id: productId,
        title,
        color,
        points
      };
    });
  
  return (
    <div className="line-chart-container">
      {title && <h4 className={styles.sectionTitle}>{title}</h4>}
      
      <div className="line-chart-legend" style={{ marginBottom: '16px' }}>
        <h4 style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>Legend:</h4>
        <div className="line-chart-legend-items" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {allProductIds.map(id => {
            const product = data.flatMap(d => d.products).find(p => p.id === id);
            if (!product) return null;
            
            return (
              <div 
                key={id}
                className="line-chart-legend-item"
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  cursor: 'pointer',
                  opacity: visibleProducts[id] ? 1 : 0.5,
                  padding: '6px 10px',
                  borderRadius: '4px',
                  backgroundColor: hoveredProduct === id ? '#f3f4f6' : '#f9fafb',
                  border: '1px solid #e5e7eb',
                  boxShadow: hoveredProduct === id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.2s ease'
                }}
                onClick={() => toggleProductVisibility(id)}
                onMouseEnter={() => setHoveredProduct(id)}
                onMouseLeave={() => setHoveredProduct(null)}
              >
                <div 
                  className="line-chart-legend-color" 
                  style={{ 
                    width: '14px', 
                    height: '14px', 
                    backgroundColor: productColors[id],
                    borderRadius: '3px',
                    marginRight: '8px',
                    border: '1px solid rgba(0,0,0,0.1)'
                  }} 
                />
                <span style={{ fontWeight: 500 }}>{product.title}</span>
              </div>
            );
          })}
        </div>
      </div>
      
      <div className="line-chart-filter" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ marginRight: '8px' }}>Show only</span>
          <select 
            value={filterValue} 
            onChange={handleFilterChange}
            style={{
              padding: '8px 12px',
              backgroundColor: '#ffffff',
              color: '#111827',
              border: '1px solid #d1d5db',
              borderRadius: '4px'
            }}
          >
            <option value="all">All products</option>
            {allProductIds.map(id => {
              const product = data.flatMap(d => d.products).find(p => p.id === id);
              if (!product) return null;
              return (
                <option key={id} value={id}>{product.title}</option>
              );
            })}
          </select>
        </div>
      </div>
      
      <div className="line-chart-scroll-container" style={{ 
        overflowX: 'auto', 
        overflowY: 'hidden',
        border: '1px solid #e5e7eb',
        borderRadius: '6px',
        backgroundColor: '#ffffff'
      }}>
        <div 
          className="line-chart" 
          style={{ 
            position: 'relative',
            height: `${height}px`,
            width: `${minWidth}px`,
            marginBottom: '40px',
            padding: '20px 10px'
          }}
          ref={chartRef}
          onMouseLeave={handleMouseLeave}
        >
          {/* Y-axis */}
          <div 
            className="line-chart-y-axis" 
            style={{ 
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: '40px',
              width: '60px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              paddingRight: '10px',
              color: '#6b7280',
              fontSize: '12px',
              fontWeight: 500
            }}
          >
            {yAxisTicks.reverse().map((tick, i) => (
              <div key={i} style={{ transform: 'translateY(50%)' }}>{tick}</div>
            ))}
          </div>
          
          {/* Y-axis label */}
          {yAxisLabel && (
            <div 
              style={{ 
                position: 'absolute',
                left: '-40px',
                top: '50%',
                transform: 'rotate(-90deg) translateX(50%)',
                transformOrigin: 'center',
                color: '#6b7280',
                fontSize: '12px'
              }}
            >
              {yAxisLabel}
            </div>
          )}
          
          {/* Chart area */}
          <div 
            className="line-chart-area" 
            style={{ 
              position: 'absolute',
              left: '70px',
              right: '20px',
              top: 0,
              bottom: '40px',
              borderLeft: '1px solid #d1d5db',
              borderBottom: '1px solid #d1d5db',
              backgroundColor: '#f9fafb',
              borderRadius: '4px',
            }}
          >
            {/* Horizontal grid lines */}
            {yAxisTicks.map((tick, i) => (
              <div 
                key={i}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: `${(tick / yAxisMax) * 100}%`,
                  borderTop: '1px dashed rgba(209, 213, 219, 0.8)',
                  pointerEvents: 'none'
                }}
              />
            ))}
            
            {/* X-axis labels */}
            {data.map((d, i) => (
              <div 
                key={d.key}
                style={{ 
                  position: 'absolute',
                  left: `${(i / (data.length - 1)) * 100}%`,
                  bottom: '-30px',
                  transform: 'translateX(-50%)',
                  fontSize: '12px',
                  color: '#6b7280',
                  textAlign: 'center',
                  width: '80px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {d.label}
              </div>
            ))}
            
            {/* Lines */}
            {seriesData.map(series => {
              const isHighlighted = hoveredProduct === series.id || !hoveredProduct;
              
              // Calculate points for the SVG path
              const chartWidth = data.length > 1 ? (data.length - 1) : 1;
              const points = series.points.map((p, i) => ({
                x: `${(i / chartWidth) * 100}%`,
                y: `${100 - (p.y / yAxisMax) * 100}%`,
                value: p.value,
                label: p.label
              }));
              
              // Create SVG path
              const pathD = points.map((p, i) => 
                `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
              ).join(' ');
              
              return (
                <div key={series.id} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
                  {/* Line */}
                  <svg 
                    width="100%" 
                    height="100%" 
                    style={{ 
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      pointerEvents: 'none',
                      opacity: isHighlighted ? 1 : 0.3,
                      transition: 'opacity 0.2s ease'
                    }}
                  >
                    <path
                      d={pathD}
                      fill="none"
                      stroke={series.color}
                      strokeWidth={isHighlighted ? 4 : 3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  
                  {/* Points */}
                  {points.map((point, i) => (
                    <div
                      key={i}
                      style={{
                        position: 'absolute',
                        left: point.x,
                        top: point.y,
                        width: '14px',
                        height: '14px',
                        borderRadius: '50%',
                        backgroundColor: series.color,
                        border: '2px solid #ffffff',
                        transform: 'translate(-50%, -50%)',
                        opacity: isHighlighted ? 1 : 0.3,
                        transition: 'all 0.2s ease',
                        cursor: 'pointer',
                        zIndex: hoveredPoint?.seriesId === series.id && hoveredPoint?.pointIndex === i ? 10 : 1,
                        boxShadow: hoveredPoint?.seriesId === series.id && hoveredPoint?.pointIndex === i 
                          ? '0 0 0 4px rgba(255,255,255,0.2)' 
                          : 'none'
                      }}
                      onMouseEnter={(e) => {
                        setHoveredPoint({ seriesId: series.id, pointIndex: i });
                        setHoveredProduct(series.id);
                        setTooltipContent({
                          x: e.clientX - (chartRef.current?.getBoundingClientRect().left || 0),
                          y: e.clientY - (chartRef.current?.getBoundingClientRect().top || 0),
                          content: formatTooltipContent(series, point.value, point.label)
                        });
                      }}
                      onMouseMove={handleMouseMove}
                      onMouseLeave={() => {
                        setHoveredPoint(null);
                        setHoveredProduct(null);
                        setTooltipContent(null);
                      }}
                      onClick={() => onPointClick && onPointClick(data[i].key)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
          
          {/* X-axis label */}
          {xAxisLabel && (
            <div 
              style={{ 
                position: 'absolute',
                bottom: '5px',
                left: '50%',
                transform: 'translateX(-50%)',
                color: '#6b7280',
                fontSize: '12px'
              }}
            >
              {xAxisLabel}
            </div>
          )}
          
          {/* Tooltip */}
          {tooltipContent && (
            <div 
              style={{ 
                position: 'absolute',
                left: `${tooltipContent.x + 10}px`,
                top: `${tooltipContent.y - 10}px`,
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                color: '#111827',
                padding: '10px 14px',
                borderRadius: '6px',
                fontSize: '13px',
                pointerEvents: 'none',
                zIndex: 100,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                border: '1px solid #e5e7eb',
                minWidth: '150px',
                backdropFilter: 'blur(8px)'
              }}
              dangerouslySetInnerHTML={{ __html: tooltipContent.content }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
