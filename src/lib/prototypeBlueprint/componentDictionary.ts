/**
 * Component dictionary for prototype rendering.
 * Each component renders HTML using token variables only (no raw hex).
 * Presets map screenshot patterns to prop sets.
 */

import type { TokenPreset } from './tokens';

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type ComponentProps = Record<string, unknown>;

/** Render a component by type. Uses tokens only for styling. */
export function renderComponent(
  type: string,
  props: ComponentProps,
  _tokens: TokenPreset
): string {
  switch (type) {
    case 'SideNav':
      return renderSideNav(props);
    case 'TopBar':
      return renderTopBar(props);
    case 'Tabs':
      return renderTabs(props);
    case 'DataTableDense':
      return renderDataTableDense(props);
    case 'StatusPill':
      return renderStatusPill(props);
    case 'SearchInput':
      return renderSearchInput(props);
    case 'Breadcrumb':
      return renderBreadcrumb(props);
    case 'Pagination':
      return renderPagination(props);
    case 'Modal':
      return renderModal(props);
    case 'FilterButton':
      return renderFilterButton(props);
    case 'FilterPopover':
      return renderFilterPopover(props);
    default:
      return `<!-- unknown component: ${esc(type)} -->`;
  }
}

function renderSideNav(props: ComponentProps): string {
  const items = (props.items as Array<{ id: string; label: string }>) ?? [];
  const activeId = (props.activeId as number) ?? 0;
  const appName = esc((props.appName as string) ?? 'Prototype');
  const navItems = items
    .map(
      (item, i) =>
        `<a class="ni${i === activeId ? ' on' : ''}" onclick="go(${i})" data-i="${i}"><span>› ${esc(item.label)}</span></a>`
    )
    .join('');
  return `<div class="sb">
  <div class="sb-h"><h2>${appName}</h2><p>Prototype</p></div>
  <div class="sb-n">${navItems || '<a class="ni on" data-i="0"><span>No sections</span></a>'}</div>
  <div class="sb-col">Collapse sidebar «</div>
  <div class="sb-ft">DK Dejan Krstic</div>
</div>`;
}

function renderTopBar(props: ComponentProps): string {
  const title = esc((props.title as string) ?? '');
  const subtitle = (props.subtitle as string) ?? '';
  const badge = (props.badge as string) ?? 'Music';
  return `<div class="hdr">
  <h1>${title} <span class="edit">✏️</span> <span class="badge">${esc(badge)}</span></h1>
  ${subtitle ? `<p class="sub">${esc(subtitle)}</p>` : ''}
</div>`;
}

function renderTabs(props: ComponentProps): string {
  const tabs = (props.tabs as Array<{ id: string; label: string }>) ?? [];
  const activeId = (props.activeId as string) ?? tabs[0]?.id ?? '';
  const scrIdx = (props.scrIdx as number) ?? 0;
  const tabHtml = tabs
    .map(
      (t) =>
        `<span class="tab${t.id === activeId ? ' on' : ''}" data-tab="${t.id}" onclick="switchTab(${scrIdx},'${t.id}')">${esc(t.label)}</span>`
    )
    .join('');
  return `<div class="tabs">${tabHtml}</div>`;
}

function renderDataTableDense(props: ComponentProps): string {
  const columns = (props.columns as string[]) ?? [];
  const columnKeys = (props.columnKeys as string[] | undefined);
  const rows = (props.rows as Record<string, unknown>[]) ?? [];
  const sortable = (props.sortable as number[]) ?? [];
  const scrIdx = (props.scrIdx as number) ?? 0;
  const tblId = (props.tblId as string) ?? `tbl-${scrIdx}`;
  const headerCells = columns
    .map(
      (col, i) =>
        `<th${sortable.includes(i) ? ` class="th-sort" onclick="sortTable('${tblId}',${i})" title="Sort"` : ''}>${esc(col)}${sortable.includes(i) ? '<span class="sort-icon">↕</span>' : ''}</th>`
    )
    .join('');
  const cellKeys = columnKeys ?? (rows.length > 0 ? Object.keys(rows[0]!) : []);
  const rowCells = (row: Record<string, unknown>) =>
    cellKeys
      .map((k) => {
        const v = row[k];
        if (v && typeof v === 'object' && 'variant' in (v as object)) {
          const pill = v as { variant: string; label: string };
          return `<td><span class="chip chip-${pill.variant}">${esc(pill.label)}</span></td>`;
        }
        return `<td>${esc(String(v ?? '—'))}</td>`;
      })
      .join('');
  const bodyRows = rows
    .map((r) => `<tr class="tbl-row-exp" onclick="openDetail(${scrIdx},this)">${rowCells(r)}</tr>`)
    .join('');
  return `<table class="tbl" id="${tblId}"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
}

function renderStatusPill(props: ComponentProps): string {
  const variant = (props.variant as string) ?? 'pend';
  const label = esc((props.label as string) ?? 'Pending');
  return `<span class="chip chip-${variant}">${label}</span>`;
}

function renderSearchInput(props: ComponentProps): string {
  const placeholder = esc((props.placeholder as string) ?? 'Search...');
  const scrIdx = (props.scrIdx as number) ?? 0;
  return `<div class="search">🔍 <input placeholder="${placeholder}" oninput="filterTable(this,${scrIdx})"/></div>`;
}

function renderBreadcrumb(props: ComponentProps): string {
  const items = (props.items as string[]) ?? ['Home'];
  return `<div class="bc">${items.map((i) => esc(i)).join(' › ')}</div>`;
}

function renderPagination(props: ComponentProps): string {
  const total = (props.total as number) ?? 0;
  const rowsPerPage = (props.rowsPerPage as number) ?? 25;
  const page = (props.page as number) ?? 1;
  const pageStart = (page - 1) * rowsPerPage + 1;
  const pageEnd = Math.min(page * rowsPerPage, total);
  return `<div class="pag">Rows per page: ${rowsPerPage} &nbsp; ${pageStart}-${pageEnd} of ${total} <button>‹</button><button>›</button></div>`;
}

function renderModal(_props: ComponentProps): string {
  return `<div class="mo" id="mo" onclick="if(event.target===this)xm()">
  <div class="mo-c">
    <div class="mo-h"><h3 id="mt"></h3><button class="mo-x" onclick="xm()">✕</button></div>
    <div id="mb"></div>
  </div>
</div>`;
}

function renderFilterButton(props: ComponentProps): string {
  const label = esc((props.label as string) ?? 'Filter');
  return `<button class="filter-btn">${label}</button>`;
}

function renderFilterPopover(_props: ComponentProps): string {
  return `<div class="filter-popover">Filter options</div>`;
}

/** Component type registry for validation */
export const COMPONENT_TYPES = [
  'SideNav',
  'TopBar',
  'Tabs',
  'DataTableDense',
  'StatusPill',
  'SearchInput',
  'Breadcrumb',
  'Pagination',
  'Modal',
  'FilterButton',
  'FilterPopover',
] as const;
