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
  formatValue = (v) => v.toString(),
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
    if (currency) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(value);
    }
    return formatValue(value);
  };
  
  // Calculate chart dimensions
  const chartWidth = data.length * 80; // Each data point gets 80px width
  const minWidth = Math.max(chartWidth, 600); // Minimum width to ensure visibility
  
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
        <div className="line-chart-legend-items" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
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
                  padding: '4px 8px',
                  borderRadius: '4px',
                  backgroundColor: hoveredProduct === id ? 'rgba(255,255,255,0.1)' : 'transparent'
                }}
                onClick={() => toggleProductVisibility(id)}
                onMouseEnter={() => setHoveredProduct(id)}
                onMouseLeave={() => setHoveredProduct(null)}
              >
                <div 
                  className="line-chart-legend-color" 
                  style={{ 
                    width: '12px', 
                    height: '12px', 
                    backgroundColor: productColors[id],
                    borderRadius: '2px',
                    marginRight: '8px'
                  }} 
                />
                <span>{product.title}</span>
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
              backgroundColor: '#1e1e1e',
              color: '#e5e7eb',
              border: '1px solid #4a5568',
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
      
      <div className="line-chart-scroll-container" style={{ overflowX: 'auto', overflowY: 'hidden' }}>
        <div 
          className="line-chart" 
          style={{ 
            position: 'relative',
            height: `${height}px`,
            width: `${minWidth}px`,
            marginBottom: '40px'
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
              width: '50px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              paddingRight: '10px',
              color: '#a0aec0',
              fontSize: '12px'
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
                color: '#a0aec0',
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
              left: '60px',
              right: '20px',
              top: 0,
              bottom: '40px',
              borderLeft: '1px solid #4a5568',
              borderBottom: '1px solid #4a5568',
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
                  borderTop: '1px dashed rgba(74, 85, 104, 0.3)',
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
                  color: '#a0aec0',
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
                      strokeWidth={isHighlighted ? 3 : 2}
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
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        backgroundColor: series.color,
                        border: '2px solid #1a202c',
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
                          content: `${series.title}: ${formatValueWithCurrency(point.value)} (${point.label})`
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
                color: '#a0aec0',
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
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                color: '#fff',
                padding: '8px 12px',
                borderRadius: '4px',
                fontSize: '12px',
                pointerEvents: 'none',
                zIndex: 100,
                whiteSpace: 'nowrap'
              }}
            >
              {tooltipContent.content}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
