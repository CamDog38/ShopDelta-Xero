'use client';

import { useState, useMemo, useCallback } from 'react';
import styles from '../page.module.css';

type ProductData = {
  id: string;
  title: string;
  qty: number;
  sales: number;
};

type ProductTableProps = {
  data: ProductData[];
  currency: string;
};

export function ProductTable({ data, currency }: ProductTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<'title' | 'qty' | 'sales'>('sales');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  
  // Format money with currency
  const fmtMoney = useCallback((amount: number) => {
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency, 
      minimumFractionDigits: 2,
      maximumFractionDigits: 2 
    }).format(amount);
  }, [currency]);

  // Filter and sort data
  const filteredAndSortedData = useMemo(() => {
    return [...data]
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
          return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
        }
      });
  }, [data, searchTerm, sortField, sortDirection]);

  // Toggle sorting
  const handleSort = (field: 'title' | 'qty' | 'sales') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Toggle row expansion
  const toggleRow = (id: string) => {
    setExpandedRows(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Get sort indicator
  const getSortIndicator = (field: 'title' | 'qty' | 'sales') => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? '▲' : '▼';
  };

  return (
    <div className="product-table-container">
      {/* Search and filter controls */}
      <div className="product-table-controls" style={{ marginBottom: '16px' }}>
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
        <div style={{ marginTop: '8px', fontSize: '14px', color: '#a0aec0' }}>
          {filteredAndSortedData.length} products • {filteredAndSortedData.reduce((sum, p) => sum + p.qty, 0)} total quantity
        </div>
      </div>

      {/* Accordion table */}
      <div className="product-table-accordion" style={{ border: '1px solid #2d3748', borderRadius: '6px', overflow: 'hidden' }}>
        {/* Table header */}
        <div className="product-table-header" style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 100px 150px',
          padding: '12px 16px',
          backgroundColor: '#2d3748',
          fontWeight: 'bold',
          borderBottom: '1px solid #4a5568'
        }}>
          <div onClick={() => handleSort('title')} style={{ cursor: 'pointer' }}>
            Product {getSortIndicator('title')}
          </div>
          <div onClick={() => handleSort('qty')} style={{ cursor: 'pointer', textAlign: 'right' }}>
            Qty {getSortIndicator('qty')}
          </div>
          <div onClick={() => handleSort('sales')} style={{ cursor: 'pointer', textAlign: 'right' }}>
            Sales {getSortIndicator('sales')}
          </div>
        </div>

        {/* Table body */}
        {filteredAndSortedData.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: '#a0aec0' }}>
            No products found
          </div>
        ) : (
          filteredAndSortedData.map(product => (
            <div key={product.id} className="product-row-container">
              {/* Main row (always visible) */}
              <div 
                className="product-row" 
                onClick={() => toggleRow(product.id)}
                style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '1fr 100px 150px',
                  padding: '12px 16px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #4a5568',
                  backgroundColor: expandedRows[product.id] ? '#1a202c' : 'transparent',
                  transition: 'background-color 0.2s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ marginRight: '8px' }}>
                    {expandedRows[product.id] ? '▼' : '▶'}
                  </span>
                  {product.title}
                </div>
                <div style={{ textAlign: 'right' }}>{product.qty}</div>
                <div style={{ textAlign: 'right' }}>{fmtMoney(product.sales)}</div>
              </div>

              {/* Expanded details (conditionally visible) */}
              {expandedRows[product.id] && (
                <div className="product-details" style={{ 
                  padding: '16px', 
                  backgroundColor: '#1a202c',
                  borderBottom: '1px solid #4a5568'
                }}>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Product ID:</strong> {product.id}
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Average price:</strong> {fmtMoney(product.sales / product.qty)}
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Percentage of total:</strong> {((product.sales / data.reduce((sum, p) => sum + p.sales, 0)) * 100).toFixed(1)}%
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
