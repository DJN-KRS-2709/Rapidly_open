'use client';

import { createTheme, type Theme } from '@mui/material/styles';
import type { UiTheme } from '@/lib/themeDetection';

/**
 * Maps any UiTheme (from detectTheme) to an MUI Theme.
 * Supports all 50+ themes without per-theme files.
 */
export function createMuiThemeFromUiTheme(uiTheme: UiTheme): Theme {
  const baseTheme = createTheme({
    palette: {
      mode: uiTheme.isDark ? 'dark' : 'light',
      primary: { main: uiTheme.primary },
      secondary: { main: uiTheme.secondary },
      background: {
        default: uiTheme.background,
        paper: uiTheme.surface,
      },
      text: {
        primary: uiTheme.text,
        secondary: uiTheme.textSecondary,
      },
    },
    typography: {
      fontFamily: "'DM Sans', system-ui, sans-serif",
      h1: { fontSize: 20, fontWeight: 600 },
      h2: { fontSize: 16, fontWeight: 700 },
      body1: { fontSize: 13 },
      body2: { fontSize: 12 },
      caption: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
    },
    shape: { borderRadius: 8 },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { backgroundColor: uiTheme.background },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: getSidebarColor(uiTheme),
            borderRight: `1px solid ${uiTheme.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}`,
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: { textTransform: 'none', fontWeight: 500 },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: { color: uiTheme.textSecondary },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 600, fontSize: 11 },
          colorPrimary: {
            backgroundColor: `${uiTheme.primary}26`,
            color: uiTheme.primary,
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              backgroundColor: uiTheme.isDark ? uiTheme.background : uiTheme.surface,
              borderRadius: 6,
              '& fieldset': {
                borderColor: uiTheme.isDark ? 'rgba(255,255,255,0.23)' : 'rgba(0,0,0,0.23)',
              },
              '&:hover fieldset': {
                borderColor: uiTheme.isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
              },
            },
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          indicator: { backgroundColor: uiTheme.primary },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: { textTransform: 'uppercase', fontSize: 13, fontWeight: 500 },
        },
      },
      MuiTableHead: {
        styleOverrides: {
          root: {
            '& th': {
              backgroundColor: 'transparent',
              color: uiTheme.textSecondary,
              fontSize: 11,
              fontWeight: 600,
            },
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderBottom: `1px solid ${uiTheme.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}`,
            color: uiTheme.text,
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            '&:hover': {
              backgroundColor: uiTheme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
            },
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            backgroundColor: uiTheme.surface,
            border: `1px solid ${uiTheme.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}`,
          },
        },
      },
    },
  });

  return baseTheme;
}

/** Layout-specific sidebar color for Design Component themes. */
function getSidebarColor(uiTheme: UiTheme): string {
  return uiTheme.surface;
}
