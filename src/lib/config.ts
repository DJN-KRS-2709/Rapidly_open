import path from 'path';

export const DATA_DIR = path.join(process.cwd(), 'data');

export const RUNS_DIR = path.join(process.cwd(), 'runs');

export const SCHEMA_PATH = path.join(DATA_DIR, 'schemas/cpm.schema.json');
export const INPUTS_DIR = path.join(DATA_DIR, 'inputs');
export const PROMPTS_DIR = path.join(DATA_DIR, 'prompts');

// Allowed output files for file API
export const ALLOWED_OUTPUT_FILES = [
  'prototypePlan.json',
  'figma_make_prompt.txt',
  'reviewed_output.txt',
  'prototype.html',
  'data_flow_prompt.txt',
  'architecture_prompt.txt',
  'hybrid_bundle_prompt.txt',
  'cpmRaw.json',
  'cpmReviewed.json',
  'cpmRaw_validation.json',
  'cpmFinal.json',
  'sectionMap.json',
];

