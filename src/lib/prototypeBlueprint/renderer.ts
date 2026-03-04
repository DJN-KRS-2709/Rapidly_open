/**
 * Renderer: UiBlueprint + mockData -> HTML.
 * Uses only tokens and component dictionary. No raw CSS or hex.
 */

import type { UiBlueprint, UiBlueprintScreen, UiBlueprintTab } from './types';

/** Optional mock data for prototype content (matches prototypeHtml.PrototypeMockData) */
interface PrototypeMockData {
  tableRows?: Array<Record<string, unknown>>;
  metrics?: Array<{ label: string; value: string; change: string }>;
  recommendations?: Array<{ title: string; desc: string; priority: string }>;
}
import { enterpriseDark, presetToCssVariables } from './tokens';
import { renderComponent } from './componentDictionary';
import { DESIGN_SYSTEM_FONTS } from '../prototypeDesignSystem';

const FEEDBACK_WIDGET_HTML = `<div class="wz-feedback" id="wz-feedback"><span>Done! How does this look?</span><button class="wz-fb-btn" title="Thumbs up">👍</button><button class="wz-fb-btn" title="Thumbs down">👎</button><button class="wz-fb-close" onclick="document.getElementById('wz-feedback')?.remove()">✕</button></div>`;

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Component CSS using token variables only */
const BLUEPRINT_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:var(--bp-font);background:var(--bp-bg);color:var(--bp-text);display:flex;height:100vh;overflow:hidden;font-size:14px}
.sb{width:200px;min-width:200px;background:var(--bp-sidebar);display:flex;flex-direction:column;border-right:1px solid var(--bp-border)}
.sb-h{padding:16px 14px 12px}.sb-h h2{font-size:15px;font-weight:700;color:var(--bp-text)}.sb-h p{font-size:11px;color:var(--bp-muted);margin-top:1px}
.sb-n{flex:1;overflow-y:auto;padding:4px 0}
.ni{display:flex;align-items:center;gap:8px;padding:6px 14px;cursor:pointer;color:var(--bp-muted);font-size:13px;border-left:2px solid transparent;text-decoration:none}
.ni:hover{background:var(--bp-surface);color:var(--bp-text)}.ni.on{background:var(--bp-surface);color:var(--bp-accent);border-left-color:var(--bp-accent);font-weight:600}
.sb-ft{padding:10px 14px;border-top:1px solid var(--bp-border);font-size:12px;color:var(--bp-muted)}
.sb-col{font-size:12px;color:var(--bp-muted);padding:10px 14px;border-top:1px solid var(--bp-border);cursor:pointer}
.mn{flex:1;overflow:hidden}.scr{display:none;flex-direction:column;height:100%}.scr-in{display:flex;flex-direction:column;height:100%;overflow-y:auto}
.hdr{padding:14px 24px 0;border-bottom:1px solid var(--bp-border)}.hdr h1{font-size:20px;font-weight:600;color:var(--bp-text);display:flex;align-items:center;gap:8px}
.edit{font-size:14px;opacity:.3}.badge{background:rgba(74,158,255,.15);color:var(--bp-accent);padding:1px 10px;border-radius:10px;font-size:11px;font-weight:600}
.sub{font-size:12px;color:var(--bp-muted);margin:4px 0 6px}.tabs{display:flex;margin-top:6px}
.tab{padding:7px 14px;font-size:13px;color:var(--bp-muted);cursor:pointer;border-bottom:2px solid transparent}.tab.on{color:var(--bp-accent);border-bottom-color:var(--bp-accent);font-weight:600}
.tbar{display:flex;align-items:center;padding:10px 24px}.search{display:flex;align-items:center;gap:5px;background:var(--bp-bg);border:1px solid var(--bp-border);border-radius:6px;padding:4px 10px;width:240px;font-size:12px;color:var(--bp-muted)}
.search input{background:0;border:0;color:var(--bp-text);font-size:13px;outline:0;width:100%}.cog{margin-left:auto;opacity:.3;cursor:pointer}
.bc{font-size:12px;color:var(--bp-muted);margin-bottom:8px;padding:0 24px}
.cnt{flex:1;padding:0 24px;overflow-y:auto;overflow-x:auto}
.tbl{width:100%;min-width:500px;border-collapse:collapse;font-size:13px}
.tbl th{text-align:left;padding:8px 10px;font-size:11px;font-weight:600;text-transform:uppercase;color:var(--bp-muted);border-bottom:1px solid var(--bp-border)}
.tbl th.th-sort{cursor:pointer;user-select:none}.tbl th.th-sort:hover{color:var(--bp-muted)}.tbl th .sort-icon{opacity:.5;margin-left:4px;font-size:10px}
.tbl td{padding:7px 10px;border-bottom:1px solid var(--bp-surface);color:var(--bp-text)}.tbl tr:hover td{background:var(--bp-row-hover)}
.tbl-row-exp{cursor:pointer}
.chip{padding:1px 8px;border-radius:10px;font-size:11px;font-weight:600}
.chip-done{background:rgba(35,134,54,.2);color:var(--bp-success)}.chip-failed{background:rgba(248,81,73,.2);color:var(--bp-error)}
.chip-prog{background:#1f6feb;color:#fff}.chip-pend{background:var(--bp-border);color:var(--bp-muted)}
.chip-injected,.chip-signed{background:rgba(35,134,54,.2);color:var(--bp-success)}.chip-rejected{background:rgba(248,81,73,.2);color:var(--bp-error)}.chip-prepared{background:rgba(31,111,235,.2);color:#58a6ff}
.tab-content{transition:opacity .15s ease}
.prog-bar{display:inline-block;width:60px;height:6px;background:var(--bp-border);border-radius:3px;overflow:hidden;vertical-align:middle;margin-right:6px}.prog-fill{height:100%;background:var(--bp-accent);transition:width .2s}
.pag{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:8px 0;font-size:12px;color:var(--bp-muted)}.pag button{background:0;border:1px solid var(--bp-border);border-radius:4px;padding:2px 6px;color:var(--bp-muted);cursor:pointer}
.fsp{border-top:1px solid var(--bp-border);padding:14px 24px 24px}.fsp-h{font-size:11px;font-weight:600;color:var(--bp-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px}
.fs{display:flex;gap:8px;padding:7px 10px;border-radius:6px;cursor:pointer;border-left:2px solid transparent;margin-bottom:1px}.fs:hover{background:var(--bp-surface)}.fs.on{background:var(--bp-surface);border-left-color:var(--bp-accent)}
.dot{color:var(--bp-accent);font-size:12px;width:14px;flex-shrink:0}.tag{font-size:10px;font-weight:700;color:var(--bp-accent);text-transform:uppercase;background:rgba(74,158,255,.1);padding:0 5px;border-radius:3px}
.act{font-size:13px;color:var(--bp-text)}.res{font-size:12px;color:var(--bp-muted);font-style:italic}
.mo{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(1,4,9,.7);display:none;align-items:center;justify-content:center;z-index:100}
.mo-c{background:var(--bp-surface);border:1px solid var(--bp-border);border-radius:10px;padding:24px;max-width:480px;width:90%}
.mo-h{display:flex;justify-content:space-between;margin-bottom:14px}.mo-h h3{color:var(--bp-text)}.mo-x{background:0;border:0;color:var(--bp-muted);font-size:18px;cursor:pointer}
.mo-l{font-size:10px;font-weight:600;text-transform:uppercase;color:var(--bp-muted);margin-bottom:2px}.mo-v{font-size:14px;color:var(--bp-text);margin-bottom:12px}
.wz-empty{padding:40px 24px;text-align:center;color:var(--bp-muted)}.wz-empty-hint{font-size:12px;color:var(--bp-muted);opacity:.8}
.wz-feedback{position:fixed;bottom:24px;right:24px;background:#1f2937;color:#fff;padding:12px 16px;border-radius:12px;display:flex;align-items:center;gap:8px;box-shadow:0 4px 20px rgba(0,0,0,.25);z-index:50;font-size:14px}
.wz-fb-btn,.wz-fb-close{background:0;border:0;color:#9ca3af;cursor:pointer;font-size:18px;padding:0 4px}
`;

type ExtendedScreen = UiBlueprintScreen & {
  flowType?: string;
  tableColumns?: string[];
  tableRows?: Record<string, unknown>[];
  sortableCols?: number[];
  searchPlaceholder?: string;
  rowCount?: number;
  subtitle?: string;
  flow?: { name?: string; steps?: unknown[]; job?: unknown };
  showFlowSteps?: boolean;
  steps?: unknown[];
  scrIdx?: number;
};

function getColumnKeys(columns: string[], rows: Record<string, unknown>[]): string[] {
  if (rows.length === 0) return columns.map((c) => c.toLowerCase().replace(/\s+/g, ''));
  return Object.keys(rows[0]!);
}

function renderScreen(screen: ExtendedScreen, scrIdx: number): string {
  const title = esc(screen.title);
  const subtitle = (screen.subtitle ?? '') as string;
  const searchPlaceholder = (screen.searchPlaceholder ?? 'Search...') as string;
  const showFlowSteps = screen.showFlowSteps ?? false;
  const flow = screen.flow as { name?: string; steps?: Array<{ actor_id?: string; action?: string; result?: string }> } | undefined;
  const steps = flow?.steps ?? [];
  const hasSteps = steps.length > 0;

  const breadcrumb = `Home › ${title}${hasSteps ? ' › Step 1' : ''}`;

  let tabsHtml = '';
  let tabContents: string[] = [];
  let mainContent = '';

  const tabs = screen.tabs as UiBlueprintTab[] | undefined;
  if (tabs && tabs.length > 0) {
    tabsHtml = renderComponent(
      'Tabs',
      { tabs: tabs.map((t) => ({ id: t.id, label: t.label })), activeId: tabs[0]!.id, scrIdx },
      enterpriseDark
    );
    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i]!;
      const content = tab.content;
      if (content?.tableColumns && content?.tableRows) {
        const cols = content.tableColumns;
        const rows = content.tableRows;
        const colKeys = (content as { columnKeys?: string[] }).columnKeys ?? getColumnKeys(cols, rows);
        const sortableCols = i === 0 && (screen.flowType === 'calculation' || screen.flowType === 'reporting') ? [0, 1] : [];
        const tblHtml = renderComponent(
          'DataTableDense',
          { columns: cols, columnKeys: colKeys, rows, sortable: sortableCols, scrIdx, tblId: `tbl-${scrIdx}-${tab.id}` },
          enterpriseDark
        );
        const rowCount = rows.length;
        const pagHtml = renderComponent('Pagination', { total: rowCount, rowsPerPage: 25, page: 1 }, enterpriseDark);
        tabContents.push(
          `<div id="content-${scrIdx}-${tab.id}" class="tab-content" style="display:${i === 0 ? 'block' : 'none'}">${tblHtml}${pagHtml}</div>`
        );
      } else {
        tabContents.push(
          `<div id="content-${scrIdx}-${tab.id}" class="tab-content" style="display:${i === 0 ? 'block' : 'none'}"><div class="wz-empty"><p>${content?.placeholder ?? tab.label}</p></div></div>`
        );
      }
    }
    mainContent = tabContents.join('');
  } else {
    const tableColumns = screen.tableColumns ?? [];
    const tableRows = screen.tableRows ?? [];
    const sortableCols = screen.sortableCols ?? [];
    const rowCount = screen.rowCount ?? 0;
    if (tableColumns.length > 0 && tableRows.length > 0) {
      const colKeys = getColumnKeys(tableColumns, tableRows);
      const tblHtml = renderComponent(
        'DataTableDense',
        { columns: tableColumns, columnKeys: colKeys, rows: tableRows, sortable: sortableCols, scrIdx, tblId: `tbl-${scrIdx}` },
        enterpriseDark
      );
      const pagHtml = renderComponent('Pagination', { total: rowCount, rowsPerPage: 25, page: 1 }, enterpriseDark);
      mainContent = tblHtml + pagHtml;
    } else {
      mainContent = '<div class="wz-empty"><p>No user flows extracted.</p><p class="wz-empty-hint">Add flows to your PRD to see them here.</p></div>';
    }
  }

  const headerTabs = tabsHtml ? `<div class="tabs">${tabsHtml}</div>` : '';
  const mecDevMode =
    screen.flowType === 'mec'
      ? '<div style="margin-top:8px"><label style="font-size:12px;color:var(--bp-muted)">Dev mode</label> <input type="checkbox" style="margin-left:8px"/></div>'
      : '';

  const stepsPanel =
    showFlowSteps && hasSteps
      ? `<div class="fsp"><div class="fsp-h">FLOW STEPS</div>${steps
          .map(
            (st: unknown, si: number) => {
              const s = st as { actor_id?: string; action?: string; result?: string };
              return `<div class="fs${si === 0 ? ' on' : ''}" onclick="step(${scrIdx},${si})" data-step="${si}"><span class="dot">${si === 0 ? '●' : '○'}</span><div><span class="tag">${esc(s.actor_id ?? '')}</span><div class="act">${esc(s.action ?? '')}</div><div class="res">→ ${esc(s.result ?? '')}</div></div></div>`;
            }
          )
          .join('')}</div>`
      : '';

  const topBar = renderComponent('TopBar', { title, subtitle, badge: 'Music' }, enterpriseDark);
  const searchInput = renderComponent('SearchInput', { placeholder: searchPlaceholder, scrIdx }, enterpriseDark);

  return `<div class="scr" id="s${scrIdx}" style="display:${scrIdx === 0 ? 'flex' : 'none'}"><div class="scr-in">
  <div class="bc">${breadcrumb}</div>
  <div class="hdr">${topBar}${headerTabs || mecDevMode}</div>
  <div class="tbar">${searchInput}<span class="cog">⚙️</span></div>
  <div class="cnt">${mainContent}</div>
  ${stepsPanel}
</div></div>`;
}

const INTERACT_SCRIPT = `
const F=FLOWS_JSON_PLACEHOLDER;
function go(i){document.querySelectorAll('.scr').forEach(s=>s.style.display='none');document.querySelectorAll('.ni').forEach(n=>n.classList.remove('on'));const s=document.getElementById('s'+i);if(s)s.style.display='flex';document.querySelectorAll('[data-i="'+i+'"]').forEach(n=>n.classList.add('on'))}
function switchTab(scrIdx,tabId){const sc=document.getElementById('s'+scrIdx);if(!sc)return;sc.querySelectorAll('.tab,[data-tab]').forEach(t=>{const id=t.getAttribute('data-tab');if(id)t.classList.toggle('on',id===tabId)});sc.querySelectorAll('.tab-content').forEach(c=>{c.style.display=c.id===('content-'+scrIdx+'-'+tabId)?'block':'none'})}
function filterTable(input,scrIdx){const q=(input.value||'').toLowerCase().trim();const sc=document.getElementById('s'+scrIdx);if(!sc)return;sc.querySelectorAll('.tbl tbody tr.tbl-row-exp').forEach(tr=>{const text=tr.textContent||'';tr.style.display=!q||text.toLowerCase().includes(q)?'':'none'})}
function sortTable(tblId,colIdx){const tbl=document.getElementById(tblId);if(!tbl)return;const last=tbl.dataset.sortCol;const asc=last!==String(colIdx)||tbl.dataset.sortDir==='desc';tbl.dataset.sortCol=String(colIdx);tbl.dataset.sortDir=asc?'asc':'desc';const tbody=tbl.querySelector('tbody');const rows=Array.from(tbody.querySelectorAll('tr.tbl-row-exp'));rows.sort((a,b)=>{const va=(a.children[colIdx]?.textContent||'').trim();const vb=(b.children[colIdx]?.textContent||'').trim();const cmp=va.localeCompare(vb,'en',{numeric:true});return asc?cmp:-cmp});rows.forEach(r=>tbody.appendChild(r))}
function openDetail(scrIdx,row){const cells=row.querySelectorAll('td');if(!cells.length)return;let html='';cells.forEach((c,i)=>{const h=row.closest('table')?.querySelector('th:nth-child('+(i+1)+')');if(h)html+='<div class="mo-l">'+h.textContent+'</div><div class="mo-v">'+c.innerHTML+'</div>'});document.getElementById('mt').textContent='Row details';document.getElementById('mb').innerHTML=html||'<div class="mo-v">No details</div>';document.getElementById('mo').style.display='flex'}
function step(fi,si){const sc=document.getElementById('s'+fi);if(!sc)return;sc.querySelectorAll('.fs').forEach((r,i)=>{r.classList.toggle('on',i===si);const d=r.querySelector('.dot');if(d)d.textContent=i<=si?'●':'○'});const f=F[fi];if(!f)return;const st=f.s[si];if(!st)return;document.getElementById('mt').textContent='Step '+(si+1);document.getElementById('mb').innerHTML='<div class="mo-l">Actor</div><div class="mo-v">'+st.a+'</div><div class="mo-l">Action</div><div class="mo-v">'+st.x+'</div><div class="mo-l">Result</div><div class="mo-v">'+st.r+'</div>';document.getElementById('mo').style.display='flex';const bc=sc.querySelector('.bc');if(bc&&f.n)bc.textContent='Home › '+f.n+' › Step '+(si+1)}
function xm(){document.getElementById('mo').style.display='none'}
document.addEventListener('keydown',e=>{if(e.key==='Escape')xm()})
`;

/** Render blueprint to full HTML string. */
export function renderBlueprint(
  blueprint: UiBlueprint,
  _mockData?: PrototypeMockData | null,
  flowsJson?: string
): string {
  const appName = esc(blueprint.appName);
  const screens = blueprint.screens ?? [];
  const flowsForScript = flowsJson ?? JSON.stringify(screens.map((s) => ({ n: s.title, s: (s as ExtendedScreen).flow?.steps ?? [] })));

  const navItems = screens.map((s, i) => ({ id: String(i), label: s.title }));
  const sidebarHtml = renderComponent(
    'SideNav',
    { items: navItems, activeId: 0, appName: blueprint.appName },
    enterpriseDark
  );

  const screensHtml =
    screens.length > 0
      ? screens
          .map((screen, i) => renderScreen(screen as ExtendedScreen, i))
          .join('')
      : `<div class="scr" id="s0" style="display:flex"><div class="scr-in"><div class="wz-wrap wz-empty"><p>No user flows extracted.</p><p class="wz-empty-hint">Add flows to your PRD to see them here.</p></div></div></div>`;

  const modalHtml = renderComponent('Modal', {}, enterpriseDark);
  const tokenCss = presetToCssVariables(enterpriseDark);
  const script = INTERACT_SCRIPT.replace('FLOWS_JSON_PLACEHOLDER', flowsForScript);

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${appName}</title>${DESIGN_SYSTEM_FONTS}<style>${tokenCss}${BLUEPRINT_CSS}</style></head><body>
${sidebarHtml}
<div class="mn">${screensHtml}</div>
${modalHtml}
${FEEDBACK_WIDGET_HTML}
<script>${script}</script>
</body></html>`;
}
