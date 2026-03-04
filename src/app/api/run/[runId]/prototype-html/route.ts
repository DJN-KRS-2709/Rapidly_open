import { NextResponse } from 'next/server';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { generatePrototypeHtml } from '@/lib/prototypeHtml';
import { detectThemeFromCpm } from '@/lib/themeDetection';

const RUNS_DIR = path.join(process.cwd(), 'runs');

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function getCpm(runDir: string): Promise<unknown> {
  const rawPath = path.join(runDir, 'cpmRaw.json');
  const reviewedPath = path.join(runDir, 'cpmReviewed.json');
  const finalPath = path.join(runDir, 'cpmFinal.json');

  const chosenPath = await (async () => {
    if (await fileExists(finalPath)) return finalPath;
    if (await fileExists(reviewedPath)) return reviewedPath;
    return rawPath;
  })();

  if (!(await fileExists(chosenPath))) {
    return null;
  }

  const text = await readFile(chosenPath, 'utf8');
  return JSON.parse(text);
}

/**
 * Returns the HTML prototype for a run.
 * Generates on the fly using CPM + theme detection so consumer themes
 * get the rich strategy layouts (card grids, etc.) instead of tables.
 *
 * Query params:
 * - screen: 0-based screen index (for browser back support)
 * - viewport: 'web' | 'mobile' for layout toggle
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const runDir = path.join(RUNS_DIR, runId);

  // Prefer the pre-generated prototype.html (built by regenerate with full features/mock data)
  const storedPath = path.join(runDir, 'prototype.html');
  if (await fileExists(storedPath)) {
    const html = await readFile(storedPath, 'utf8');
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // Fallback: generate on the fly from CPM
  const cpm = await getCpm(runDir);
  if (!cpm) {
    return NextResponse.json({ error: 'No CPM found' }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const screenId = Math.max(0, parseInt(searchParams.get('screen') ?? '0', 10) || 0);
  const viewport = searchParams.get('viewport') === 'mobile' ? 'mobile' : 'web';

  const theme = detectThemeFromCpm(cpm);
  const baseUrl = `/prototype/${runId}`;
  const html = generatePrototypeHtml(cpm, {
    description: theme.description,
    isDark: theme.isDark,
  }, undefined, undefined, undefined, { baseUrl, screenId, viewport });

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
