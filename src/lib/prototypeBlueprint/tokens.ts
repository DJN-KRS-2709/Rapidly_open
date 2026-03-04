/**
 * Design tokens for prototype rendering.
 * All values as CSS variables; no raw hex in renderer output.
 * All values as CSS variables; no raw hex in renderer output.
 */

export interface TokenScale {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
}

export interface TokenPreset {
  spacing: TokenScale;
  typography: {
    fontFamily: string;
    fontSize: { xs: number; sm: number; md: number; lg: number; xl: number };
    fontWeight: { normal: number; medium: number; semibold: number; bold: number };
  };
  radius: { sm: number; md: number; lg: number };
  color: {
    sidebar: string;
    bg: string;
    surface: string;
    accent: string;
    text: string;
    muted: string;
    border: string;
    success: string;
    error: string;
    warning: string;
    rowHover: string;
  };
  elevation?: { sm: string; md: string };
}

export const SPACING: TokenScale = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

export const TYPOGRAPHY = {
  fontFamily: "'DM Sans', system-ui, sans-serif",
  fontSize: { xs: 11, sm: 12, md: 13, lg: 16, xl: 20 },
  fontWeight: { normal: 400, medium: 500, semibold: 600, bold: 700 },
};

export const RADIUS = { sm: 6, md: 8, lg: 10 };

/** Enterprise dark theme */
export const enterpriseDark: TokenPreset = {
  spacing: SPACING,
  typography: TYPOGRAPHY,
  radius: RADIUS,
  color: {
    sidebar: '#1a1a2e',
    bg: '#0a0a1a',
    surface: '#141428',
    accent: '#4a9eff',
    text: '#f0f6fc',
    muted: '#8b949e',
    border: '#21262d',
    success: '#3fb950',
    error: '#f85149',
    warning: '#d29922',
    rowHover: 'rgba(22,27,34,.5)',
  },
  elevation: {
    sm: '0 1px 3px rgba(0,0,0,.1)',
    md: '0 4px 12px rgba(0,0,0,.2)',
  },
};

/** Generate CSS variables block for a preset */
export function presetToCssVariables(preset: TokenPreset): string {
  const c = preset.color;
  return `:root{
  --bp-sidebar:${c.sidebar};--bp-bg:${c.bg};--bp-surface:${c.surface};
  --bp-accent:${c.accent};--bp-text:${c.text};--bp-muted:${c.muted};
  --bp-border:${c.border};--bp-success:${c.success};--bp-error:${c.error};--bp-warning:${c.warning};
  --bp-row-hover:${c.rowHover};
  --bp-spacing-xs:${preset.spacing.xs}px;--bp-spacing-sm:${preset.spacing.sm}px;--bp-spacing-md:${preset.spacing.md}px;--bp-spacing-lg:${preset.spacing.lg}px;--bp-spacing-xl:${preset.spacing.xl}px;
  --bp-radius-sm:${preset.radius.sm}px;--bp-radius-md:${preset.radius.md}px;--bp-radius-lg:${preset.radius.lg}px;
  --bp-font:${preset.typography.fontFamily};
  --bp-font-size-xs:${preset.typography.fontSize.xs}px;--bp-font-size-sm:${preset.typography.fontSize.sm}px;--bp-font-size-md:${preset.typography.fontSize.md}px;--bp-font-size-lg:${preset.typography.fontSize.lg}px;--bp-font-size-xl:${preset.typography.fontSize.xl}px;
}`;
}
