/**
 * Shared design system for Rapidly HTML prototypes.
 * Lovable-inspired: design tokens, visual hierarchy, depth, polish.
 * Aligned with pm-os skill spec (rapidly.md section 7.2).
 */
export const DESIGN_SYSTEM_CSS = `:root{
  --blue:#2563EB;--blue-light:#EFF6FF;--blue-glow:rgba(37,99,235,.25);
  --green:#059669;--green-light:#D1FAE5;--green-dark:#047857;
  --amber:#D97706;--amber-light:#FEF3C7;--amber-dark:#B45309;
  --red:#DC2626;--red-light:#FEE2E2;
  --purple:#7C3AED;--purple-light:#F5F3FF;
  --bg:#F8FAFC;--surface:#FFFFFF;--surface-elevated:#FFFFFF;
  --sidebar:#0F172A;--sidebar-hover:#1E293B;
  --text:#0F172A;--text2:#475569;--text3:#94A3B8;
  --border:#E2E8F0;--border-focus:#2563EB;
  --shadow-sm:0 1px 2px rgba(0,0,0,.05);
  --shadow:0 4px 6px -1px rgba(0,0,0,.08),0 2px 4px -2px rgba(0,0,0,.06);
  --shadow-lg:0 10px 15px -3px rgba(0,0,0,.08),0 4px 6px -4px rgba(0,0,0,.06);
  --shadow-xl:0 20px 25px -5px rgba(0,0,0,.08),0 8px 10px -6px rgba(0,0,0,.06);
  --radius:12px;--radius-sm:8px;--radius-lg:16px;--radius-full:9999px;
  --sidebar-w:260px;
  --font:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  --mono:'JetBrains Mono',ui-monospace,monospace;
  --transition:all .2s cubic-bezier(.4,0,.2,1);
  --heading-tight:-.025em;--body-leading:1.6;
}`;

export const DESIGN_SYSTEM_FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">`;

export const LUCIDE_ICONS = `<script src="https://unpkg.com/lucide@latest"></script>`;

/** Enterprise dark theme */
export const ENTERPRISE_DARK_CSS = `:root{
  --rs-sidebar:#1a1a2e;--rs-bg:#0a0a1a;--rs-surface:#141428;
  --rs-accent:#4a9eff;--rs-text:#f0f6fc;--rs-muted:#8b949e;--rs-border:#21262d;
  --rs-success:#3fb950;--rs-error:#f85149;--rs-warning:#d29922;
}`;

/** CSS for data flow and architecture diagram screens */
export const DIAGRAM_CSS = `
.df-diagram{display:grid;grid-template-columns:1fr auto 1fr auto 1fr auto 1fr;gap:16px;align-items:start;padding:32px;max-width:1200px;margin:0 auto}
.df-layer{background:var(--surface);border-radius:var(--radius);padding:20px;border:2px solid var(--layer-color);min-height:120px;box-shadow:var(--shadow-sm);transition:var(--transition)}
.df-layer:hover{box-shadow:var(--shadow)}
.df-layer-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--layer-color);margin-bottom:12px}
.df-layer-boxes{display:flex;flex-direction:column;gap:8px}
.df-box{padding:10px 14px;background:color-mix(in srgb,var(--layer-color) 12%, transparent);border-radius:var(--radius-sm);font-size:13px;color:var(--text);font-weight:500}
.df-arrow{font-size:24px;color:var(--text3);font-weight:700;align-self:center;margin-top:40px}
.arch-diagram{display:flex;flex-direction:column;gap:0;padding:32px;max-width:800px;margin:0 auto}
.arch-layer{background:var(--surface);border-radius:var(--radius);padding:20px 24px;margin-bottom:12px;border-left:4px solid var(--layer-color);box-shadow:var(--shadow-sm)}
.arch-layer-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--layer-color);margin-bottom:12px}
.arch-layer-boxes{display:flex;flex-wrap:wrap;gap:10px}
.arch-box{padding:10px 16px;background:color-mix(in srgb,var(--layer-color) 12%, transparent);border-radius:var(--radius-sm);font-size:13px;color:var(--text);font-weight:500}
.arch-boundary{font-size:12px;font-weight:600;color:var(--amber);text-align:center;padding:12px;font-family:var(--mono);border:1px dashed var(--border);margin:12px 0;border-radius:var(--radius-sm)}
`;
