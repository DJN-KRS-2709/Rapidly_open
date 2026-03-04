'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { PrototypeThemeProvider } from '../PrototypeThemeProvider';
import { PrototypeView } from '../PrototypeView';
import { planBlueprint } from '@/lib/prototypeBlueprint';
import type { UiTheme } from '@/lib/themeDetection';

interface CpmResponse {
  runId: string;
  sourceFile: string;
  isFinal: boolean;
  cpm: unknown;
}

interface ThemeResponse {
  theme: UiTheme;
}

/** Always prefer the rich interactive HTML prototype over React table view. */
function useHtmlPrototype(_theme: UiTheme | null): boolean {
  return true;
}

export default function PrototypePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const runId = params?.runId as string | undefined;
  const [blueprint, setBlueprint] = useState<ReturnType<typeof planBlueprint> | null>(null);
  const [flowsJson, setFlowsJson] = useState<string>('');
  const [theme, setTheme] = useState<UiTheme | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!runId) {
      setError('No run ID');
      setLoading(false);
      return;
    }

    Promise.all([
      fetch(`/api/run/${runId}/cpm`).then((r) => {
        if (!r.ok) throw new Error('Failed to load CPM');
        return r.json() as Promise<CpmResponse>;
      }),
      fetch(`/api/run/${runId}/theme`).then((r) => {
        if (!r.ok) return null;
        return r.json() as Promise<ThemeResponse>;
      }),
    ])
      .then(([cpmData, themeData]) => {
        const cpm = cpmData.cpm as { flows?: Array<{ name?: string; steps?: unknown[] }>; meta?: unknown; jobs?: unknown[] };
        const flows = cpm?.flows ?? [];
        const flowsForScript = JSON.stringify(
          flows.map((f) => ({
            n: f.name ?? '',
            s: (f.steps ?? []).map((s: unknown) => ({
              a: (s as { actor_id?: string })?.actor_id ?? '',
              x: (s as { action?: string })?.action ?? '',
              r: (s as { result?: string })?.result ?? '',
            })),
          }))
        );
        setFlowsJson(flowsForScript);
        const uiTheme = themeData?.theme ?? null;
        setTheme(uiTheme);
        const bp = planBlueprint({
          cpm: cpmData.cpm as Parameters<typeof planBlueprint>[0]['cpm'],
          theme: uiTheme ?? { description: 'Enterprise' },
          features: {},
        });
        setBlueprint(bp);
      })
      .catch((e) => setError(e?.message ?? 'Failed to load prototype'))
      .finally(() => setLoading(false));
  }, [runId]);

  const useHtml = useHtmlPrototype(theme);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0a1a', color: '#f0f6fc' }}>
        Loading prototype...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0a1a', color: '#f0f6fc', flexDirection: 'column', gap: 16 }}>
        <p>{error}</p>
        <a href="/" style={{ color: '#4a9eff' }}>Back to Review</a>
      </div>
    );
  }

  // Consumer themes: use HTML prototype (card grids, strategy layout) instead of React tables
  if (useHtml && runId) {
    const screen = searchParams?.get('screen') ?? '0';
    const viewport = searchParams?.get('viewport') ?? 'web';
    const iframeSrc = `/api/run/${runId}/prototype-html?screen=${screen}&viewport=${viewport}`;
    return (
      <iframe
        src={iframeSrc}
        title="Prototype"
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          border: 'none',
          backgroundColor: '#121212',
        }}
      />
    );
  }

  if (!blueprint) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0a1a', color: '#f0f6fc', flexDirection: 'column', gap: 16 }}>
        <p>No prototype data</p>
        <a href="/" style={{ color: '#4a9eff' }}>Back to Review</a>
      </div>
    );
  }

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&display=swap"
        rel="stylesheet"
      />
      <PrototypeThemeProvider theme={theme ?? undefined}>
        <PrototypeView blueprint={blueprint} flowsJson={flowsJson} />
      </PrototypeThemeProvider>
    </>
  );
}
