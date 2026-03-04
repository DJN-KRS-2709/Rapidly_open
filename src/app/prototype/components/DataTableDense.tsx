'use client';

import { useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Chip,
} from '@mui/material';

interface StatusPill {
  variant: string;
  label: string;
}

function isStatusPill(v: unknown): v is StatusPill {
  return v != null && typeof v === 'object' && 'variant' in (v as object) && 'label' in (v as object);
}

interface DataTableDenseProps {
  columns: string[];
  columnKeys?: string[];
  rows: Record<string, unknown>[];
  sortable?: number[];
  filter?: string;
  onRowClick?: (row: Record<string, unknown>, index: number) => void;
}

const CHIP_STYLES: Record<string, { bg: string; color: string }> = {
  done: { bg: 'rgba(35, 134, 54, 0.2)', color: '#3fb950' },
  injected: { bg: 'rgba(35, 134, 54, 0.2)', color: '#3fb950' },
  signed: { bg: 'rgba(35, 134, 54, 0.2)', color: '#3fb950' },
  failed: { bg: 'rgba(248, 81, 73, 0.2)', color: '#f85149' },
  rejected: { bg: 'rgba(248, 81, 73, 0.2)', color: '#f85149' },
  prog: { bg: '#1f6feb', color: '#fff' },
  pend: { bg: '#21262d', color: '#8b949e' },
  prepared: { bg: 'rgba(31, 111, 235, 0.2)', color: '#58a6ff' },
};

export function DataTableDense({ columns, columnKeys, rows, sortable = [], filter = '', onRowClick }: DataTableDenseProps) {
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const cellKeys = columnKeys ?? (rows.length > 0 ? Object.keys(rows[0]!) : []);
  const sortableSet = new Set(sortable);

  const sortedRows = useMemo(() => {
    if (sortCol == null) return rows;
    return [...rows].sort((a, b) => {
      const va = String(a[cellKeys[sortCol] ?? ''] ?? '').trim();
      const vb = String(b[cellKeys[sortCol] ?? ''] ?? '').trim();
      const cmp = va.localeCompare(vb, 'en', { numeric: true });
      return sortAsc ? cmp : -cmp;
    });
  }, [rows, sortCol, sortAsc, cellKeys]);

  const filteredRows = useMemo(() => {
    const q = (filter ?? '').trim().toLowerCase();
    if (!q) return sortedRows;
    return sortedRows.filter((r) =>
      Object.values(r).some((v) => String(v).toLowerCase().includes(q))
    );
  }, [sortedRows, filter]);

  const handleSort = (colIdx: number) => {
    if (!sortableSet.has(colIdx)) return;
    setSortAsc(sortCol === colIdx ? !sortAsc : true);
    setSortCol(colIdx);
  };

  const renderCell = (row: Record<string, unknown>, key: string) => {
    const v = row[key];
    if (isStatusPill(v)) {
      const chipStyle = CHIP_STYLES[v.variant] ?? CHIP_STYLES.pend;
      return (
        <Chip
          label={v.label}
          size="small"
          sx={{
            height: 20,
            fontSize: 11,
            fontWeight: 600,
            backgroundColor: chipStyle?.bg,
            color: chipStyle?.color,
          }}
        />
      );
    }
    return String(v ?? '—');
  };

  return (
    <>
      <TableContainer>
        <Table size="small" sx={{ minWidth: 500 }}>
          <TableHead>
            <TableRow>
              {columns.map((col, i) => (
                <TableCell key={col} sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {sortableSet.has(i) ? (
                    <TableSortLabel
                      active={sortCol === i}
                      direction={sortCol === i ? (sortAsc ? 'asc' : 'desc') : 'asc'}
                      onClick={() => handleSort(i)}
                    >
                      {col}
                    </TableSortLabel>
                  ) : (
                    col
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredRows.map((row, idx) => (
              <TableRow
                key={idx}
                hover
                onClick={() => onRowClick?.(row, idx)}
                sx={{
                  cursor: onRowClick ? 'pointer' : 'default',
                }}
              >
                {cellKeys.map((k) => (
                  <TableCell key={k}>{renderCell(row, k)}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
}
