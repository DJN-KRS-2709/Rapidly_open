import { NextResponse } from 'next/server';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const RUNS_DIR = path.join(process.cwd(), 'runs');

async function safeReadText(p: string): Promise<string | null> {
  try {
    return await readFile(p, 'utf8');
  } catch {
    return null;
  }
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const runDir = path.join(RUNS_DIR, runId);

  const finalPath = path.join(runDir, 'cpmFinal.json');
  const reviewedPath = path.join(runDir, 'cpmReviewed.json');

  const finalText = await safeReadText(finalPath);
  if (!finalText) {
    return NextResponse.json({ ok: false, message: 'cpmFinal.json not found' }, { status: 404 });
  }

  try {
    const cpm = JSON.parse(finalText);
    cpm.review.review_required = true;

    await writeFile(reviewedPath, JSON.stringify(cpm, null, 2), 'utf8');
    return NextResponse.json({ ok: true, reopenedAs: 'cpmReviewed.json' });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e.message }, { status: 500 });
  }
}
