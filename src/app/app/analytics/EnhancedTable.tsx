'use client';

import { useState, useMemo, useCallback, ReactNode } from 'react';
import styles from '../page.module.css';

type ColumnDefinition<T> = {
  id: string;
  header: string;
  accessorKey: keyof T & string; // key in the row to display
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string;
  format?: 'string' | 'number' | 'money';
};

type EnhancedTableProps<T> = {
  data: T[];
  columns: ColumnDefinition<T>[];
  keyField: keyof T;
  title?: string;
  subtitle?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  maxHeight?: string;
  currency?: string;
};

export function EnhancedTable<T extends Record<string, any>>({
  data,
  columns,
  keyField,
  title,
  subtitle,
  searchPlaceholder = 'Search...',
  emptyMessage = 'No data available',
  maxHeight = '500px',
  currency,
}: EnhancedTableProps<T>) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    columns.reduce((acc, col) => ({ ...acc, [col.id]: true }), {})
  );

  // Handle search
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  // Handle column filter
  const handleColumnFilter = (columnId: string, value: string) => {
    setColumnFilters(prev => ({
      ...prev,
      [columnId]: value
    }));
  };

  // Toggle column visibility
  const toggleColumnVisibility = (columnId: string) => {
    setVisibleColumns(prev => ({
      ...prev,
      [columnId]: !prev[columnId]
    }));
  };

  // Handle sort
  const handleSort = (columnId: string) => {
    const column = columns.find(col => col.id === columnId);
    if (!column?.sortable) return;

    if (sortField === columnId) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(columnId);
      setSortDirection('asc');
    }
  };

  // Get sort indicator
  const getSortIndicator = (columnId: string) => {
    if (sortField !== columnId) return null;
    return sortDirection === 'asc' ? '▲' : '▼';
  };

  // Filter and sort data
  const filteredAndSortedData = useMemo(() => {
    // First apply search filter across all visible columns
    let filtered = data;
    
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(row => {
        return columns.some(column => {
          if (!visibleColumns[column.id]) return false;
          const value = row[column.accessorKey];
          return String(value).toLowerCase().includes(searchLower);
        });
      });
    }
    
    // Then apply column-specific filters
    Object.entries(columnFilters).forEach(([columnId, filterValue]) => {
      if (!filterValue) return;
      
      const column = columns.find(col => col.id === columnId);
      if (!column) return;
      
      const filterLower = filterValue.toLowerCase();
      filtered = filtered.filter(row => {
        const value = row[column.accessorKey];
        return String(value).toLowerCase().includes(filterLower);
      });
    });
    
    // Then sort
    if (sortField) {
      const column = columns.find(col => col.id === sortField);
      if (column) {
        filtered = [...filtered].sort((a, b) => {
          const aValue = a[column.accessorKey];
          const bValue = b[column.accessorKey];
          
          // Handle different types of values
          if (typeof aValue === 'number' && typeof bValue === 'number') {
            return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
          }
          
          const aString = String(aValue).toLowerCase();
          const bString = String(bValue).toLowerCase();
          
          return sortDirection === 'asc' 
            ? aString.localeCompare(bString)
            : bString.localeCompare(aString);
        });
      }
    }
    
    return filtered;
  }, [data, columns, searchTerm, sortField, sortDirection, columnFilters, visibleColumns]);

  return (
    <div className="enhanced-table">
      {title && <h4 className={styles.sectionTitle}>{title}</h4>}
      {subtitle && <div className="enhanced-table-subtitle">{subtitle}</div>}
      
      <div className="enhanced-table-controls">
        {/* Search */}
        <div className="enhanced-table-search">
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={handleSearch}
            className="enhanced-table-search-input"
          />
        </div>
        
        {/* Column visibility toggle */}
        <div className="enhanced-table-column-toggle">
          <div className="enhanced-table-column-toggle-dropdown">
            <button className="enhanced-table-column-toggle-button">
              Columns ▼
            </button>
            <div className="enhanced-table-column-toggle-menu">
              {columns.map(column => (
                <label key={column.id} className="enhanced-table-column-toggle-item">
                  <input
                    type="checkbox"
                    checked={visibleColumns[column.id]}
                    onChange={() => toggleColumnVisibility(column.id)}
                  />
                  {column.header}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      {/* Table with horizontal and vertical scroll */}
      <div className="enhanced-table-wrapper" style={{ maxHeight, overflowX: 'auto', width: '100%' }}>
        <table className="enhanced-table-table" style={{ minWidth: 'max-content', width: '100%' }}>
          <thead>
            <tr>
              {columns.map(column => (
                visibleColumns[column.id] && (
                  <th 
                    key={column.id}
                    className={`enhanced-table-header ${column.sortable ? 'enhanced-table-sortable' : ''}`}
                    style={{ 
                      textAlign: column.align || 'left',
                      width: column.width || 'auto'
                    }}
                    onClick={() => column.sortable && handleSort(column.id)}
                  >
                    <div className="enhanced-table-header-content">
                      <span>{column.header}</span>
                      {column.sortable && (
                        <span className="enhanced-table-sort-indicator">
                          {getSortIndicator(column.id)}
                        </span>
                      )}
                    </div>
                    {/* Column filter */}
                    <div className="enhanced-table-column-filter">
                      <input
                        type="text"
                        placeholder="Filter"
                        value={columnFilters[column.id] || ''}
                        onChange={(e) => handleColumnFilter(column.id, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="enhanced-table-column-filter-input"
                      />
                    </div>
                  </th>
                )
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedData.length === 0 ? (
              <tr>
                <td colSpan={columns.filter(col => visibleColumns[col.id]).length} className="enhanced-table-empty">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              filteredAndSortedData.map((row, index) => (
                <tr 
                  key={String(row[keyField])} 
                  className={`enhanced-table-row ${index % 2 === 0 ? 'enhanced-table-row-even' : 'enhanced-table-row-odd'}`}
                >
                  {columns.map(column => (
                    visibleColumns[column.id] && (
                      <td 
                        key={column.id}
                        style={{ textAlign: column.align || 'left' }}
                        className="enhanced-table-cell"
                      >
                        {(() => {
                          const raw = row[column.accessorKey];
                          if (column.format === 'money' && typeof raw === 'number' && currency) {
                            return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(raw);
                          }
                          return String(raw ?? '');
                        })()}
                      </td>
                    )
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      <div className="enhanced-table-footer">
        Showing {filteredAndSortedData.length} of {data.length} entries
      </div>
    </div>
  );
}
