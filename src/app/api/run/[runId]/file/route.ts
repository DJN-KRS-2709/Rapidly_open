import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const RUNS_DIR = path.join(process.cwd(), 'runs');

const ALLOWED_FILES = [
  'prototypePlan.json',
  'figma_make_prompt.txt',
  'reviewed_output.txt',
  'prototype.html',
  'cpmRaw.json',
  'cpmReviewed.json',
  'cpmFinal.json',
  'cpmRaw_validation.json',
  'sectionMap.json',
];

async function safeReadText(p: string): Promise<string | null> {
  try {
    return await readFile(p, 'utf8');
  } catch {
    return null;
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const url = new URL(req.url);
  const name = url.searchParams.get('name') ?? '';

  if (!ALLOWED_FILES.includes(name)) {
    return NextResponse.json({ ok: false, message: 'File not allowed' }, { status: 400 });
  }

  const runDir = path.join(RUNS_DIR, runId);
  const filePath = path.join(runDir, name);

  const content = await safeReadText(filePath);
  if (content === null) {
    return NextResponse.json({ ok: false, message: 'Not found' }, { status: 404 });
  }

  // Serve HTML files directly when raw=1 is specified (for opening in browser)
  const raw = url.searchParams.get('raw');
  if (raw === '1' && name.endsWith('.html')) {
    return new Response(content, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  return NextResponse.json({ ok: true, name, content });
}
