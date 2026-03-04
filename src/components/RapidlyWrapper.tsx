'use client';

import { ThemeProvider, CssBaseline, Box, Container } from '@mui/material';
import { PropsWithChildren } from 'react';

import rapidlyTheme from '@/theme';
import { RapidlyHeader } from '@/components/RapidlyHeader';

export function RapidlyWrapper({ children }: PropsWithChildren) {
  return (
    <ThemeProvider theme={rapidlyTheme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <RapidlyHeader />
        
        {/* Main Content */}
        <Container maxWidth="lg" sx={{ flex: 1, py: 4 }}>
          {children}
        </Container>
      </Box>
    </ThemeProvider>
  );
}
