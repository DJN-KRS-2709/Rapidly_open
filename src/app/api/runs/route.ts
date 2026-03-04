import { NextResponse } from 'next/server';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const RUNS_DIR = path.join(process.cwd(), 'runs');

async function safeReadJson(filePath: string): Promise<any | null> {
  try {
    const text = await readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    const entries = await readdir(RUNS_DIR).catch(() => []);
    
    const runsDetailed: Array<{
      runId: string;
      documentName: string | null;
      isFinal: boolean;
    }> = [];

    for (const entry of entries) {
      if (entry === '.gitignore') continue;
      const runDir = path.join(RUNS_DIR, entry);
      if (!(await isDirectory(runDir))) continue;

      // Check for cpmFinal.json first, then cpmReviewed, then cpmRaw
      const finalCpm = await safeReadJson(path.join(runDir, 'cpmFinal.json'));
      const reviewedCpm = await safeReadJson(path.join(runDir, 'cpmReviewed.json'));
      const rawCpm = await safeReadJson(path.join(runDir, 'cpmRaw.json'));

      const cpm = finalCpm ?? reviewedCpm ?? rawCpm;
      const documentName = cpm?.meta?.source?.document_name ?? null;
      const isFinal = finalCpm !== null;

      runsDetailed.push({
        runId: entry,
        documentName,
        isFinal,
      });
    }

    // Sort by runId descending (newest first since IDs are timestamp-based)
    runsDetailed.sort((a, b) => b.runId.localeCompare(a.runId));

    return NextResponse.json({ runsDetailed });
  } catch (e: any) {
    return NextResponse.json({ runsDetailed: [], error: e.message }, { status: 500 });
  }
}
