/**
 * Planner: CPM + theme -> UiBlueprint.
 * Document-driven: derives sections from flows (one section per flow).
 */

import type { UiBlueprint, UiBlueprintScreen } from './types';

export type FlowType = 'calculation' | 'reporting' | 'mec' | 'contract' | 'generic';

/** Slug from flow name for use as section id. */
function slugFromLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'section';
}

function classifyFlowType(flow: { name?: string; steps?: unknown[] }): FlowType {
  const flowName = (flow?.name ?? '').toLowerCase();
  const stepsText = (flow?.steps ?? [])
    .map((s: unknown) => `${(s as { action?: string })?.action ?? ''} ${(s as { result?: string })?.result ?? ''}`)
    .join(' ')
    .toLowerCase();
  const allText = `${flowName} ${stepsText}`;
  if (/calculat|computation|pipeline/i.test(allText)) return 'calculation';
  if (/report|deliver|generat.*report|csv|export/i.test(allText)) return 'reporting';
  if (/mec|mac|month[\s-]*end|check|sign[\s-]*off|validation/i.test(allText)) return 'mec';
  if (/contract|licensor|version|tag/i.test(allText)) return 'contract';
  return 'generic';
}

/**
 * Document-driven sections: one section per flow.
 * Labels come from flow names; no hardcoded Licensors/Contracts/Calculations.
 */
function buildFlowBasedScreenTree(
  flows: Array<{ name?: string; steps?: unknown[]; flow_id?: string; linked_jobs?: string[] }>,
  jobs: Array<{ job_id?: string; description?: string }>
): Array<{ id: string; label: string; flowType: FlowType; flow?: { name?: string; steps?: unknown[]; job?: unknown } }> {
  if (!flows?.length) {
    return [{ id: 'overview', label: 'Overview', flowType: 'generic', flow: undefined }];
  }
  return flows.map((f) => {
    const label = (f.name ?? 'Flow').trim() || 'Untitled';
    const id = slugFromLabel(label);
    const job = jobs?.find((j) => f.linked_jobs?.includes(j.job_id ?? ''));
    return {
      id,
      label: label.length > 50 ? label.slice(0, 47) + '...' : label,
      flowType: classifyFlowType(f) as FlowType,
      flow: { ...f, job },
    };
  });
}

const GENERIC_ROWS = [
  { name: 'Sample item 1', status: { variant: 'chip-done', label: 'Active' }, updated: 'Feb 11 2026' },
  { name: 'Sample item 2', status: { variant: 'chip-done', label: 'Active' }, updated: 'Feb 10 2026' },
  { name: 'Sample item 3', status: { variant: 'chip-pend', label: 'Draft' }, updated: 'Feb 09 2026' },
];

function buildGenericScreen(
  section: { id: string; label: string; flowType: FlowType; flow?: { name?: string; steps?: unknown[]; job?: unknown } }
): UiBlueprintScreen {
  const flow = section.flow ?? { name: section.label, steps: [], job: null };
  const pageTitle = section.label;
  const job = flow?.job as { description?: string } | undefined;
  const subtitle = job?.description ?? '';

  const tableColumns = ['NAME', 'STATUS', 'UPDATED'];
  const tableRows = GENERIC_ROWS as unknown as Record<string, unknown>[];
  const searchPlaceholder = `Search for ${section.label.toLowerCase()}...`;
  const rowCount = tableRows.length;

  return {
    id: section.id,
    title: pageTitle,
    route: `/${section.id}`,
    layout: 'default',
    components: [],
    flowType: section.flowType,
    tableColumns,
    tableRows,
    searchPlaceholder,
    rowCount,
    subtitle,
    flow,
    showFlowSteps: true,
  } as UiBlueprintScreen & {
    flowType: FlowType;
    tableColumns?: string[];
    tableRows?: Record<string, unknown>[];
    searchPlaceholder: string;
    rowCount: number;
    subtitle: string;
    flow?: { name?: string; steps?: unknown[]; job?: unknown };
    showFlowSteps: boolean;
  };
}

export interface PlanBlueprintInput {
  cpm: {
    meta?: { source?: { document_name?: string } };
    jobs?: unknown[];
    flows?: Array<{ name?: string; steps?: unknown[]; flow_id?: string; linked_jobs?: string[] }>;
  };
  theme?: { name?: string; description?: string };
  features?: { isFinanceApp?: boolean; [key: string]: unknown };
}

/** Plan CPM + theme -> UiBlueprint. Document-driven: derives sections from flows. */
export function planBlueprint(input: PlanBlueprintInput): UiBlueprint {
  const cpm = input.cpm ?? {};
  const appName = cpm?.meta?.source?.document_name?.replace(/\.[^.]+$/, '') ?? 'Prototype';
  const flows = cpm?.flows ?? [];
  const jobs = cpm?.jobs ?? [];
  const sections = buildFlowBasedScreenTree(flows, (jobs ?? []) as Array<{ job_id?: string; description?: string }>);
  const screens: UiBlueprintScreen[] = sections.map((section) => buildGenericScreen(section));

  return {
    appName,
    screens,
  };
}
