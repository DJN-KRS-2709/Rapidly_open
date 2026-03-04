'use client';

import { Box, Typography, IconButton, Chip } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';

interface TopBarProps {
  title: string;
  subtitle?: string;
  badge?: string;
}

export function TopBar({ title, subtitle, badge = 'Music' }: TopBarProps) {
  return (
    <Box sx={{ pb: 1.5, borderBottom: 1, borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="h1" component="h1" sx={{ fontSize: 20, fontWeight: 600 }}>
          {title}
        </Typography>
        <IconButton size="small" sx={{ opacity: 0.5 }} aria-label="Edit">
          <EditIcon sx={{ fontSize: 18 }} />
        </IconButton>
        <Chip
          label={badge}
          size="small"
          color="primary"
          sx={{ height: 22, fontSize: 11, fontWeight: 600 }}
        />
      </Box>
      {subtitle && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {subtitle}
        </Typography>
      )}
    </Box>
  );
}
