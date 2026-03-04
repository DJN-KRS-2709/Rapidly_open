/**
 * Data flow and architecture diagram screens for Rapidly prototypes.
 * Aligned with pm-os skill spec (rapidly.md sections 6.2, 6.3).
 */

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Extract components for data flow layers from CPM flows */
function extractDataFlowComponents(cpm: any): {
  input: string[];
  processing: string[];
  storage: string[];
  output: string[];
} {
  const input: string[] = [];
  const processing: string[] = [];
  const storage: string[] = [];
  const output: string[] = [];

  const flows = cpm?.flows ?? [];

  for (const flow of flows) {
    for (const step of flow?.steps ?? []) {
      const action = (step?.action ?? '').toLowerCase();
      const result = (step?.result ?? '').toLowerCase();
      const combined = `${action} ${result}`;

      if (/upload|import|receive|fetch|ingest|input|collect|gather/i.test(combined)) {
        const label = step.action?.trim() || 'Data source';
        if (label && !input.includes(label)) input.push(label);
      } else if (/process|transform|validate|calculate|compute|match|reconcile|run/i.test(combined)) {
        const label = step.action?.trim() || 'Processing';
        if (label && !processing.includes(label)) processing.push(label);
      } else if (/store|save|cache|database|persist|write|record/i.test(combined)) {
        const label = step.action?.trim() || 'Storage';
        if (label && !storage.includes(label)) storage.push(label);
      } else if (/export|send|display|report|deliver|output|notify|surface/i.test(combined)) {
        const label = step.action?.trim() || 'Output';
        if (label && !output.includes(label)) output.push(label);
      }
    }
  }

  // Defaults if nothing extracted
  if (input.length === 0) input.push('User Input', 'External API', 'File Upload');
  if (processing.length === 0) processing.push('Data Validation', 'Business Logic', 'Transformation');
  if (storage.length === 0) storage.push('Primary Database', 'Cache', 'File Storage');
  if (output.length === 0) output.push('User Interface', 'API Response', 'Reports');

  return { input, processing, storage, output };
}

/** Render 4-column data flow diagram: INPUT → PROCESSING → STORAGE → OUTPUT */
export function renderDataFlowDiagram(cpm: any): string {
  const { input, processing, storage, output } = extractDataFlowComponents(cpm);

  const layer = (title: string, color: string, items: string[]) =>
    `<div class="df-layer" style="--layer-color:${color}">
      <div class="df-layer-title">${esc(title)}</div>
      <div class="df-layer-boxes">
        ${items.map((item) => `<div class="df-box">${esc(item)}</div>`).join('')}
      </div>
    </div>`;

  return `<div class="df-diagram">
    ${layer('INPUT', '#3B82F6', input)}
    <div class="df-arrow">→</div>
    ${layer('PROCESSING', '#F59E0B', processing)}
    <div class="df-arrow">→</div>
    ${layer('STORAGE', '#10B981', storage)}
    <div class="df-arrow">→</div>
    ${layer('OUTPUT', '#8B5CF6', output)}
  </div>`;
}

/** Extract components for architecture layers from CPM */
function extractArchitectureComponents(cpm: any): {
  presentation: string[];
  application: string[];
  data: string[];
  external: string[];
} {
  const presentation: string[] = [];
  const application: string[] = [];
  const data: string[] = [];
  const external: string[] = [];

  const systems = cpm?.systems ?? {};
  const inScope = systems?.in_scope ?? [];
  const ext = systems?.external ?? [];

  const problem = (cpm?.intent?.problem?.statement ?? '').toLowerCase();
  const externalPatterns = [
    /netsuite|settlement|revenue central|slack|google|salesforce|stripe/i,
  ];

  // Map in_scope to layers
  for (const s of inScope) {
    const name = typeof s === 'string' ? s : s?.name ?? s;
    if (!name) continue;
    const lower = name.toLowerCase();
    if (/web|app|dashboard|admin|ui|frontend|portal/i.test(lower)) {
      presentation.push(name);
    } else if (/api|gateway|auth|service|workflow|engine|logic|backend/i.test(lower)) {
      application.push(name);
    } else if (/db|database|redis|postgres|elastic|s3|storage|cache/i.test(lower)) {
      data.push(name);
    } else {
      application.push(name);
    }
  }

  // External from systems.external or problem statement
  for (const s of ext) {
    const name = typeof s === 'string' ? s : s?.name ?? s;
    if (name && !external.includes(name)) external.push(name);
  }
  for (const pat of externalPatterns) {
    const m = problem.match(pat);
    if (m) {
      const term = m[0]?.trim();
      if (term && !external.some((e) => e.toLowerCase().includes(term.toLowerCase()))) {
        external.push(term.charAt(0).toUpperCase() + term.slice(1));
      }
    }
  }

  // Defaults
  if (presentation.length === 0) presentation.push('Web App', 'Dashboard', 'Admin Panel');
  if (application.length === 0) application.push('API Gateway', 'Auth', 'Workflow Engine');
  if (data.length === 0) data.push('PostgreSQL', 'Redis', 'S3');
  if (external.length === 0) external.push('NetSuite', 'Slack', 'External APIs');

  return { presentation, application, data, external };
}

/** Render 4-layer vertical architecture diagram */
export function renderArchitectureDiagram(cpm: any): string {
  const { presentation, application, data, external } = extractArchitectureComponents(cpm);

  const layer = (title: string, color: string, items: string[]) =>
    `<div class="arch-layer" style="--layer-color:${color}">
      <div class="arch-layer-label">${esc(title)}</div>
      <div class="arch-layer-boxes">
        ${items.map((item) => `<div class="arch-box">${esc(item)}</div>`).join('')}
      </div>
    </div>`;

  return `<div class="arch-diagram">
    ${layer('PRESENTATION', '#3B82F6', presentation)}
    ${layer('APPLICATION', '#10B981', application)}
    <div class="arch-boundary">SOX Compliance Boundary</div>
    ${layer('DATA', '#F59E0B', data)}
    ${layer('EXTERNAL', '#8B5CF6', external)}
  </div>`;
}
