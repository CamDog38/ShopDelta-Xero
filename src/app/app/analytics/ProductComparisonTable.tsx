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

  return (
    <div className="product-comparison-container">
      <div className="product-comparison-header">
        <h4 className={styles.sectionTitle}>
          <span style={{ marginRight: '8px' }}>🏷️</span> 
          Product Comparison
        </h4>
        <div className="product-comparison-subtitle" style={{ color: '#a0aec0', marginBottom: '12px' }}>
          Comparing each product's performance between consecutive months in your selected period
        </div>
      </div>

      {/* Search control */}
      <div className="product-comparison-controls" style={{ marginBottom: '16px' }}>
        <input
          type="text"
          placeholder="Search products..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1px solid #e5e7eb',
            borderRadius: '4px',
            width: '100%',
            maxWidth: '300px',
            backgroundColor: '#1e1e1e',
            color: '#e5e7eb'
          }}
        />
      </div>

      {/* Table */}
      <div className="product-comparison-table" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: '#1a202c', borderRadius: '6px' }}>
          <thead>
            <tr style={{ backgroundColor: '#2d3748' }}>
              <th 
                onClick={() => handleSort('title')}
                style={{ 
                  textAlign: 'left', 
                  padding: '12px 16px', 
                  borderBottom: '1px solid #4a5568',
                  cursor: 'pointer'
                }}
              >
                Product {getSortIndicator('title')}
              </th>
              <th style={{ textAlign: 'center', padding: '12px 16px', borderBottom: '1px solid #4a5568' }}>
                Qty<br/>(Curr)
              </th>
              <th style={{ textAlign: 'center', padding: '12px 16px', borderBottom: '1px solid #4a5568' }}>
                Qty<br/>(Prev)
              </th>
              <th 
                onClick={() => handleSort('deltaQty')}
                style={{ 
                  textAlign: 'center', 
                  padding: '12px 16px', 
                  borderBottom: '1px solid #4a5568',
                  cursor: 'pointer'
                }}
              >
                Qty<br/>Δ {getSortIndicator('deltaQty')}
              </th>
              <th style={{ textAlign: 'center', padding: '12px 16px', borderBottom: '1px solid #4a5568' }}>
                Qty<br/>Δ%
              </th>
              <th style={{ textAlign: 'center', padding: '12px 16px', borderBottom: '1px solid #4a5568' }}>
                Sales<br/>(Curr)
              </th>
              <th style={{ textAlign: 'center', padding: '12px 16px', borderBottom: '1px solid #4a5568' }}>
                Sales<br/>(Prev)
              </th>
              <th 
                onClick={() => handleSort('deltaSales')}
                style={{ 
                  textAlign: 'center', 
                  padding: '12px 16px', 
                  borderBottom: '1px solid #4a5568',
                  cursor: 'pointer'
                }}
              >
                Sales<br/>Δ {getSortIndicator('deltaSales')}
              </th>
              <th style={{ textAlign: 'center', padding: '12px 16px', borderBottom: '1px solid #4a5568' }}>
                Sales<br/>Δ%
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedData.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '16px' }}>
                  No product comparison data available
                </td>
              </tr>
            ) : (
              filteredAndSortedData.map((product) => (
                <tr key={product.id} style={{ borderBottom: '1px solid #4a5568' }}>
                  <td style={{ padding: '12px 16px' }}>{product.title}</td>
                  <td style={{ textAlign: 'center', padding: '12px 16px' }}>{product.currQty}</td>
                  <td style={{ textAlign: 'center', padding: '12px 16px' }}>{product.prevQty}</td>
                  <td style={{ 
                    textAlign: 'center', 
                    padding: '12px 16px',
                    color: product.deltaQty > 0 ? '#48bb78' : product.deltaQty < 0 ? '#f56565' : undefined
                  }}>
                    {product.deltaQty}
                  </td>
                  <td style={{ textAlign: 'center', padding: '12px 16px' }}>
                    {formatPercent(product.deltaQtyPercent)}
                  </td>
                  <td style={{ textAlign: 'center', padding: '12px 16px' }}>
                    {fmtMoney(product.currSales)}
                  </td>
                  <td style={{ textAlign: 'center', padding: '12px 16px' }}>
                    {fmtMoney(product.prevSales)}
                  </td>
                  <td style={{ 
                    textAlign: 'center', 
                    padding: '12px 16px',
                    color: product.deltaSales > 0 ? '#48bb78' : product.deltaSales < 0 ? '#f56565' : undefined
                  }}>
                    {fmtMoney(product.deltaSales)}
                  </td>
                  <td style={{ textAlign: 'center', padding: '12px 16px' }}>
                    {formatPercent(product.deltaSalesPercent)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      <div style={{ marginTop: '12px', fontSize: '14px', color: '#a0aec0' }}>
        {periodLabel}
      </div>
    </div>
  );
}
