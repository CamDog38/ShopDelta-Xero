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

type StackedBarChartProps = {
  data: DataPoint[];
  title?: string;
  yAxisLabel?: string;
  xAxisLabel?: string;
  height?: number;
  formatValue?: (value: number) => string;
  formatType?: 'money' | 'number' | 'string';
  currency?: string;
  onBarClick?: (key: string) => void;
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

export function StackedBarChart({
  data,
  title,
  yAxisLabel,
  xAxisLabel,
  height = 400,
  formatValue,
  formatType = 'number',
  currency,
  onBarClick
}: StackedBarChartProps) {
  const [hoveredBar, setHoveredBar] = useState<string | null>(null);
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
    ...data.map(d => 
      d.products
        .filter(p => visibleProducts[p.id])
        .reduce((sum, p) => sum + p.value, 0)
    )
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
    setHoveredBar(null);
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
  const formatTooltipContent = (product: { id: string; title: string; value: number }, periodLabel: string) => {
    const valueFormatted = formatValueWithCurrency(product.value);
    return (
      `<div style="font-weight: bold; margin-bottom: 4px;">${product.title}</div>
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
  
  return (
    <div className="stacked-bar-chart-container">
      {title && <h4 className={styles.sectionTitle}>{title}</h4>}
      
      <div className="stacked-bar-legend" style={{ marginBottom: '16px' }}>
        <h4 style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>Legend:</h4>
        <div className="stacked-bar-legend-items" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {allProductIds.map(id => {
            const product = data.flatMap(d => d.products).find(p => p.id === id);
            if (!product) return null;
            
            return (
              <div 
                key={id}
                className="stacked-bar-legend-item"
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
                  className="stacked-bar-legend-color" 
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
      
      <div className="stacked-bar-filter" style={{ marginBottom: '16px' }}>
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
        backgroundColor: '#ffffff',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
      }}>
      <div 
        className="stacked-bar-chart" 
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
          className="stacked-bar-y-axis" 
          style={{ 
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: '40px',
              width: '70px',
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
        
        {/* Chart area */}
        <div 
          className="stacked-bar-chart-area" 
          style={{ 
              position: 'absolute',
              left: '80px',
              right: '20px',
              top: 0,
              bottom: '40px',
              borderLeft: '1px solid #d1d5db',
              borderBottom: '1px solid #d1d5db',
              backgroundColor: '#f9fafb',
              borderRadius: '4px'
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
          
          {data.map((d, i) => {
            const visibleProductsData = d.products.filter(p => visibleProducts[p.id]);
            const total = visibleProductsData.reduce((sum, p) => sum + p.value, 0);
            const barHeight = total > 0 ? (total / yAxisMax) * 100 : 0;
            
            let accumulatedHeight = 0;
            
            return (
              <div 
                key={d.key}
                className="stacked-bar-column"
                style={{
                  position: 'absolute',
                  left: `${(i / data.length) * 100}%`,
                  width: `${100 / data.length}%`,
                  bottom: 0,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column-reverse',
                  alignItems: 'center',
                  justifyContent: 'flex-start'
                }}
                onMouseEnter={() => setHoveredBar(d.key)}
                onMouseLeave={() => setHoveredBar(null)}
                onClick={() => onBarClick && onBarClick(d.key)}
              >
                {/* Bar segments */}
                {visibleProductsData.map(product => {
                  const segmentHeight = (product.value / yAxisMax) * 100;
                  const currentAccumulatedHeight = accumulatedHeight;
                  accumulatedHeight += segmentHeight;
                  
                  return (
                    <div
                      key={product.id}
                      className="stacked-bar-segment"
                      style={{
                        width: '80%',
                        height: `${segmentHeight}%`,
                        backgroundColor: productColors[product.id],
                        position: 'absolute',
                        bottom: `${currentAccumulatedHeight}%`,
                        left: '10%',
                        transition: 'all 0.3s ease',
                        opacity: hoveredProduct === product.id || !hoveredProduct ? 1 : 0.5,
                        transform: hoveredProduct === product.id ? 'scaleX(1.05)' : 'scaleX(1)',
                        cursor: 'pointer',
                        zIndex: hoveredProduct === product.id ? 10 : 1
                      }}
                      onMouseEnter={(e) => {
                        setHoveredProduct(product.id);
                        setTooltipContent({
                          x: e.clientX - (chartRef.current?.getBoundingClientRect().left || 0),
                          y: e.clientY - (chartRef.current?.getBoundingClientRect().top || 0),
                          content: formatTooltipContent(product, d.label)
                        });
                      }}
                      onMouseMove={handleMouseMove}
                      onMouseLeave={() => {
                        setHoveredProduct(null);
                        setTooltipContent(null);
                      }}
                    />
                  );
                })}
                
                {/* X-axis label */}
                <div 
                  style={{ 
                    position: 'absolute',
                    bottom: '-30px',
                    fontSize: '12px',
                    color: '#6b7280',
                    textAlign: 'center',
                    width: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {d.label}
                </div>
                
                {/* Bar total value */}
                {hoveredBar === d.key && total > 0 && (
                  <div 
                    style={{ 
                      position: 'absolute',
                      bottom: `${barHeight}%`,
                      fontSize: '12px',
                      fontWeight: 'bold',
                      color: '#111827',
                      backgroundColor: 'rgba(255, 255, 255, 0.9)',
                      borderRadius: '4px',
                      textAlign: 'center',
                      width: '100%',
                      transform: 'translateY(-100%)',
                      padding: '4px'
                    }}
                  >
                    {formatValueWithCurrency(total)}
                  </div>
                )}
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
              backgroundColor: '#ffffff',
              color: '#111827',
              padding: '12px 16px',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              pointerEvents: 'none',
              zIndex: 1000,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)',
              border: '1px solid #d1d5db',
              minWidth: '180px',
              maxWidth: '300px',
              lineHeight: '1.4'
            }}
            dangerouslySetInnerHTML={{ __html: tooltipContent.content }}
          />
        )}
      </div>
      </div>
    </div>
  );
}
