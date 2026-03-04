'use client';

import { Breadcrumbs, Link, Typography } from '@mui/material';

interface BreadcrumbProps {
  items: string[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <Breadcrumbs
      separator="›"
      sx={{ mb: 1, fontSize: 12, color: 'text.secondary' }}
    >
      {items.map((item, i) =>
        i < items.length - 1 ? (
          <Link key={i} href="#" underline="hover" color="text.secondary" sx={{ fontSize: 12 }}>
            {item}
          </Link>
        ) : (
          <Typography key={i} color="text.secondary" sx={{ fontSize: 12 }}>
            {item}
          </Typography>
        )
      )}
    </Breadcrumbs>
  );
}
