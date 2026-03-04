import { NextResponse } from 'next/server';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const RUNS_DIR = path.join(process.cwd(), 'runs');

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const runDir = path.join(RUNS_DIR, runId);

  const rawPath = path.join(runDir, 'cpmRaw.json');
  const reviewedPath = path.join(runDir, 'cpmReviewed.json');
  const finalPath = path.join(runDir, 'cpmFinal.json');

  const chosenPath = await (async () => {
    if (await fileExists(finalPath)) return finalPath;
    if (await fileExists(reviewedPath)) return reviewedPath;
    return rawPath;
  })();

  if (!(await fileExists(chosenPath))) {
    return NextResponse.json({ error: 'No CPM file found in run folder' }, { status: 404 });
  }

  try {
    const text = await readFile(chosenPath, 'utf8');
    const cpm = JSON.parse(text);
    return NextResponse.json({
      runId,
      sourceFile: path.basename(chosenPath),
      isFinal: path.basename(chosenPath) === 'cpmFinal.json',
      cpm,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
