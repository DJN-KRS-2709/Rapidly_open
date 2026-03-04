import { NextResponse } from 'next/server';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const RUNS_DIR = path.join(process.cwd(), 'runs');

export async function POST(
  req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const runDir = path.join(RUNS_DIR, runId);

  try {
    const { cpm } = await req.json();

    if (!cpm) {
      return NextResponse.json({ ok: false, message: 'Missing CPM in request body' }, { status: 400 });
    }

    const oq = cpm?.review?.open_questions ?? [];
    if (Array.isArray(oq) && oq.length > 0) {
      return NextResponse.json({
        ok: false,
        message: 'Cannot mark aligned while open questions exist. Clear them or move them to notes.',
        open_questions_count: oq.length,
      }, { status: 400 });
    }

    cpm.review.review_required = false;

    const outPath = path.join(runDir, 'cpmFinal.json');
    await writeFile(outPath, JSON.stringify(cpm, null, 2), 'utf8');

    return NextResponse.json({ ok: true, savedAs: 'cpmFinal.json' });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e.message }, { status: 500 });
  }
}
