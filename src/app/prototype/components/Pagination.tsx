'use client';

import { Box, IconButton, Typography } from '@mui/material';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';

interface PaginationProps {
  total: number;
  rowsPerPage?: number;
  page?: number;
  onPageChange?: (page: number) => void;
}

export function Pagination({ total, rowsPerPage = 25, page = 1, onPageChange }: PaginationProps) {
  const pageStart = (page - 1) * rowsPerPage + 1;
  const pageEnd = Math.min(page * rowsPerPage, total);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 1,
        py: 1,
        color: 'text.secondary',
        fontSize: 12,
      }}
    >
      <Typography variant="body2" color="text.secondary">
        Rows per page: {rowsPerPage}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {pageStart}-{pageEnd} of {total}
      </Typography>
      <IconButton
        size="small"
        onClick={() => onPageChange?.(page - 1)}
        disabled={page <= 1}
        sx={{ color: 'inherit' }}
      >
        <ChevronLeft fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        onClick={() => onPageChange?.(page + 1)}
        disabled={page * rowsPerPage >= total}
        sx={{ color: 'inherit' }}
      >
        <ChevronRight fontSize="small" />
      </IconButton>
    </Box>
  );
}
