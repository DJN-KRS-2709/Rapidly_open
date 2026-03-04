import { NextResponse } from 'next/server';
import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

const RUNS_DIR = path.join(process.cwd(), 'runs');

export async function POST() {
  try {
    const entries = await readdir(RUNS_DIR);
    let cleared = 0;
    
    for (const entry of entries) {
      if (entry === '.gitignore') continue; // Keep the .gitignore file
      const fullPath = path.join(RUNS_DIR, entry);
      await rm(fullPath, { recursive: true, force: true });
      cleared++;
    }
    
    console.log(`[Rapidly] Cleared ${cleared} run(s)`);
    return NextResponse.json({ ok: true, cleared });
  } catch (err: any) {
    // Folder might not exist yet, that's fine
    if (err.code === 'ENOENT') {
      return NextResponse.json({ ok: true, cleared: 0 });
    }
    console.error('[Rapidly] Error clearing runs:', err.message);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
