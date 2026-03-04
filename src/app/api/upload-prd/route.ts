import { NextResponse } from 'next/server';
import { writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { sectionizePrd } from '@/lib/sectionize';
import { extractCpm } from '@/lib/extract';

const RUNS_DIR = path.join(process.cwd(), 'runs');

// Module-level flag to track if cleanup has run this session
let hasCleanedUp = false;

async function clearOldRuns(): Promise<void> {
  if (hasCleanedUp) return;
  hasCleanedUp = true;

  try {
    const entries = await readdir(RUNS_DIR);
    for (const entry of entries) {
      if (entry === '.gitignore') continue; // Keep the .gitignore file
      const fullPath = path.join(RUNS_DIR, entry);
      await rm(fullPath, { recursive: true, force: true });
    }
    console.log(`[Rapidly] Cleared ${entries.length} old run(s) on startup`);
  } catch (err: any) {
    // Folder might not exist yet, that's fine
    if (err.code !== 'ENOENT') {
      console.error('[Rapidly] Error clearing old runs:', err.message);
    }
  }
}

function makeRunId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp =
    String(d.getFullYear()) +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    '_' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds());
  const rand = Math.random().toString(16).slice(2, 8);
  return `${stamp}_${rand}`;
}

export async function POST(req: Request) {
  // Clear old runs on first request after server restart
  await clearOldRuns();

  try {
    const { content, filename } = await req.json();
    if (!content || typeof content !== 'string') {
      return NextResponse.json({ ok: false, error: 'Missing PRD content' }, { status: 400 });
    }

    const runId = makeRunId();
    const runDir = path.join(RUNS_DIR, runId);
    await mkdir(runDir, { recursive: true });

    // Save the original PRD file
    const prdFilename = filename || 'prd.txt';
    const prdPath = path.join(runDir, prdFilename);
    await writeFile(prdPath, content, 'utf8');

    // Step 1: Sectionize the PRD
    console.log(`[Rapidly] Sectionizing PRD: ${prdFilename}`);
    const sectionMap = sectionizePrd(content, prdFilename);
    
    const sectionMapPath = path.join(runDir, 'sectionMap.json');
    await writeFile(sectionMapPath, JSON.stringify(sectionMap, null, 2), 'utf8');
    console.log(`[Rapidly] Wrote sectionMap with ${sectionMap.sections.length} sections`);

    // Step 2: Extract CPM from sections
    console.log(`[Rapidly] Extracting CPM from sections...`);
    const cpm = extractCpm({ sectionMap, runId });

    const cpmRawPath = path.join(runDir, 'cpmRaw.json');
    await writeFile(cpmRawPath, JSON.stringify(cpm, null, 2), 'utf8');
    console.log(`[Rapidly] Wrote cpmRaw.json`);
    console.log(`[Rapidly] Problem: ${cpm.intent?.problem?.statement?.slice(0, 100)}...`);
    console.log(`[Rapidly] Primary Outcome: ${cpm.intent?.goal?.primary_outcome?.slice(0, 100)}...`);
    console.log(`[Rapidly] Jobs extracted: ${cpm.jobs?.length || 0}`);
    console.log(`[Rapidly] Flows extracted: ${cpm.flows?.length || 0}`);
    console.log(`[Rapidly] Open questions: ${cpm.review?.open_questions?.length || 0}`);

    console.log(`[Rapidly] Created new run: ${runId}`);
    return NextResponse.json({ ok: true, runId });
  } catch (e: any) {
    console.error('[Rapidly] Upload PRD error:', e);
    return NextResponse.json({ ok: false, error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
