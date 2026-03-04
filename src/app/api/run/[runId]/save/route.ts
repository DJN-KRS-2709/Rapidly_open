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

    // Update review status
    const oq = cpm?.review?.open_questions ?? [];
    if (Array.isArray(oq) && oq.length === 0) {
      cpm.review.review_required = false;
    } else {
      cpm.review.review_required = true;
    }

    const outPath = path.join(runDir, 'cpmReviewed.json');
    await writeFile(outPath, JSON.stringify(cpm, null, 2), 'utf8');
    
    return NextResponse.json({ ok: true, savedAs: 'cpmReviewed.json' });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e.message }, { status: 500 });
  }
}
