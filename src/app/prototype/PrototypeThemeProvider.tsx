'use client';

import { ThemeProvider, CssBaseline, Box } from '@mui/material';
import { prototypeTheme } from './prototypeTheme';
import { createMuiThemeFromUiTheme } from './themeFactory';
import type { UiTheme } from '@/lib/themeDetection';

/**
 * MUI theme provider for prototype.
 * When theme is provided, uses document-driven theme from detectTheme.
 * When not provided, falls back to default enterprise dark theme (prototypeTheme).
 * Full-viewport overlay so prototype isn't constrained by app layout.
 */
export function PrototypeThemeProvider({
  children,
  theme: uiTheme,
}: {
  children: React.ReactNode;
  theme?: UiTheme;
}) {
  const theme = uiTheme ? createMuiThemeFromUiTheme(uiTheme) : prototypeTheme;
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: 'flex',
          bgcolor: 'background.default',
          color: 'text.primary',
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}
      >
        {children}
      </Box>
    </ThemeProvider>
  );
}
