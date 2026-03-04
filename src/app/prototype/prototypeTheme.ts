'use client';

import { createTheme } from '@mui/material/styles';

/**
 * Enterprise dark design tokens as MUI theme.
 */
export const prototypeTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#4a9eff' },
    success: { main: '#3fb950' },
    error: { main: '#f85149' },
    warning: { main: '#d29922' },
    background: {
      default: '#0a0a1a',
      paper: '#141428',
    },
    text: {
      primary: '#f0f6fc',
      secondary: '#8b949e',
      disabled: '#484f58',
    },
    divider: '#21262d',
    action: {
      hover: 'rgba(22, 27, 34, 0.5)',
      selected: '#161b22',
    },
  },
  typography: {
    fontFamily: "'DM Sans', system-ui, sans-serif",
    h1: { fontSize: 20, fontWeight: 600, color: '#f0f6fc' },
    h2: { fontSize: 16, fontWeight: 700, color: '#ffffff' },
    body1: { fontSize: 13, color: '#c9d1d9' },
    body2: { fontSize: 12, color: '#8b949e' },
    caption: { fontSize: 11, color: '#484f58', textTransform: 'uppercase', letterSpacing: 0.5 },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: '#0a0a1a' },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#1a1a2e',
          borderRight: '1px solid #21262d',
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
        root: { color: '#8b949e' },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, fontSize: 11 },
        colorPrimary: { backgroundColor: 'rgba(74, 158, 255, 0.15)', color: '#4a9eff' },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backgroundColor: '#0d1117',
            borderRadius: 6,
            '& fieldset': { borderColor: '#30363d' },
            '&:hover fieldset': { borderColor: '#484f58' },
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: { backgroundColor: '#4a9eff' },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: { textTransform: 'uppercase', fontSize: 13, fontWeight: 500 },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: { '& th': { backgroundColor: 'transparent', color: '#484f58', fontSize: 11, fontWeight: 600 } },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderBottom: '1px solid #21262d', color: '#c9d1d9' },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover': { backgroundColor: 'rgba(22, 27, 34, 0.5)' },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: '#141428',
          border: '1px solid #21262d',
        },
      },
    },
  },
});
