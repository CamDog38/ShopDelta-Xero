'use client';

import { useState, useMemo } from 'react';
import styles from '../page.module.css';

type ProductComparisonData = {
  id: string;
  title: string;
  currQty: number;
  prevQty: number;
  currSales: number;
  prevSales: number;
};

type ProductComparisonProps = {
  data: ProductComparisonData[];
  currency: string;
  periodLabel: string;
};

export function ProductComparisonTable({ data, currency, periodLabel }: ProductComparisonProps) {
  const [sortField, setSortField] = useState<'title' | 'deltaQty' | 'deltaSales'>('deltaSales');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Format money with currency
  const fmtMoney = (amount: number) => {
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency, 
      minimumFractionDigits: 2,
      maximumFractionDigits: 2 
    }).format(amount);
  };

  // Calculate deltas and percentages
  const processedData = useMemo(() => {
    return data.map(item => {
      const deltaQty = item.currQty - item.prevQty;
      const deltaSales = item.currSales - item.prevSales;
      
      // Calculate percentages, handling division by zero
      const deltaQtyPercent = item.prevQty === 0 
        ? null 
        : ((deltaQty / item.prevQty) * 100);
      
      const deltaSalesPercent = item.prevSales === 0 
        ? null 
        : ((deltaSales / item.prevSales) * 100);
      
      return {
        ...item,
        deltaQty,
        deltaSales,
        deltaQtyPercent,
        deltaSalesPercent
      };
    });
  }, [data]);

  // Filter and sort data
  const filteredAndSortedData = useMemo(() => {
    return [...processedData]
      .filter(item => 
        item.title.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => {
        if (sortField === 'title') {
          return sortDirection === 'asc' 
            ? a.title.localeCompare(b.title)
            : b.title.localeCompare(a.title);
        } else {
          const aValue = a[sortField];
          const bValue = b[sortField];
          
          // Handle null values in sorting
          if (aValue === null && bValue === null) return 0;
          if (aValue === null) return sortDirection === 'asc' ? -1 : 1;
          if (bValue === null) return sortDirection === 'asc' ? 1 : -1;
          
          return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
        }
      });
  }, [processedData, searchTerm, sortField, sortDirection]);

  // Toggle sorting
  const handleSort = (field: 'title' | 'deltaQty' | 'deltaSales') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Get sort indicator
  const getSortIndicator = (field: 'title' | 'deltaQty' | 'deltaSales') => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? '▲' : '▼';
  };

  // Format percentage
  const formatPercent = (value: number | null) => {
    if (value === null) return '-';
    return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
  };
  
  // Get color for delta values
  const getDeltaColor = (value: number) => {
    if (value > 0) return '#16a34a'; // Green for positive
    if (value < 0) return '#dc2626'; // Red for negative
    return undefined; // Default color for zero
  };

  return (
    <div className="enhanced-table">
      <h4 className={styles.sectionTitle}>
        <span style={{ marginRight: '8px' }}>🏷️</span>
        Product Comparison
      </h4>
      <div className="enhanced-table-subtitle">
        Comparing each product's performance between consecutive months in your selected period
      </div>

      {/* Controls to match EnhancedTable */}
      <div className="enhanced-table-controls">
        <div className="enhanced-table-search">
          <input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="enhanced-table-search-input"
          />
        </div>
      </div>

      {/* Table wrapper with horizontal scroll */}
      <div className="enhanced-table-wrapper" style={{ overflowX: 'auto' }}>
        <table className="enhanced-table-table" style={{ minWidth: '900px' }}>
          <thead>
            <tr>
              <th
                className={`enhanced-table-header enhanced-table-sortable`}
                onClick={() => handleSort('title')}
                style={{ textAlign: 'left', minWidth: '180px' }}
              >
                <div className="enhanced-table-header-content">
                  <span>Product</span>
                  <span className="enhanced-table-sort-indicator">{getSortIndicator('title')}</span>
                </div>
              </th>
              <th className="enhanced-table-header" style={{ textAlign: 'center', minWidth: '80px' }}>Qty<br/>(Curr)</th>
              <th className="enhanced-table-header" style={{ textAlign: 'center', minWidth: '80px' }}>Qty<br/>(Prev)</th>
              <th
                className={`enhanced-table-header enhanced-table-sortable`}
                onClick={() => handleSort('deltaQty')}
                style={{ textAlign: 'center', minWidth: '80px' }}
              >
                <div className="enhanced-table-header-content">
                  <span>Qty<br/>Δ</span>
                  <span className="enhanced-table-sort-indicator">{getSortIndicator('deltaQty')}</span>
                </div>
              </th>
              <th className="enhanced-table-header" style={{ textAlign: 'center', minWidth: '80px' }}>Qty<br/>Δ%</th>
              <th className="enhanced-table-header" style={{ textAlign: 'center', minWidth: '100px' }}>Sales<br/>(Curr)</th>
              <th className="enhanced-table-header" style={{ textAlign: 'center', minWidth: '100px' }}>Sales<br/>(Prev)</th>
              <th
                className={`enhanced-table-header enhanced-table-sortable`}
                onClick={() => handleSort('deltaSales')}
                style={{ textAlign: 'center', minWidth: '100px' }}
              >
                <div className="enhanced-table-header-content">
                  <span>Sales<br/>Δ</span>
                  <span className="enhanced-table-sort-indicator">{getSortIndicator('deltaSales')}</span>
                </div>
              </th>
              <th className="enhanced-table-header" style={{ textAlign: 'center', minWidth: '80px' }}>Sales<br/>Δ%</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedData.length === 0 ? (
              <tr>
                <td colSpan={9} className="enhanced-table-empty">
                  No product comparison data available
                </td>
              </tr>
            ) : (
              filteredAndSortedData.map((product, index) => (
                <tr
                  key={product.id}
                  className={index % 2 === 0 ? 'enhanced-table-row-even' : 'enhanced-table-row-odd'}
                >
                  <td className="enhanced-table-cell" style={{ textAlign: 'left' }}>{product.title}</td>
                  <td className="enhanced-table-cell" style={{ textAlign: 'center' }}>{product.currQty}</td>
                  <td className="enhanced-table-cell" style={{ textAlign: 'center' }}>{product.prevQty}</td>
                  <td
                    className="enhanced-table-cell"
                    style={{
                      textAlign: 'center',
                      color: getDeltaColor(product.deltaQty),
                      fontWeight: product.deltaQty !== 0 ? 600 : undefined
                    }}
                  >
                    {product.deltaQty}
                  </td>
                  <td 
                    className="enhanced-table-cell" 
                    style={{ 
                      textAlign: 'center',
                      color: product.deltaQtyPercent ? getDeltaColor(product.deltaQtyPercent) : undefined
                    }}
                  >
                    {formatPercent(product.deltaQtyPercent)}
                  </td>
                  <td className="enhanced-table-cell" style={{ textAlign: 'center' }}>{fmtMoney(product.currSales)}</td>
                  <td className="enhanced-table-cell" style={{ textAlign: 'center' }}>{fmtMoney(product.prevSales)}</td>
                  <td
                    className="enhanced-table-cell"
                    style={{
                      textAlign: 'center',
                      color: getDeltaColor(product.deltaSales),
                      fontWeight: product.deltaSales !== 0 ? 600 : undefined
                    }}
                  >
                    {fmtMoney(product.deltaSales)}
                  </td>
                  <td 
                    className="enhanced-table-cell" 
                    style={{ 
                      textAlign: 'center',
                      color: product.deltaSalesPercent ? getDeltaColor(product.deltaSalesPercent) : undefined
                    }}
                  >
                    {formatPercent(product.deltaSalesPercent)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="enhanced-table-footer">
        Showing {filteredAndSortedData.length} of {data.length} products
      </div>
      <div className="enhanced-table-subtitle" style={{ marginTop: '4px' }}>{periodLabel}</div>
    </div>
  );
}
