'use client';

import { createTheme, alpha } from '@mui/material/styles';

// Synka Design System - Dark theme with teal accents
const synkaColors = {
  // Primary palette - Teal/Cyan
  primary: '#00d4aa',
  primaryHover: '#00e6bb',
  primaryDark: '#00b894',

  // Secondary accents
  pink: '#ff6b9d',
  orange: '#ffa42b',
  purple: '#a855f7',
  blue: '#3b82f6',
  yellow: '#eab308',

  // Neutral palette - Very dark
  background: '#0a0a0a',
  surface: '#141414',
  surfaceElevated: '#1a1a1a',
  surfaceHighlight: '#2a2a2a',

  // Text colors
  textPrimary: '#ffffff',
  textSecondary: '#b0b0b0',
  textSubdued: '#808080',

  // Semantic colors
  error: '#ef4444',
  success: '#00d4aa',
  warning: '#ffa42b',
  info: '#3b82f6',

  // Border colors
  border: '#2a2a2a',
  borderHighlight: '#3a3a3a',
};

export const rapidlyTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: synkaColors.primary,
      light: synkaColors.primaryHover,
      dark: synkaColors.primaryDark,
      contrastText: '#000000',
    },
    secondary: {
      main: synkaColors.surfaceElevated,
      light: synkaColors.surfaceHighlight,
      dark: synkaColors.surface,
      contrastText: synkaColors.textPrimary,
    },
    error: {
      main: synkaColors.error,
      contrastText: '#ffffff',
    },
    success: {
      main: synkaColors.success,
      contrastText: '#000000',
    },
    warning: {
      main: synkaColors.warning,
      contrastText: '#000000',
    },
    info: {
      main: synkaColors.info,
      contrastText: '#ffffff',
    },
    background: {
      default: synkaColors.background,
      paper: synkaColors.surface,
    },
    text: {
      primary: synkaColors.textPrimary,
      secondary: synkaColors.textSecondary,
      disabled: synkaColors.textSubdued,
    },
    divider: synkaColors.border,
  },
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    h1: { fontSize: '2rem', fontWeight: 600, letterSpacing: '-0.02em' },
    h2: { fontSize: '1.5rem', fontWeight: 600, letterSpacing: '-0.01em' },
    h3: { fontSize: '1.125rem', fontWeight: 600, letterSpacing: '-0.01em' },
    h4: { fontSize: '1rem', fontWeight: 600 },
    body1: { fontSize: '0.875rem', lineHeight: 1.6 },
    body2: { fontSize: '0.8125rem', lineHeight: 1.5 },
    caption: { fontSize: '0.75rem', color: synkaColors.textSecondary },
    button: { fontWeight: 500, textTransform: 'none' as const, fontSize: '0.8125rem' },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: synkaColors.background,
          scrollbarWidth: 'thin',
          scrollbarColor: `${synkaColors.surfaceHighlight} ${synkaColors.surface}`,
        },
        'input, textarea': {
          color: '#ffffff !important',
          caretColor: '#ffffff',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 6, padding: '8px 16px', fontWeight: 500 },
        containedPrimary: {
          backgroundColor: synkaColors.primary,
          color: '#000000',
          '&:hover': { backgroundColor: synkaColors.primaryHover },
        },
        containedSecondary: {
          backgroundColor: synkaColors.surfaceHighlight,
          color: '#ffffff',
          '&:hover': { backgroundColor: '#3a3a3a' },
        },
        outlined: {
          borderColor: synkaColors.border,
          color: '#ffffff',
          '&:hover': { backgroundColor: synkaColors.surfaceElevated, borderColor: synkaColors.borderHighlight },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backgroundColor: synkaColors.surfaceElevated,
            borderRadius: 6,
            '& fieldset': { borderColor: synkaColors.border },
            '&:hover fieldset': { borderColor: synkaColors.borderHighlight },
            '&.Mui-focused fieldset': { borderColor: synkaColors.primary, borderWidth: 1 },
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: synkaColors.surface,
          borderRadius: 12,
          border: `1px solid ${synkaColors.border}`,
          backgroundImage: 'none',
        },
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: { padding: 20, '&:last-child': { paddingBottom: 20 } },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 8, border: '1px solid' },
        standardError: {
          backgroundColor: alpha(synkaColors.error, 0.1),
          borderColor: alpha(synkaColors.error, 0.3),
          color: synkaColors.error,
        },
        standardSuccess: {
          backgroundColor: alpha(synkaColors.success, 0.1),
          borderColor: alpha(synkaColors.success, 0.3),
          color: synkaColors.success,
        },
        standardWarning: {
          backgroundColor: alpha(synkaColors.warning, 0.1),
          borderColor: alpha(synkaColors.warning, 0.3),
          color: synkaColors.warning,
        },
        standardInfo: {
          backgroundColor: alpha(synkaColors.info, 0.1),
          borderColor: alpha(synkaColors.info, 0.3),
          color: synkaColors.info,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          backgroundColor: synkaColors.surfaceHighlight,
          color: synkaColors.textSecondary,
          fontWeight: 500,
          fontSize: '0.75rem',
          height: 24,
        },
        colorPrimary: { backgroundColor: alpha(synkaColors.primary, 0.15), color: synkaColors.primary },
        colorSuccess: { backgroundColor: alpha(synkaColors.success, 0.15), color: synkaColors.success },
        colorError: { backgroundColor: alpha(synkaColors.error, 0.15), color: synkaColors.error },
        colorWarning: { backgroundColor: alpha(synkaColors.warning, 0.15), color: synkaColors.warning },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: { backgroundColor: synkaColors.surfaceElevated, borderRadius: 6 },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: { color: '#ffffff' },
        input: { color: '#ffffff !important' },
      },
    },
  },
});

export default rapidlyTheme;

