import { NextResponse } from 'next/server';
import { stat } from 'node:fs/promises';
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

  const prototypePlanPath = path.join(runDir, 'prototypePlan.json');
  const figmaPromptPath = path.join(runDir, 'figma_make_prompt.txt');
  const reviewedOutputPath = path.join(runDir, 'reviewed_output.txt');
  const prototypeHtmlPath = path.join(runDir, 'prototype.html');

  const outputs = {
    prototypePlan: await fileExists(prototypePlanPath),
    figmaMakePrompt: await fileExists(figmaPromptPath),
    reviewedOutput: await fileExists(reviewedOutputPath),
    prototypeHtml: await fileExists(prototypeHtmlPath),
  };

  return NextResponse.json(outputs);
}
