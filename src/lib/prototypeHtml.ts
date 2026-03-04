/**
 * Generates clickable HTML prototypes with completely different layouts per theme.
 * Each theme gets its own navigation pattern, screen structure, and visual style.
 * Matches Figma prompt level of detail: Upload PRD, Problem Statement, Extracted Jobs,
 * Extracted Flows, Summary wizard screens + flow-specific screens.
 */

import { inferStepComponentType, toUserFacingCopy } from './prototypeInference';
import { DESIGN_SYSTEM_CSS, DESIGN_SYSTEM_FONTS, LUCIDE_ICONS, DIAGRAM_CSS, ENTERPRISE_DARK_CSS } from './prototypeDesignSystem';
import { renderDataFlowDiagram, renderArchitectureDiagram } from './prototypeDiagrams';
import { planBlueprint, renderBlueprint } from './prototypeBlueprint';

interface UiThemeInput { description: string; isDark: boolean }

/** Features from regenerate — primaryEntities, primaryActions, etc. */
interface PrototypeFeatures {
  primaryEntities?: string[];
  primaryActions?: string[];
  [key: string]: any;
}

/** Optional LLM-enriched mock data for prototype content */
interface PrototypeMockData {
  tableRows?: Array<{ entity: string; period: string; status: string; amount?: string; [key: string]: unknown }>;
  metrics?: Array<{ label: string; value: string; change: string }>;
  recommendations?: Array<{ title: string; desc: string; priority: string }>;
}

/** Full CPM context passed to all prototype layouts */
interface CpmContext {
  appName: string;
  jobs: any[];
  flows: any[];
  problem: string;
  outcome: string;
  openQuestions: string[];
  prototypeType: string;
}


/** Options for URL-based navigation (browser back) and viewport toggle */
export interface PrototypeOptions {
  baseUrl?: string;
  screenId?: number;
  viewport?: 'web' | 'mobile';
}

export function generatePrototypeHtml(cpm: any, theme: UiThemeInput, features?: PrototypeFeatures, mockData?: PrototypeMockData | null, designSystemOverride?: string, options?: PrototypeOptions): string {
  const rawDocName = cpm?.meta?.source?.document_name?.replace(/\.[^.]+$/, '') ?? 'Prototype';
  const appName = (cpm?.meta?.name ?? rawDocName)
    .replace(/^Product Brief[:\s]*/i, '')
    .replace(/^PRD[:\s]*/i, '')
    .replace(/^\[RESTRICTED\]\s*/i, '')
    .split(/[-_]/)
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .slice(0, 50);
  const jobs = cpm?.jobs ?? [];
  const flows = cpm?.flows ?? [];
  const problem = cpm?.intent?.problem?.statement ?? '';
  const outcome = cpm?.intent?.goal?.primary_outcome ?? '';
  const openQuestions = cpm?.review?.open_questions ?? cpm?.open_questions ?? [];
  const prototypeType = (cpm?.prototype?.strategy?.recommended_type ?? 'clickable_ui').replace(/_/g, ' ');

  const ctx: CpmContext = { appName, jobs, flows, problem, outcome, openQuestions, prototypeType };

  const desc = theme.description?.toLowerCase() ?? '';
  const isFinanceApp = features?.isFinanceApp ?? false;

  // Include appName in corpus so brand detection works even if brand only appears in filename
  const corpus = `${appName} ${problem} ${outcome} ${jobs.map((j: any) => j?.description ?? '').join(' ')} ${flows.map((f: any) => (f?.steps ?? []).map((s: any) => `${s?.action ?? ''} ${s?.result ?? ''}`).join(' ')).join(' ')}`.toLowerCase();

  // Detect app domain from content (incl. app name), NOT theme description
  const isSocial = /\b(?:instagram|tiktok|snapchat|twitter|discord)\b|social\s*feed|stories|reels|creator.*post|post.*creator/i.test(corpus);
  const isMarketplace = /\b(?:airbnb|uber|lyft|shopify|amazon|ebay|etsy|doordash|booking\.com)\b|marketplace|listing|seller|buyer|host|guest|reservation|check[\s-]*in|property|rental|lodging/i.test(corpus);
  const isProductivity = /\b(?:slack|notion|linear|jira|asana|trello|monday)\b|project\s*management|task\s*board|kanban|sprint|backlog/i.test(corpus);
  // Mobile consumer apps: content-streaming, fitness, health, music — where phone-frame makes sense
  const hasMobileContent = /\b(?:stream|playlist|album|episode|workout|guided\s*session|meditation|recipe)\b/i.test(corpus);
  const hasMobileVerbs = /\b(?:play|watch|listen|stream|browse\s*(?:workout|video|episode|content))\b/i.test(corpus);
  const isMobileConsumer = hasMobileContent && hasMobileVerbs;

  // flowsJson: flow data for step() modal — build once for blueprint or legacy
  const flowsJson = JSON.stringify(flows.map((f: any) => ({
    n: f?.name ?? '',
    s: (f?.steps ?? []).map((s: any) => ({ a: s?.actor_id ?? '', x: s?.action ?? '', r: s?.result ?? '' })),
  })));

  // User override or auto-detect: use UI Blueprint pipeline for Enterprise Dark / Finance
  const override = (designSystemOverride ?? '').toLowerCase().replace(/\s+/g, '_');
  const useBlueprint = override === 'enterprise_dark' || isFinanceApp;

  if (useBlueprint) {
    const blueprint = planBlueprint({ cpm, theme, features });
    return renderBlueprint(blueprint, mockData, flowsJson);
  }

  // Flow screens (from CPM flows)
  const flowScreens = flows.map((flow: any, i: number) => {
    const name = flow?.name ?? `Flow ${i + 1}`;
    const steps = flow?.steps ?? [];
    const job = jobs.find((j: any) => flow?.linked_jobs?.includes(j.job_id));
    return { name, steps, job, i };
  });

  // Theme-specific prototypes take priority
  // Instagram / social consumer apps get a phone-frame prototype (takes priority over strategy)
  const isInstagram = /instagram/i.test(desc) || /instagram|reels/i.test(corpus);
  if (isInstagram) return instagramPrototype(ctx, flowScreens, flowsJson, options);

  // Strategy/scope docs with DoD-derived flows get a rich interactive prototype
  const isStrategyDoc = flows.some((f: any) => f?.flow_id?.startsWith('flow_dod_'));
  // Document-agnostic: use rich UI when steps infer to app components (grid, player, search, etc.)
  const hasAppStyleSteps = flows.some((f: any) => {
    const steps = f?.steps ?? [];
    const allText = steps.map((s: any) => `${s?.action ?? ''} ${s?.result ?? ''}`).join(' ');
    return steps.some((s: any) => {
      const t = inferStepComponentType(s?.action ?? '', s?.result ?? '', allText);
      return ['content_grid', 'category_grid', 'media_player', 'search', 'recommendations', 'program_cards', 'access_gate', 'progress_tracker'].includes(t);
    });
  });
  const shouldUseStrategyPrototype = isStrategyDoc || hasAppStyleSteps;

  // Domain-specific prototypes always take priority
  if (isSocial) return socialPrototype(ctx, flowScreens, flowsJson, desc);
  if (isMarketplace) return marketplacePrototype(ctx, flowScreens, flowsJson, desc);
  if (isProductivity) return productivityPrototype(ctx, flowScreens, flowsJson, desc);

  // Phone-frame mobile prototype only for genuine mobile/consumer apps (music, video, fitness, health, etc.)
  if (shouldUseStrategyPrototype && isMobileConsumer) {
    return mobileAppPrototype(ctx, flowScreens, flowsJson, options);
  }

  // Generic strategy/scope docs get the sidebar dashboard
  if (shouldUseStrategyPrototype) return strategyPrototype(ctx, flowScreens, flowsJson, cpm, options);

  return consumerPrototype(ctx, flowScreens, flowsJson, desc);
}

function esc(s: string): string { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }

// =====================================================
// WIZARD SCREENS (Figma-level detail: Upload PRD, Problem Statement, Jobs, Flows, Summary)
// =====================================================
interface ThemeColors { accent: string; bg: string; surface: string; text: string; muted: string; border: string; success: string; warning: string }


const FEEDBACK_WIDGET_HTML = `<div class="wz-feedback" id="wz-feedback"><span>Done! How does this look?</span><button class="wz-fb-btn" title="Thumbs up">👍</button><button class="wz-fb-btn" title="Thumbs down">👎</button><button class="wz-fb-close" onclick="document.getElementById('wz-feedback')?.remove()">✕</button></div>`;

function wizardScreenStyles(t: ThemeColors): string {
  return `.wz-sec{margin-bottom:24px}.wz-sec h3{font-size:14px;font-weight:600;color:${t.text};margin-bottom:4px}.wz-desc{font-size:13px;color:${t.muted};margin-bottom:10px;line-height:1.5}
.wz-text-block{font-size:14px;color:${t.text};line-height:1.6;max-width:640px}
.wz-upload{background:${t.success};color:#fff;padding:14px 20px;border-radius:8px;display:flex;align-items:center;gap:12px;font-weight:600}.wz-upload .wz-check{color:#fff}.wz-upload-status{margin-right:4px}.wz-upload-success{opacity:.95;font-weight:500}.wz-check{color:${t.success};font-weight:700}
.wz-runs{display:flex;gap:12px}.wz-run{padding:12px 16px;border:1px solid ${t.border};border-radius:8px;cursor:pointer;background:${t.surface}}.wz-run.on{border-color:${t.accent};background:rgba(59,130,246,.08)}.wz-run-date,.wz-run-label{font-size:11px;color:${t.muted}}
.wz-extractions{display:flex;flex-direction:column;gap:8px}.wz-ext{display:flex;align-items:center;gap:8px;padding:8px 0}.wz-ext-rich .wz-ext-item{display:flex;align-items:flex-start;gap:10px;padding:10px 0}.wz-ext-item strong{font-size:13px}.wz-ext-desc{font-size:12px;color:${t.muted};display:block;margin-top:2px}.wz-actions{display:flex;gap:8px;margin-top:12px}
.wz-btn{padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer;border:none;background:${t.accent};color:#fff}.wz-btn.sec{background:transparent;border:1px solid ${t.border};color:${t.text}}
.wz-metrics{display:flex;gap:24px;padding:16px 0;border-top:1px solid ${t.border}}.wz-metric{text-align:center}.wz-mval{font-size:28px;font-weight:700;color:${t.text};max-width:120px;overflow:hidden;text-overflow:ellipsis}.wz-mlbl{font-size:12px;color:${t.muted}}
.wz-output-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px}.wz-success-line{font-size:14px;color:${t.success};font-weight:500}
.wz-textarea{width:100%;padding:10px 12px;border:1px solid ${t.border};border-radius:6px;background:${t.surface};color:${t.text};font-family:inherit;font-size:14px;resize:vertical}
.wz-type-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.wz-type-card{padding:14px;border:1px solid ${t.border};border-radius:8px;cursor:pointer;background:${t.surface}}.wz-type-card.on{border-color:${t.accent};background:rgba(59,130,246,.08)}
.wz-type-name{font-weight:600;color:${t.text}}.wz-type-desc{font-size:12px;color:${t.muted};margin-top:4px}.wz-auto-badge{display:inline-block;background:rgba(59,130,246,.15);color:${t.accent};padding:2px 10px;border-radius:10px;font-size:11px;margin-bottom:10px}
.wz-oq-card{display:flex;align-items:center;gap:12px;padding:12px 16px;background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;margin-bottom:8px}.wz-oq-badge{background:#EF4444;color:#fff;padding:1px 8px;border-radius:10px;font-size:10px;font-weight:700}
.wz-oq-text{flex:1;font-size:13px}.wz-btn.resolve{background:#10B981;padding:4px 12px;font-size:12px}.wz-none{color:${t.muted};font-style:italic}
.wz-empty{padding:40px 24px;text-align:center;color:${t.muted}}.wz-empty p{margin-bottom:8px}.wz-empty-hint{font-size:12px;color:${t.muted};opacity:.8}
.wz-title{font-size:22px;font-weight:700;color:${t.text};margin-bottom:20px}
.wz-job-card{border:1px solid ${t.border};border-radius:8px;padding:16px;margin-bottom:16px;background:${t.surface}}.wz-job-hdr{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.wz-job-id{font-size:11px;color:${t.muted}}.wz-job-id-in{border:0;background:0;color:${t.text};font-size:13px;flex:1}.wz-job-prio select{padding:4px 8px;border-radius:4px}.wz-del{background:0;border:0;color:${t.muted};cursor:pointer;font-size:16px}
.wz-job-f{margin-bottom:10px}.wz-job-f label{display:block;font-size:11px;color:${t.muted};margin-bottom:2px}.wz-textarea.sm{rows:1;min-height:36px}
.wz-flow-block{margin-bottom:24px}.wz-flow-name{font-size:16px;font-weight:600;color:${t.text};margin-bottom:12px}.wz-flow-steps{display:flex;flex-direction:column;gap:4px}
.wz-flow-step{display:flex;align-items:flex-start;gap:8px;padding:8px 12px;border-radius:6px;background:${t.surface};border:1px solid ${t.border}}.wz-step-num{width:24px;text-align:center;font-weight:600;color:${t.accent}}
.wz-step-arrows{font-size:12px;color:${t.muted};cursor:pointer}.wz-step-body{flex:1}.wz-step-actor{font-size:11px;font-weight:700;color:${t.accent};margin-right:8px}.wz-step-action{font-size:13px;color:${t.text}}
.wz-step-result{font-size:12px;color:${t.muted};font-style:italic;margin-left:4px}.wz-btn.add-step{margin-top:8px}
.wz-status-bar{height:8px;background:${t.border};border-radius:4px;overflow:hidden;margin-bottom:8px}.wz-status-fill{height:100%;background:${t.success};transition:width .3s}
.wz-alignment{display:flex;gap:8px;margin-bottom:12px}.wz-chip{padding:4px 12px;border-radius:10px;font-size:12px;font-weight:600}.wz-chip.ok{background:rgba(16,185,129,.2);color:#10B981}.wz-chip.warn{background:${t.warning};color:#92400E}
.wz-list{margin:0;padding-left:20px}.wz-list li{margin-bottom:8px;font-size:14px;color:${t.text};line-height:1.5}
.wz-job-li .wz-job-outcome{font-weight:400;color:${t.muted};font-size:13px}.wz-flow-steps{font-size:12px;color:${t.muted}}
.wz-rec-prio{font-size:10px;font-weight:600;text-transform:uppercase;padding:2px 6px;border-radius:4px;margin-left:4px}.wz-rec-prio.high{background:rgba(239,68,68,.2);color:#DC2626}.wz-rec-prio.medium{background:rgba(245,158,11,.2);color:#D97706}.wz-rec-prio.low{background:rgba(59,130,246,.2)}
body{font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
.wz-feedback{position:fixed;bottom:24px;right:24px;background:#1f2937;color:#fff;padding:12px 16px;border-radius:12px;display:flex;align-items:center;gap:8px;box-shadow:0 4px 20px rgba(0,0,0,.25);z-index:50;font-size:14px}.wz-fb-btn,.wz-fb-close{background:0;border:0;color:#9ca3af;cursor:pointer;font-size:18px;padding:0 4px}.wz-fb-btn:hover,.wz-fb-close:hover{color:#fff}`;
}

// Enterprise prototypes use the blueprint pipeline (planBlueprint + renderBlueprint).

// =====================================================
// MOBILE APP PROTOTYPE (phone-frame, dark theme, flow-based screens)
function mobileAppPrototype(ctx: CpmContext, flowScreens: any[], flowsJson: string, options?: PrototypeOptions): string {
  const productName = ctx.appName.replace(/strategy.*|scope.*|\blaunch\s*/ig, '').trim() || ctx.appName;
  const shortName = productName.length > 20 ? productName.slice(0, 20) : productName;
  const jobsText = (ctx.jobs ?? []).map((j: any) => `${j.description ?? ''} ${j.trigger ?? ''} ${j.success_outcome ?? ''}`).join(' ');
  const flowsText = (ctx.flows ?? []).map((f: any) => (f?.steps ?? []).map((s: any) => `${s?.action ?? ''} ${s?.result ?? ''} ${s?.actor_id ?? ''}`).join(' ')).join(' ');
  const corpus = `${ctx.problem ?? ''} ${ctx.outcome ?? ''} ${jobsText} ${flowsText}`;
  const entities = extractDocEntities(corpus);

  const accent = '#00D4AA';
  const vp = options?.viewport ?? 'mobile';
  const base = options?.baseUrl;
  const vpTarget = base ? '_parent' : '_self';

  type AppScreen = { id: number; label: string; screenType: string; content: string };
  const screens: AppScreen[] = [];

  const categories = entities.categories.length > 0 ? entities.categories.slice(0, 6) : (ctx.flows ?? []).map((f: any) => f?.name ?? '').filter(Boolean).slice(0, 6);
  const flowNames = flowScreens.map((f: any) => f.name ?? '');
  const allJobs = ctx.jobs ?? [];
  const jobOutcomes = allJobs.map((j: any) => j?.success_outcome ?? '').filter(Boolean);
  const jobDescriptions = allJobs.map((j: any) => j?.description ?? '').filter(Boolean);

  const categoryPills = ['All', ...categories.slice(0, 3)];

  // Derive a smart content summary from the problem/outcome
  const promoSubtext = (ctx.outcome || ctx.problem || '').slice(0, 60) || `Your ${entities.itemLabel}s, optimized.`;

  // Classify each flow into a screen type based on its content
  function classifyFlow(flow: any): string {
    const steps: any[] = flow.steps ?? [];
    const flowName: string = flow.name ?? '';
    const allText = `${flowName} ${steps.map((s: any) => `${s?.action ?? ''} ${s?.result ?? ''}`).join(' ')}`;
    const lower = allText.toLowerCase();

    if (/dashboard|overview|summar|home|check.*perform|early.*perform|monitor/i.test(lower)) return 'dashboard';
    if (/analyz|breakdown|driver|factor|deep.*dive|understand.*why|insight|retention|engagement/i.test(lower)) return 'analytics';
    if (/recommend|suggest|improv|action|tip|next.*step|optimi/i.test(lower)) return 'actions';
    if (/browse|discover|find|search|explore|catalog|select/i.test(lower)) return 'browse';
    if (/detail|view.*(?:video|content|item)|episode|page|metadata/i.test(lower)) return 'detail';
    if (/confirm|complete|success|motiv|learn|encourage|reassur|celebrat|achiev/i.test(lower)) return 'completion';
    if (/setting|config|prefer|profile|account/i.test(lower)) return 'settings';
    if (/create|post|upload|publish|edit|compose/i.test(lower)) return 'create';
    return 'feature';
  }

  // Build items from flow steps for list displays
  function stepsToListItems(steps: any[]): { title: string; subtitle: string }[] {
    return steps.map((s: any) => ({
      title: toUserFacingCopy(s?.action ?? '', 50),
      subtitle: toUserFacingCopy(s?.result ?? '', 80),
    })).filter(item => item.title.length > 0);
  }

  // Generate metric cards from job outcomes
  function generateMetrics(): { value: string; label: string }[] {
    const metrics: { value: string; label: string }[] = [];
    const outcomeText = jobOutcomes.join(' ').toLowerCase();

    if (/view|watch|impression|reach/i.test(outcomeText)) metrics.push({ value: '2.4K', label: 'Views' });
    if (/engage|like|comment|interact|reaction/i.test(outcomeText)) metrics.push({ value: '18%', label: 'Engagement' });
    if (/retain|retention|return|churn/i.test(outcomeText)) metrics.push({ value: '92%', label: 'Retention' });
    if (/perform|score|rating/i.test(outcomeText)) metrics.push({ value: '8.5', label: 'Score' });
    if (/time|duration|speed|hour|minute/i.test(outcomeText)) metrics.push({ value: '4.2m', label: 'Avg. Time' });
    if (/grow|growth|increase|boost/i.test(outcomeText)) metrics.push({ value: '+24%', label: 'Growth' });
    if (/post|content|creat/i.test(outcomeText)) metrics.push({ value: '47', label: 'Posts' });
    if (/follow|subscri|audience/i.test(outcomeText)) metrics.push({ value: '1.2K', label: 'Followers' });

    if (metrics.length < 3) {
      const defaults = [
        { value: '1.8K', label: 'Total' },
        { value: '73%', label: 'Rate' },
        { value: '+12%', label: 'Change' },
      ];
      for (const d of defaults) { if (metrics.length < 4 && !metrics.find(m => m.label === d.label)) metrics.push(d); }
    }
    return metrics.slice(0, 4);
  }

  for (let fi = 0; fi < flowScreens.length; fi++) {
    const flow = flowScreens[fi];
    const steps: any[] = flow.steps ?? [];
    const flowName: string = flow.name ?? `Screen ${fi + 1}`;
    const screenType = classifyFlow(flow);
    const linkedJob = flow.job;
    const jobOutcome = linkedJob?.success_outcome ?? '';
    const items = stepsToListItems(steps);

    const label = flowName.replace(/^(?:DoD\s*\d+[:\-\s]*|flow_dod_\d+[:\-\s]*)/i, '').trim().slice(0, 20) || flowName.slice(0, 20);

    let content = '';
    switch (screenType) {
      case 'dashboard': {
        const metrics = generateMetrics();
        const metricCards = metrics.map((m, mi) =>
          `<div style="background:#1a1a2e;border-radius:12px;padding:16px;text-align:center;flex:1;min-width:0">
            <div style="font-size:22px;font-weight:700;color:${accent}">${m.value}</div>
            <div style="font-size:11px;color:#b3b3b3;margin-top:4px;text-transform:uppercase;letter-spacing:.05em">${esc(m.label)}</div>
          </div>`
        ).join('');
        const stepCards = items.map((item, si) =>
          `<div style="background:#181818;border-radius:12px;padding:14px 16px;display:flex;align-items:center;gap:14px;margin-bottom:8px;cursor:pointer">
            <div style="width:40px;height:40px;border-radius:8px;background:rgba(0,212,170,.12);display:flex;align-items:center;justify-content:center;color:${accent};font-size:16px;font-weight:700;flex-shrink:0">${si + 1}</div>
            <div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(item.title)}</div>${item.subtitle ? `<div style="font-size:12px;color:#b3b3b3;margin-top:2px">${esc(item.subtitle)}</div>` : ''}</div>
            <span style="color:#b3b3b3;font-size:14px">›</span>
          </div>`
        ).join('');
        content = `<div style="padding:16px 20px">
          <div style="display:flex;align-items:center;margin-bottom:16px"><h2 style="font-size:20px;font-weight:700;color:#fff;flex:1">${esc(label)}</h2><span style="font-size:18px;color:#b3b3b3">⚙</span></div>
          <div style="display:grid;grid-template-columns:repeat(${Math.min(metrics.length, 2)},1fr);gap:8px;margin-bottom:20px">${metricCards}</div>
          ${jobOutcome ? `<div style="background:linear-gradient(135deg,#1a2a3a,#0d1f2e);border-radius:12px;padding:14px 16px;margin-bottom:16px"><div style="font-size:11px;color:${accent};font-weight:600;text-transform:uppercase;margin-bottom:4px">Goal</div><div style="font-size:14px;color:#fff">${esc(jobOutcome.slice(0, 100))}</div></div>` : ''}
          ${stepCards}
        </div>`;
        break;
      }
      case 'analytics': {
        const metrics = generateMetrics();
        const barData = items.slice(0, 5).map((item, i) => {
          const pct = 90 - i * 15;
          return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
            <div style="font-size:12px;color:#b3b3b3;width:80px;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(item.title.slice(0, 20))}</div>
            <div style="flex:1;height:24px;background:#1a1a2e;border-radius:6px;overflow:hidden"><div style="height:100%;width:${pct}%;background:linear-gradient(90deg,${accent},rgba(0,212,170,.4));border-radius:6px;display:flex;align-items:center;padding-left:8px;font-size:11px;font-weight:600;color:#000">${pct}%</div></div>
          </div>`;
        }).join('');
        content = `<div style="padding:16px 20px">
          <div style="display:flex;align-items:center;margin-bottom:16px"><span onclick="history.back()" style="cursor:pointer;font-size:20px;margin-right:12px;color:#fff">←</span><h2 style="font-size:20px;font-weight:700;color:#fff;flex:1">${esc(label)}</h2></div>
          <div style="display:flex;gap:8px;margin-bottom:16px">${metrics.slice(0, 3).map((m, i) => `<div style="flex:1;background:#1a1a2e;border-radius:10px;padding:12px;text-align:center"><div style="font-size:18px;font-weight:700;color:${i === 0 ? accent : '#fff'}">${m.value}</div><div style="font-size:10px;color:#b3b3b3;margin-top:2px">${esc(m.label)}</div></div>`).join('')}</div>
          <div style="background:#181818;border-radius:12px;padding:16px;margin-bottom:16px">
            <div style="font-size:14px;font-weight:600;color:#fff;margin-bottom:12px">Performance Breakdown</div>
            ${barData}
          </div>
          ${jobOutcome ? `<div style="background:#181818;border-radius:12px;padding:14px 16px"><div style="font-size:12px;color:${accent};margin-bottom:4px">💡 Insight</div><div style="font-size:13px;color:#e0e0e0;line-height:1.5">${esc(jobOutcome.slice(0, 120))}</div></div>` : ''}
        </div>`;
        break;
      }
      case 'actions': {
        const actionCards = items.map((item, si) =>
          `<div style="background:#181818;border-radius:12px;padding:16px;margin-bottom:10px;display:flex;align-items:flex-start;gap:14px;cursor:pointer">
            <div style="width:40px;height:40px;border-radius:10px;background:${GRADIENT_PALETTE[si % GRADIENT_PALETTE.length]};display:flex;align-items:center;justify-content:center;font-size:18px;color:rgba(255,255,255,.9);flex-shrink:0">${['💡', '🎯', '📊', '⚡', '🔄'][si % 5]}</div>
            <div style="flex:1"><div style="font-size:14px;font-weight:600;color:#fff;margin-bottom:4px">${esc(item.title)}</div>${item.subtitle ? `<div style="font-size:13px;color:#b3b3b3;line-height:1.4">${esc(item.subtitle)}</div>` : ''}</div>
          </div>`
        ).join('');
        content = `<div style="padding:16px 20px">
          <div style="display:flex;align-items:center;margin-bottom:4px"><span onclick="history.back()" style="cursor:pointer;font-size:20px;margin-right:12px;color:#fff">←</span><h2 style="font-size:20px;font-weight:700;color:#fff;flex:1">${esc(label)}</h2></div>
          ${jobOutcome ? `<div style="font-size:13px;color:#b3b3b3;margin-bottom:16px">${esc(jobOutcome.slice(0, 100))}</div>` : ''}
          ${actionCards}
          <button style="background:${accent};color:#000;border:0;border-radius:24px;padding:14px;font-size:15px;font-weight:700;width:100%;cursor:pointer;margin-top:12px">Apply All</button>
        </div>`;
        break;
      }
      case 'browse': {
        const catCards = categories.map((cat, ci) =>
          `<div style="background:${GRADIENT_PALETTE[ci % GRADIENT_PALETTE.length]};border-radius:8px;padding:16px;flex:1;min-width:calc(50% - 6px)"><div style="font-size:15px;font-weight:700;color:#fff">${esc(cat)}</div><div style="font-size:12px;color:rgba(255,255,255,.7);margin-top:2px">${Math.floor(80 + Math.random() * 200)} ${entities.itemLabel}s</div></div>`
        ).join('');
        const popularItems = categories.slice(0, 3).map((_, i) =>
          `<div style="background:${GRADIENT_PALETTE[(i + 2) % GRADIENT_PALETTE.length]};border-radius:8px;min-width:140px;height:80px;flex-shrink:0"></div>`
        ).join('');
        content = `<div style="padding:16px 20px">
          <div style="display:flex;align-items:center;margin-bottom:16px"><span onclick="history.back()" style="cursor:pointer;font-size:20px;margin-right:12px;color:#fff">←</span><h2 style="font-size:22px;font-weight:700;color:#fff;flex:1">${esc(shortName)}</h2><span style="font-size:20px;color:#b3b3b3;cursor:pointer">🔍</span></div>
          <h3 style="font-size:16px;font-weight:700;color:#fff;margin-bottom:12px">Categories</h3>
          <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:24px">${catCards}</div>
          <h3 style="font-size:16px;font-weight:700;color:#fff;margin-bottom:12px">Trending</h3>
          <div style="display:flex;gap:12px;overflow-x:auto;margin-bottom:24px;padding-bottom:4px">${popularItems}</div>
        </div>`;
        break;
      }
      case 'detail': {
        const stepContent = items.map((item, si) =>
          `<div style="display:flex;align-items:flex-start;gap:12px;padding:12px 0;${si < items.length - 1 ? 'border-bottom:1px solid #282828' : ''}">
            <div style="width:36px;height:36px;border-radius:8px;background:${GRADIENT_PALETTE[si % GRADIENT_PALETTE.length]};display:flex;align-items:center;justify-content:center;font-size:14px;color:rgba(255,255,255,.9);flex-shrink:0">${si + 1}</div>
            <div><div style="font-size:14px;font-weight:600;color:#fff">${esc(item.title)}</div>${item.subtitle ? `<div style="font-size:12px;color:#b3b3b3;margin-top:2px">${esc(item.subtitle)}</div>` : ''}</div>
          </div>`
        ).join('');
        content = `<div>
          <div style="background:${GRADIENT_PALETTE[fi % GRADIENT_PALETTE.length]};aspect-ratio:16/9;position:relative;display:flex;align-items:center;justify-content:center">
            <span onclick="history.back()" style="position:absolute;top:16px;left:16px;cursor:pointer;font-size:18px;color:#fff;background:rgba(0,0,0,.4);width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center">←</span>
            <div style="font-size:24px;color:rgba(255,255,255,.6)">📋</div>
          </div>
          <div style="padding:20px">
            <h2 style="font-size:22px;font-weight:700;color:#fff;margin-bottom:8px">${esc(label)}</h2>
            ${jobOutcome ? `<div style="font-size:13px;color:#b3b3b3;margin-bottom:16px;line-height:1.5">${esc(jobOutcome.slice(0, 120))}</div>` : ''}
            ${stepContent}
          </div>
        </div>`;
        break;
      }
      case 'completion': {
        const successMsg = jobOutcome || (ctx.outcome ?? '').slice(0, 80) || 'You\'re making great progress!';
        const metrics = generateMetrics().slice(0, 3);
        const statsRow = metrics.map(m =>
          `<div style="text-align:center"><div style="font-size:12px;color:#727272;margin-bottom:4px">📊</div><div style="font-size:22px;font-weight:700;color:#fff">${m.value}</div><div style="font-size:11px;color:#b3b3b3">${esc(m.label)}</div></div>`
        ).join('');
        content = `<div style="padding:40px 20px;text-align:center;display:flex;flex-direction:column;align-items:center">
          <div style="width:80px;height:80px;border-radius:50%;background:${accent};display:flex;align-items:center;justify-content:center;font-size:36px;color:#000;margin-bottom:20px">✓</div>
          <h2 style="font-size:24px;font-weight:700;color:#fff;margin-bottom:12px">${esc(successMsg.slice(0, 50))}</h2>
          <div style="display:flex;gap:24px;margin-bottom:28px;justify-content:center">${statsRow}</div>
          <div style="position:relative;width:120px;height:120px;margin-bottom:8px">
            <svg viewBox="0 0 120 120" width="120" height="120"><circle cx="60" cy="60" r="52" fill="none" stroke="#282828" stroke-width="8"/><circle cx="60" cy="60" r="52" fill="none" stroke="${accent}" stroke-width="8" stroke-dasharray="${2 * Math.PI * 52 * 0.7} ${2 * Math.PI * 52 * 0.3}" stroke-linecap="round" transform="rotate(-90 60 60)"/></svg>
            <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center"><div style="font-size:24px;font-weight:700;color:#fff">70%</div><div style="font-size:10px;color:#b3b3b3">progress</div></div>
          </div>
          <div style="font-size:13px;color:${accent};margin-bottom:24px">${esc(promoSubtext)}</div>
          <button style="background:#282828;color:#fff;border:0;border-radius:24px;padding:14px 32px;font-size:15px;font-weight:600;width:100%;max-width:300px;cursor:pointer;margin-bottom:10px">Share</button>
          <button style="background:${accent};color:#000;border:0;border-radius:24px;padding:14px 32px;font-size:15px;font-weight:700;width:100%;max-width:300px;cursor:pointer">Done</button>
        </div>`;
        break;
      }
      case 'create': {
        const fields = items.map((item, si) =>
          `<div style="margin-bottom:16px">
            <div style="font-size:12px;color:#b3b3b3;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">${esc(item.title.slice(0, 30))}</div>
            <div style="background:#282828;border-radius:10px;padding:12px 16px;color:#727272;font-size:14px">${esc(item.subtitle || 'Enter...')}</div>
          </div>`
        ).join('');
        content = `<div style="padding:16px 20px">
          <div style="display:flex;align-items:center;margin-bottom:16px"><span onclick="history.back()" style="cursor:pointer;font-size:20px;margin-right:12px;color:#fff">←</span><h2 style="font-size:20px;font-weight:700;color:#fff;flex:1">${esc(label)}</h2></div>
          ${fields}
          <button style="background:${accent};color:#000;border:0;border-radius:24px;padding:14px;font-size:15px;font-weight:700;width:100%;cursor:pointer;margin-top:8px">Submit</button>
        </div>`;
        break;
      }
      default: {
        const stepsHtml = steps.map((st: any, si: number) => {
          const action = st?.action ?? '';
          const result = st?.result ?? '';
          return `<div style="background:#181818;border-radius:12px;padding:16px;display:flex;align-items:flex-start;gap:14px;margin-bottom:12px">
            <div style="width:40px;height:40px;border-radius:8px;background:rgba(0,212,170,.12);display:flex;align-items:center;justify-content:center;color:${accent};font-size:16px;font-weight:700;flex-shrink:0">${si + 1}</div>
            <div><div style="font-size:14px;font-weight:600;color:#fff;margin-bottom:4px">${esc(toUserFacingCopy(action, 50))}</div>${result ? `<div style="font-size:13px;color:#b3b3b3">${esc(toUserFacingCopy(result, 80))}</div>` : ''}</div>
          </div>`;
        }).join('');
        content = `<div style="padding:16px 20px">
          <div style="display:flex;align-items:center;margin-bottom:16px"><span onclick="history.back()" style="cursor:pointer;font-size:20px;margin-right:12px;color:#fff">←</span><h2 style="font-size:20px;font-weight:700;color:#fff;flex:1">${esc(label)}</h2></div>
          ${stepsHtml}
        </div>`;
        break;
      }
    }

    screens.push({ id: fi, label, screenType, content });
  }

  // Build home screen from CPM summary
  const quickCards = flowScreens.slice(0, 6).map((flow: any, fi: number) =>
    `<div onclick="go(${fi + 1})" style="background:${GRADIENT_PALETTE[fi % GRADIENT_PALETTE.length]};border-radius:6px;padding:10px 14px;display:flex;align-items:center;gap:10px;cursor:pointer"><div style="width:40px;height:40px;border-radius:4px;background:rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center;font-size:14px">${inferFlowIcon(flow)}</div><span style="font-size:13px;font-weight:600;color:#fff">${esc((flow.name ?? '').replace(/^(?:DoD\s*\d+[:\-\s]*)/i, '').slice(0, 22))}</span></div>`
  ).join('');

  const jobCards = allJobs.slice(0, 3).map((j: any, ji: number) =>
    `<div style="background:#181818;border-radius:12px;padding:14px 16px;margin-bottom:8px;cursor:pointer">
      <div style="font-size:14px;font-weight:600;color:#fff;margin-bottom:4px">${esc((j.description ?? '').slice(0, 60))}</div>
      <div style="font-size:12px;color:#b3b3b3">${esc((j.success_outcome ?? '').slice(0, 80))}</div>
    </div>`
  ).join('');

  const homeContent = `<div style="padding:16px 20px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px"><h2 style="font-size:24px;font-weight:700;color:#fff">${esc(shortName)}</h2><div style="display:flex;gap:16px"><span style="font-size:18px;color:#b3b3b3">🔔</span><span style="font-size:18px;color:#b3b3b3">⚙</span></div></div>
    <div style="display:flex;gap:8px;margin-bottom:16px;overflow-x:auto">${categoryPills.map((c, i) => `<span style="padding:8px 16px;border-radius:20px;font-size:13px;font-weight:600;white-space:nowrap;${i === 0 ? 'background:' + accent + ';color:#000' : 'background:#282828;color:#fff'}">${esc(c)}</span>`).join('')}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px">${quickCards}</div>
    <div style="background:linear-gradient(135deg,#1a3a2a,${accent});border-radius:12px;padding:16px 20px;margin-bottom:24px"><span style="font-size:11px;color:${accent};font-weight:700">✨ NEW</span><h3 style="font-size:20px;font-weight:700;color:#fff;margin-top:6px">${esc(shortName)}</h3><p style="font-size:13px;color:rgba(255,255,255,.7);margin-top:4px">${esc(promoSubtext)}</p></div>
    <h3 style="font-size:16px;font-weight:700;color:#fff;margin-bottom:12px">Your Journey</h3>
    ${jobCards}
  </div>`;
  screens.unshift({ id: -1, label: 'Home', screenType: 'home', content: homeContent });

  screens.forEach((s, i) => { s.id = i; });

  const activeScreen = Math.min(options?.screenId ?? 0, Math.max(screens.length - 1, 0));
  const screenTabsHtml = screens.map((s, i) => {
    const isOn = i === activeScreen;
    const href = base !== undefined ? `${base || ''}?screen=${i}&viewport=${vp}` : `javascript:go(${i})`;
    const target = base !== undefined ? vpTarget : '';
    return `<a class="stab${isOn ? ' on' : ''}" ${base !== undefined ? `href="${href}" target="${target}"` : `onclick="go(${i})"`}>${esc(s.label)}</a>`;
  }).join('');

  const vpToggleHtml = base !== undefined
    ? `<div class="vp-row"><a class="vp-btn${vp === 'mobile' ? ' on' : ''}" href="${base || ''}?screen=${activeScreen}&viewport=mobile" target="${vpTarget}">Mobile</a><a class="vp-btn${vp === 'web' ? ' on' : ''}" href="${base || ''}?screen=${activeScreen}&viewport=web" target="${vpTarget}">Web</a></div>`
    : `<div class="vp-row"><a class="vp-btn on">Mobile</a><a class="vp-btn">Web</a></div>`;

  const phoneScreensHtml = screens.map((s, i) =>
    `<div class="pscr" id="s${i}" style="display:${i === activeScreen ? 'flex' : 'none'};flex-direction:column;height:100%">${s.content}</div>`
  ).join('');

  // Dynamic bottom nav based on detected features
  const navItems: { icon: string; label: string }[] = [{ icon: '🏠', label: 'Home' }];
  if (/search|find|discover|explore/i.test(corpus)) navItems.push({ icon: '🔍', label: 'Search' });
  if (/analytic|insight|report|dashboard|perform/i.test(corpus)) navItems.push({ icon: '📊', label: 'Insights' });
  if (/create|post|upload|compose|publish/i.test(corpus)) navItems.push({ icon: '➕', label: 'Create' });
  if (/profile|account|setting/i.test(corpus)) navItems.push({ icon: '👤', label: 'Profile' });
  if (navItems.length < 3) navItems.push({ icon: '📚', label: 'Library' }, { icon: '👤', label: 'Profile' });
  const bottomNav = `<div class="bnav">${navItems.slice(0, 5).map(n => `<a class="bnav-item"><span>${n.icon}</span><span>${n.label}</span></a>`).join('')}</div>`;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(ctx.appName)} — Prototype</title>
${DESIGN_SYSTEM_FONTS}
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:var(--font);background:#0a0a0a;color:#fff;display:flex;flex-direction:column;align-items:center;min-height:100vh;padding:24px 16px;-webkit-font-smoothing:antialiased}
h1.proto-title{font-size:28px;font-weight:300;color:#fff;text-align:center;margin-bottom:12px;letter-spacing:-.02em}
h1.proto-title em{color:${accent};font-style:italic}
.vp-row{display:flex;gap:0;background:#282828;border-radius:24px;padding:4px;margin-bottom:24px}
.vp-btn{padding:8px 20px;border-radius:20px;font-size:13px;font-weight:600;text-decoration:none;color:#b3b3b3;cursor:pointer;transition:all .2s}
.vp-btn.on{background:${accent};color:#000}
.vp-btn:hover:not(.on){color:#fff}
.phone-frame{width:375px;max-width:100%;background:#121212;border-radius:40px;border:3px solid #333;overflow:hidden;position:relative;box-shadow:0 20px 60px rgba(0,0,0,.6),inset 0 0 0 1px rgba(255,255,255,.05)}
.phone-frame.web-vp{width:100%;max-width:960px;border-radius:12px}
.status-bar{display:flex;justify-content:space-between;align-items:center;padding:8px 24px 4px;font-size:12px;font-weight:600;color:#fff;background:#121212;flex-shrink:0}
.phone-body{flex:1;overflow-y:auto;background:#121212;display:flex;flex-direction:column}
.pscr{display:none;flex:1}
.bnav{display:flex;justify-content:space-around;padding:8px 0 12px;background:#121212;border-top:1px solid #282828;flex-shrink:0}
.bnav-item{display:flex;flex-direction:column;align-items:center;gap:2px;font-size:10px;color:#b3b3b3;text-decoration:none;cursor:pointer}
.bnav-item span:first-child{font-size:20px}
.stabs{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:16px;padding:0 16px}
.stab{padding:8px 16px;border-radius:20px;font-size:13px;font-weight:500;text-decoration:none;color:#b3b3b3;background:#1a1a1a;border:1px solid #282828;cursor:pointer;transition:all .2s}
.stab:hover{color:#fff;border-color:#404040}
.stab.on{color:#000;background:${accent};border-color:${accent};font-weight:700}
</style></head><body>
<h1 class="proto-title">${esc(ctx.appName)} — <em>Prototype</em></h1>
${vpToggleHtml}
<div class="phone-frame${vp === 'web' ? ' web-vp' : ''}">
  <div class="status-bar"><span>9:41</span><span>📶 📡 🔋</span></div>
  <div class="phone-body">
    ${phoneScreensHtml}
  </div>
  ${bottomNav}
</div>
<div class="stabs">${screenTabsHtml}</div>
${FEEDBACK_WIDGET_HTML}
<script>
const F=${flowsJson};
function go(i){document.querySelectorAll('.pscr').forEach(s=>s.style.display='none');document.querySelectorAll('.stab').forEach(n=>n.classList.remove('on'));const s=document.getElementById('s'+i);if(s)s.style.display='flex';document.querySelectorAll('.stab').forEach((n,idx)=>{if(idx===i)n.classList.add('on')});document.querySelector('.phone-body')?.scrollTo(0,0)}
(function(){var p=new URLSearchParams(location.search);var s=parseInt(p.get('screen')||'0',10)||0;if(s>0)go(s)})();
</script>
</body></html>`;
}
// =====================================================
// INSTAGRAM PROTOTYPE (phone-frame, light theme, insights/analytics screens)
// Creates actual Instagram-like screens from flow data instead of narrating user stories.
// =====================================================
const IG_GRADIENT = 'linear-gradient(45deg, #405DE6, #833AB4, #C13584, #E1306C, #F56040, #FCAF45)';
const IG_PINK = '#E1306C';
const IG_BG = '#FAFAFA';
const IG_SURFACE = '#FFFFFF';
const IG_TEXT = '#262626';
const IG_MUTED = '#8E8E8E';
const IG_BORDER = '#DBDBDB';

function instagramPrototype(ctx: CpmContext, flowScreens: any[], flowsJson: string, options?: PrototypeOptions): string {
  const vp = options?.viewport ?? 'mobile';
  const base = options?.baseUrl;
  const vpTarget = base ? '_parent' : '_self';

  type IGScreen = { id: number; label: string; screenType: string; content: string };
  const screens: IGScreen[] = [];

  for (let fi = 0; fi < flowScreens.length; fi++) {
    const flow = flowScreens[fi];
    const steps: any[] = flow.steps ?? [];
    const flowName: string = flow.name ?? `Screen ${fi + 1}`;
    const nameLower = flowName.toLowerCase();
    const allLower = steps.map((s: any) => `${s?.action ?? ''} ${s?.result ?? ''}`).join(' ').toLowerCase();

    let screenType = 'feature';
    if (/check|perform|insights?|overview|engagement\s*summary|resonat/i.test(nameLower)) screenType = 'insights';
    else if (/analyz|effective|retention|detail|deep.*dive|breakdown|drop.*off|which\s*part/i.test(nameLower)) screenType = 'analytics';
    else if (/improve|guidance|suggest|recommend|tips?|advice/i.test(nameLower)) screenType = 'recommendations';
    else if (/progress|reinforce|trend|streak|motiv|milestone|weekly|monthly|consistent/i.test(nameLower)) screenType = 'progress';
    else if (/search|discover|explore/i.test(nameLower)) screenType = 'explore';
    else if (/create|post|upload|compose/i.test(nameLower)) screenType = 'create';
    else {
      if (/which\s*part|work.*fail|retention|drop.*off|analytic|breakdown|spike|effective/i.test(allLower)) screenType = 'analytics';
      else if (/guidance|suggest|recommend|what\s*to\s*improve|improve\s*(?:next|future)|tip/i.test(allLower)) screenType = 'recommendations';
      else if (/progress|streak|trend|weekly|monthly|milestone|stay\s*consistent|motiv|confident/i.test(allLower)) screenType = 'progress';
      else if (/insight|performing|resonat|engagement\s*(?:summar|trend|over)|likes?\s*comments?/i.test(allLower)) screenType = 'insights';
      else if (/engagement|perform/i.test(allLower)) screenType = 'insights';
    }

    const screenTypeLabels: Record<string, string> = {
      insights: 'Insights', analytics: 'Analytics', recommendations: 'Tips',
      progress: 'Progress', explore: 'Explore', create: 'Create',
    };
    const label = screenTypeLabels[screenType] ?? flowName.replace(/^(?:flow_dod_\d+[:\-\s]*)/i, '').trim().slice(0, 16);

    let content = '';
    switch (screenType) {
      case 'insights': {
        content = `<div style="padding:0">
          <div style="background:${IG_SURFACE};padding:14px 16px;border-bottom:1px solid ${IG_BORDER};display:flex;align-items:center;gap:10px"><span style="font-size:18px;cursor:pointer">←</span><h2 style="font-size:16px;font-weight:600;color:${IG_TEXT};flex:1">Reel Insights</h2><span style="font-size:16px;color:${IG_MUTED}">⋯</span></div>
          <div style="display:flex;align-items:center;gap:12px;padding:16px;background:${IG_SURFACE};border-bottom:1px solid ${IG_BORDER}">
            <div style="width:64px;height:80px;border-radius:8px;background:linear-gradient(135deg,#833AB4,#E1306C);display:flex;align-items:center;justify-content:center;flex-shrink:0"><span style="font-size:24px;color:#fff">▶</span></div>
            <div><div style="font-size:14px;font-weight:600;color:${IG_TEXT}">Your Latest Reel</div><div style="font-size:12px;color:${IG_MUTED};margin-top:2px">Posted 3 hours ago</div></div>
          </div>
          <div style="padding:16px">
            <h3 style="font-size:14px;font-weight:600;color:${IG_TEXT};margin-bottom:12px">Overview</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px">
              <div style="background:${IG_SURFACE};border:1px solid ${IG_BORDER};border-radius:12px;padding:14px;text-align:center"><div style="font-size:24px;font-weight:700;color:${IG_TEXT}">2,847</div><div style="font-size:12px;color:${IG_MUTED};margin-top:2px">Accounts Reached</div><div style="font-size:11px;color:#10B981;margin-top:4px">↑ 23% vs avg</div></div>
              <div style="background:${IG_SURFACE};border:1px solid ${IG_BORDER};border-radius:12px;padding:14px;text-align:center"><div style="font-size:24px;font-weight:700;color:${IG_TEXT}">412</div><div style="font-size:12px;color:${IG_MUTED};margin-top:2px">Accounts Engaged</div><div style="font-size:11px;color:#10B981;margin-top:4px">↑ 14% vs avg</div></div>
            </div>
            <h3 style="font-size:14px;font-weight:600;color:${IG_TEXT};margin-bottom:12px">Content Interactions</h3>
            <div style="display:flex;justify-content:space-between;margin-bottom:20px">
              ${[{icon:'❤️',label:'Likes',val:'347'},{icon:'💬',label:'Comments',val:'52'},{icon:'↗️',label:'Shares',val:'89'},{icon:'🔖',label:'Saves',val:'126'}].map(m =>
                `<div style="text-align:center;flex:1"><div style="font-size:18px;margin-bottom:4px">${m.icon}</div><div style="font-size:18px;font-weight:700;color:${IG_TEXT}">${m.val}</div><div style="font-size:11px;color:${IG_MUTED}">${m.label}</div></div>`
              ).join('')}
            </div>
            <h3 style="font-size:14px;font-weight:600;color:${IG_TEXT};margin-bottom:12px">Engagement Over Time</h3>
            <div style="display:flex;align-items:flex-end;gap:4px;height:80px;margin-bottom:8px;padding:0 4px">
              ${[35,48,62,78,90,85,72,58,45,38,30,25].map((h, i) =>
                `<div style="flex:1;background:${i < 4 ? IG_PINK : `${IG_PINK}40`};border-radius:3px 3px 0 0;height:${h}%"></div>`
              ).join('')}
            </div>
            <div style="display:flex;justify-content:space-between;font-size:10px;color:${IG_MUTED};padding:0 4px"><span>0h</span><span>3h</span><span>6h</span><span>12h</span></div>
          </div>
        </div>`;
        break;
      }
      case 'analytics': {
        content = `<div style="padding:0">
          <div style="background:${IG_SURFACE};padding:14px 16px;border-bottom:1px solid ${IG_BORDER};display:flex;align-items:center;gap:10px"><span style="font-size:18px;cursor:pointer">←</span><h2 style="font-size:16px;font-weight:600;color:${IG_TEXT};flex:1">Content Analysis</h2></div>
          <div style="padding:16px">
            <h3 style="font-size:14px;font-weight:600;color:${IG_TEXT};margin-bottom:4px">Audience Retention</h3>
            <p style="font-size:12px;color:${IG_MUTED};margin-bottom:12px">How long viewers watched your Reel</p>
            <div style="background:${IG_SURFACE};border:1px solid ${IG_BORDER};border-radius:12px;padding:16px;margin-bottom:20px">
              <div style="display:flex;flex-direction:column;gap:6px">
                ${[{t:'0–3s (Hook)',pct:100,c:IG_PINK},{t:'3–6s',pct:78,c:IG_PINK},{t:'6–10s',pct:62,c:IG_PINK},{t:'10–15s',pct:51,c:'#F56040'},{t:'15–20s',pct:38,c:'#F56040'},{t:'20s+ (End)',pct:24,c:'#FCAF45'}].map(b =>
                  `<div><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px"><span style="color:${IG_TEXT}">${b.t}</span><span style="color:${IG_MUTED}">${b.pct}%</span></div><div style="height:8px;background:#EFEFEF;border-radius:4px;overflow:hidden"><div style="width:${b.pct}%;height:100%;background:${b.c};border-radius:4px"></div></div></div>`
                ).join('')}
              </div>
              <div style="margin-top:12px;padding:10px;background:#FFF4F0;border-radius:8px;font-size:12px;color:#E1306C"><strong>Drop-off at 10s</strong> — 27% of viewers left here. Consider adding a hook or transition at this point.</div>
            </div>
            <h3 style="font-size:14px;font-weight:600;color:${IG_TEXT};margin-bottom:12px">Peak Moments</h3>
            <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">
              <div style="background:${IG_SURFACE};border:1px solid ${IG_BORDER};border-radius:10px;padding:12px;display:flex;align-items:center;gap:10px"><div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#FCAF45,#E1306C);display:flex;align-items:center;justify-content:center;font-size:14px;color:#fff;flex-shrink:0">🔥</div><div><div style="font-size:13px;font-weight:600;color:${IG_TEXT}">Engagement spike at 4s</div><div style="font-size:11px;color:${IG_MUTED}">68 interactions — your hook resonated</div></div></div>
              <div style="background:${IG_SURFACE};border:1px solid ${IG_BORDER};border-radius:10px;padding:12px;display:flex;align-items:center;gap:10px"><div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#833AB4,#405DE6);display:flex;align-items:center;justify-content:center;font-size:14px;color:#fff;flex-shrink:0">💬</div><div><div style="font-size:13px;font-weight:600;color:${IG_TEXT}">Comment surge at 8s</div><div style="font-size:11px;color:${IG_MUTED}">23 comments — viewers reacted to the reveal</div></div></div>
            </div>
            <h3 style="font-size:14px;font-weight:600;color:${IG_TEXT};margin-bottom:12px">Content Breakdown</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <div style="background:${IG_SURFACE};border:1px solid ${IG_BORDER};border-radius:10px;padding:14px;text-align:center"><div style="font-size:20px;font-weight:700;color:${IG_TEXT}">14.5%</div><div style="font-size:11px;color:${IG_MUTED};margin-top:2px">Engagement Rate</div></div>
              <div style="background:${IG_SURFACE};border:1px solid ${IG_BORDER};border-radius:10px;padding:14px;text-align:center"><div style="font-size:20px;font-weight:700;color:${IG_TEXT}">8.2s</div><div style="font-size:11px;color:${IG_MUTED};margin-top:2px">Avg Watch Time</div></div>
              <div style="background:${IG_SURFACE};border:1px solid ${IG_BORDER};border-radius:10px;padding:14px;text-align:center"><div style="font-size:20px;font-weight:700;color:${IG_TEXT}">3.4x</div><div style="font-size:11px;color:${IG_MUTED};margin-top:2px">Replay Rate</div></div>
              <div style="background:${IG_SURFACE};border:1px solid ${IG_BORDER};border-radius:10px;padding:14px;text-align:center"><div style="font-size:20px;font-weight:700;color:${IG_TEXT}">42%</div><div style="font-size:11px;color:${IG_MUTED};margin-top:2px">Non-Followers</div></div>
            </div>
          </div>
        </div>`;
        break;
      }
      case 'recommendations': {
        content = `<div style="padding:0">
          <div style="background:${IG_SURFACE};padding:14px 16px;border-bottom:1px solid ${IG_BORDER};display:flex;align-items:center;gap:10px"><span style="font-size:18px;cursor:pointer">←</span><h2 style="font-size:16px;font-weight:600;color:${IG_TEXT};flex:1">Improve Your Reels</h2></div>
          <div style="padding:16px">
            <div style="background:linear-gradient(135deg,#833AB4,#E1306C);border-radius:12px;padding:16px;margin-bottom:20px;display:flex;align-items:center;gap:12px"><div style="width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">✨</div><div><div style="font-size:14px;font-weight:700;color:#fff">AI-Powered Suggestions</div><div style="font-size:12px;color:rgba(255,255,255,.8)">Based on your last 10 Reels</div></div></div>
            <h3 style="font-size:14px;font-weight:600;color:${IG_TEXT};margin-bottom:12px">Top Recommendations</h3>
            <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">
              ${[
                {icon:'⚡',title:'Hook viewers in the first 2 seconds',desc:'Your best Reels grab attention immediately. Try starting with movement or text overlay.',prio:'High Impact'},
                {icon:'🕐',title:'Post between 6-8 PM on weekdays',desc:'Your audience is most active during evening hours. Engagement is 34% higher at 7 PM.',prio:'Quick Win'},
                {icon:'🎵',title:'Use trending audio',desc:'Reels with trending sounds get 2.5x more reach. Try searching \"trending\" in the audio library.',prio:'High Impact'},
                {icon:'📝',title:'Add captions to your Reels',desc:'85% of Reels are watched without sound. Adding captions increases completion rate by 40%.',prio:'Medium'},
                {icon:'🔄',title:'Post more consistently',desc:'Aim for 3-4 Reels per week. Consistent creators see 2x growth in followers.',prio:'Long-term'},
              ].map(tip =>
                `<div style="background:${IG_SURFACE};border:1px solid ${IG_BORDER};border-radius:12px;padding:14px;display:flex;gap:12px;align-items:flex-start">
                  <div style="width:36px;height:36px;border-radius:10px;background:#FFF0F3;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">${tip.icon}</div>
                  <div style="flex:1"><div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><span style="font-size:13px;font-weight:600;color:${IG_TEXT}">${esc(tip.title)}</span></div><div style="font-size:12px;color:${IG_MUTED};line-height:1.5">${esc(tip.desc)}</div><span style="display:inline-block;margin-top:6px;font-size:10px;font-weight:600;padding:3px 8px;border-radius:4px;background:${tip.prio === 'High Impact' ? '#FFF0F3;color:#E1306C' : tip.prio === 'Quick Win' ? '#F0FFF4;color:#10B981' : '#FFF8E1;color:#F59E0B'}">${esc(tip.prio)}</span></div>
                </div>`
              ).join('')}
            </div>
            <button style="width:100%;padding:14px;background:${IG_PINK};color:#fff;border:0;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer">Save All Tips</button>
          </div>
        </div>`;
        break;
      }
      case 'progress': {
        const days = ['M','T','W','T','F','S','S'];
        const active = [true,true,true,false,false,false,false];
        content = `<div style="padding:0">
          <div style="background:${IG_SURFACE};padding:14px 16px;border-bottom:1px solid ${IG_BORDER};display:flex;align-items:center;gap:10px"><span style="font-size:18px;cursor:pointer">←</span><h2 style="font-size:16px;font-weight:600;color:${IG_TEXT};flex:1">Your Progress</h2><span style="font-size:13px;color:${IG_PINK};font-weight:600">This Month</span></div>
          <div style="padding:16px">
            <div style="background:${IG_SURFACE};border:1px solid ${IG_BORDER};border-radius:12px;padding:16px;margin-bottom:16px;text-align:center">
              <div style="font-size:13px;color:${IG_MUTED};margin-bottom:8px">Weekly Posting Streak</div>
              <div style="display:flex;justify-content:center;gap:10px;margin-bottom:12px">${days.map((d, i) => `<div style="text-align:center"><div style="width:36px;height:36px;border-radius:50%;${active[i] ? `background:${IG_PINK};color:#fff` : `background:#EFEFEF;color:${IG_MUTED}`};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;margin-bottom:4px">${active[i] ? '✓' : ''}</div><div style="font-size:10px;color:${IG_MUTED}">${d}</div></div>`).join('')}</div>
              <div style="font-size:15px;font-weight:700;color:${IG_TEXT}">3 of 4 posts this week</div>
              <div style="font-size:12px;color:#10B981;margin-top:4px">🔥 On track — 1 more to hit your goal!</div>
            </div>
            <h3 style="font-size:14px;font-weight:600;color:${IG_TEXT};margin-bottom:12px">This Week vs Last Week</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:20px">
              ${[{label:'Avg Reach',curr:'3.2K',prev:'2.1K',up:true},{label:'Avg Likes',curr:'412',prev:'287',up:true},{label:'Eng Rate',curr:'14.5%',prev:'11.2%',up:true}].map(m =>
                `<div style="background:${IG_SURFACE};border:1px solid ${IG_BORDER};border-radius:10px;padding:12px;text-align:center"><div style="font-size:16px;font-weight:700;color:${IG_TEXT}">${m.curr}</div><div style="font-size:10px;color:${IG_MUTED};margin:2px 0">${m.label}</div><div style="font-size:11px;color:${m.up ? '#10B981' : '#EF4444'}">${m.up ? '↑' : '↓'} from ${m.prev}</div></div>`
              ).join('')}
            </div>
            <h3 style="font-size:14px;font-weight:600;color:${IG_TEXT};margin-bottom:12px">Monthly Engagement Trend</h3>
            <div style="background:${IG_SURFACE};border:1px solid ${IG_BORDER};border-radius:12px;padding:16px;margin-bottom:20px">
              <div style="display:flex;align-items:flex-end;gap:6px;height:100px;margin-bottom:8px">
                ${[30,42,38,55,48,65,72,60,78,85,80,90].map((h, i) =>
                  `<div style="flex:1;background:${i >= 8 ? IG_PINK : `${IG_PINK}30`};border-radius:4px 4px 0 0;height:${h}%"></div>`
                ).join('')}
              </div>
              <div style="display:flex;justify-content:space-between;font-size:10px;color:${IG_MUTED}"><span>Week 1</span><span>Week 2</span><span>Week 3</span><span>Now</span></div>
            </div>
            <h3 style="font-size:14px;font-weight:600;color:${IG_TEXT};margin-bottom:12px">Milestones</h3>
            <div style="display:flex;flex-direction:column;gap:8px">
              <div style="background:linear-gradient(135deg,#FFF8E1,#FFF0F3);border:1px solid #FCAF45;border-radius:10px;padding:12px;display:flex;align-items:center;gap:10px"><span style="font-size:20px">🏆</span><div><div style="font-size:13px;font-weight:600;color:${IG_TEXT}">Best Reel This Month</div><div style="font-size:11px;color:${IG_MUTED}">4,200 views — 3x your average</div></div></div>
              <div style="background:${IG_SURFACE};border:1px solid ${IG_BORDER};border-radius:10px;padding:12px;display:flex;align-items:center;gap:10px"><span style="font-size:20px">🔥</span><div><div style="font-size:13px;font-weight:600;color:${IG_TEXT}">3-Week Posting Streak</div><div style="font-size:11px;color:${IG_MUTED}">You've posted every week for 3 weeks</div></div></div>
              <div style="background:${IG_SURFACE};border:1px solid ${IG_BORDER};border-radius:10px;padding:12px;display:flex;align-items:center;gap:10px"><span style="font-size:20px">📈</span><div><div style="font-size:13px;font-weight:600;color:${IG_TEXT}">Engagement Up 52%</div><div style="font-size:11px;color:${IG_MUTED}">Compared to your first month</div></div></div>
            </div>
          </div>
        </div>`;
        break;
      }
      default: {
        const stepsHtml = steps.map((st: any, si: number) => {
          const action = st?.action ?? '';
          const result = st?.result ?? '';
          return `<div style="background:${IG_SURFACE};border:1px solid ${IG_BORDER};border-radius:12px;padding:14px;display:flex;align-items:flex-start;gap:12px;margin-bottom:10px">
            <div style="width:36px;height:36px;border-radius:50%;background:#FFF0F3;display:flex;align-items:center;justify-content:center;color:${IG_PINK};font-size:14px;font-weight:700;flex-shrink:0">${si + 1}</div>
            <div><div style="font-size:13px;font-weight:600;color:${IG_TEXT};margin-bottom:3px">${esc(toUserFacingCopy(action, 50))}</div>${result ? `<div style="font-size:12px;color:${IG_MUTED}">${esc(toUserFacingCopy(result, 80))}</div>` : ''}</div>
          </div>`;
        }).join('');
        content = `<div style="padding:0">
          <div style="background:${IG_SURFACE};padding:14px 16px;border-bottom:1px solid ${IG_BORDER};display:flex;align-items:center;gap:10px"><span style="font-size:18px;cursor:pointer">←</span><h2 style="font-size:16px;font-weight:600;color:${IG_TEXT};flex:1">${esc(flowName.slice(0, 28))}</h2></div>
          <div style="padding:16px">${stepsHtml}</div>
        </div>`;
        break;
      }
    }

    screens.push({ id: fi, label, screenType, content });
  }

  // Deduplicate screens: keep first of each type, skip single-step duplicates
  const seenTypes = new Set<string>();
  const deduped: IGScreen[] = [];
  for (const s of screens) {
    if (s.screenType === 'feature' || !seenTypes.has(s.screenType)) {
      seenTypes.add(s.screenType);
      deduped.push(s);
    }
  }
  screens.length = 0;
  screens.push(...deduped);

  // Inject Home screen at the beginning
  const homeContent = `<div style="padding:0">
    <div style="background:${IG_SURFACE};padding:10px 16px;border-bottom:1px solid ${IG_BORDER};display:flex;align-items:center;justify-content:space-between">
      <div style="font-size:22px;font-weight:700;font-family:'Georgia',serif;font-style:italic;color:${IG_TEXT}">Instagram</div>
      <div style="display:flex;gap:16px;font-size:20px"><span>❤️</span><span>💬</span></div>
    </div>
    <div style="display:flex;gap:12px;padding:12px 16px;overflow-x:auto;border-bottom:1px solid ${IG_BORDER};background:${IG_SURFACE}">
      <div style="text-align:center;flex-shrink:0"><div style="width:56px;height:56px;border-radius:50%;background:${IG_GRADIENT};padding:2px"><div style="width:100%;height:100%;border-radius:50%;background:${IG_SURFACE};padding:2px"><div style="width:100%;height:100%;border-radius:50%;background:${IG_BORDER};display:flex;align-items:center;justify-content:center;font-size:14px;color:${IG_TEXT};font-weight:600">You</div></div></div><div style="font-size:10px;color:${IG_MUTED};margin-top:4px">Your story</div></div>
      ${['Creator A','Creator B','Creator C','Creator D'].map(name => `<div style="text-align:center;flex-shrink:0"><div style="width:56px;height:56px;border-radius:50%;background:${IG_GRADIENT};padding:2px"><div style="width:100%;height:100%;border-radius:50%;background:${IG_SURFACE};padding:2px"><div style="width:100%;height:100%;border-radius:50%;background:#EFEFEF;display:flex;align-items:center;justify-content:center;font-size:11px;color:${IG_MUTED}">${name.split(' ').map(w => w[0]).join('')}</div></div></div><div style="font-size:10px;color:${IG_MUTED};margin-top:4px;max-width:56px;overflow:hidden;text-overflow:ellipsis">${esc(name)}</div></div>`).join('')}
    </div>
    <div style="padding:16px">
      <div style="background:linear-gradient(135deg,#FFF0F3,#F0F0FF);border:1px solid ${IG_PINK}40;border-radius:12px;padding:14px;margin-bottom:16px;display:flex;align-items:center;gap:12px">
        <div style="width:40px;height:40px;border-radius:50%;background:${IG_GRADIENT};display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">📊</div>
        <div style="flex:1"><div style="font-size:14px;font-weight:600;color:${IG_TEXT}">New insights available</div><div style="font-size:12px;color:${IG_MUTED}">Your latest Reel is getting traction</div></div>
        <span style="font-size:14px;color:${IG_PINK};font-weight:600">View</span>
      </div>
      <h3 style="font-size:14px;font-weight:600;color:${IG_TEXT};margin-bottom:12px">Your Recent Reels</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px;margin-bottom:20px">
        ${[0,1,2,3,4,5].map(i => `<div style="aspect-ratio:9/16;background:linear-gradient(135deg,${['#833AB4','#E1306C','#F56040','#FCAF45','#405DE6','#C13584'][i]},${['#C13584','#F56040','#FCAF45','#E1306C','#833AB4','#405DE6'][i]});border-radius:4px;display:flex;align-items:flex-end;padding:6px"><div style="font-size:10px;color:rgba(255,255,255,.9)"><div>▶ ${[2847, 1923, 4201, 892, 3156, 1547][i]}</div></div></div>`).join('')}
      </div>
      <h3 style="font-size:14px;font-weight:600;color:${IG_TEXT};margin-bottom:12px">Quick Stats This Week</h3>
      <div style="display:flex;gap:8px">
        ${[{val:'12.4K',label:'Total Reach'},{val:'1,847',label:'Engagements'},{val:'13.2%',label:'Eng Rate'}].map(s => `<div style="flex:1;background:${IG_SURFACE};border:1px solid ${IG_BORDER};border-radius:10px;padding:12px;text-align:center"><div style="font-size:16px;font-weight:700;color:${IG_TEXT}">${s.val}</div><div style="font-size:10px;color:${IG_MUTED};margin-top:2px">${s.label}</div></div>`).join('')}
      </div>
    </div>
  </div>`;
  screens.unshift({ id: -1, label: 'Home', screenType: 'home', content: homeContent });

  // Re-assign IDs after injections
  screens.forEach((s, i) => { s.id = i; });
  const activeScreen = Math.min(options?.screenId ?? 0, Math.max(screens.length - 1, 0));

  const screenTabsHtml = screens.map((s, i) => {
    const isOn = i === activeScreen;
    const href = base !== undefined ? `${base || ''}?screen=${i}&viewport=${vp}` : `javascript:go(${i})`;
    const target = base !== undefined ? vpTarget : '';
    return `<a class="stab${isOn ? ' on' : ''}" ${base !== undefined ? `href="${href}" target="${target}"` : `onclick="go(${i})"`}>${esc(s.label)}</a>`;
  }).join('');

  const vpToggleHtml = base !== undefined
    ? `<div class="vp-row"><a class="vp-btn${vp === 'web' ? ' on' : ''}" href="${base || ''}?screen=${activeScreen}&viewport=web" target="${vpTarget}">Web</a><a class="vp-btn${vp === 'mobile' ? ' on' : ''}" href="${base || ''}?screen=${activeScreen}&viewport=mobile" target="${vpTarget}">Mobile</a></div>`
    : `<div class="vp-row"><a class="vp-btn on">Web</a><a class="vp-btn">Mobile</a></div>`;

  const phoneScreensHtml = screens.map((s, i) =>
    `<div class="pscr" id="s${i}" style="display:${i === activeScreen ? 'flex' : 'none'};flex-direction:column;height:100%;overflow-y:auto">${s.content}</div>`
  ).join('');

  const bottomNav = `<div class="bnav"><a class="bnav-item active"><span>🏠</span><span>Home</span></a><a class="bnav-item"><span>🔍</span><span>Search</span></a><a class="bnav-item"><span>🎬</span><span>Reels</span></a><a class="bnav-item"><span>❤️</span><span>Activity</span></a><a class="bnav-item"><span>👤</span><span>Profile</span></a></div>`;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(ctx.appName)} — Prototype</title>
${DESIGN_SYSTEM_FONTS}
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:var(--font);background:#f0f0f0;color:${IG_TEXT};display:flex;flex-direction:column;align-items:center;min-height:100vh;padding:24px 16px;-webkit-font-smoothing:antialiased}
h1.proto-title{font-size:28px;font-weight:300;color:#333;text-align:center;margin-bottom:12px;letter-spacing:-.02em}
h1.proto-title em{color:${IG_PINK};font-style:italic}
.vp-row{display:flex;gap:0;background:#e0e0e0;border-radius:24px;padding:4px;margin-bottom:24px}
.vp-btn{padding:8px 20px;border-radius:20px;font-size:13px;font-weight:600;text-decoration:none;color:#888;cursor:pointer;transition:all .2s}
.vp-btn.on{background:${IG_PINK};color:#fff}
.vp-btn:hover:not(.on){color:#333}
.phone-frame{width:375px;max-width:100%;background:${IG_BG};border-radius:40px;border:3px solid #ccc;overflow:hidden;position:relative;box-shadow:0 20px 60px rgba(0,0,0,.15),inset 0 0 0 1px rgba(0,0,0,.05);display:flex;flex-direction:column;max-height:812px}
.phone-frame.web-vp{width:100%;max-width:960px;border-radius:12px;max-height:none}
.status-bar{display:flex;justify-content:space-between;align-items:center;padding:8px 24px 4px;font-size:12px;font-weight:600;color:${IG_TEXT};background:${IG_SURFACE};flex-shrink:0}
.phone-body{flex:1;overflow-y:auto;background:${IG_BG};display:flex;flex-direction:column}
.pscr{display:none;flex:1}
.bnav{display:flex;justify-content:space-around;padding:6px 0 10px;background:${IG_SURFACE};border-top:1px solid ${IG_BORDER};flex-shrink:0}
.bnav-item{display:flex;flex-direction:column;align-items:center;gap:1px;font-size:9px;color:${IG_MUTED};text-decoration:none;cursor:pointer}
.bnav-item.active{color:${IG_TEXT}}
.bnav-item span:first-child{font-size:20px}
.stabs{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:16px;padding:0 16px}
.stab{padding:8px 16px;border-radius:20px;font-size:13px;font-weight:500;text-decoration:none;color:#888;background:#e8e8e8;border:1px solid #ddd;cursor:pointer;transition:all .2s}
.stab:hover{color:#333;border-color:#bbb}
.stab.on{color:#fff;background:${IG_PINK};border-color:${IG_PINK};font-weight:700}
</style></head><body>
<h1 class="proto-title">${esc(ctx.appName)} — <em>Prototype</em></h1>
${vpToggleHtml}
<div class="phone-frame${vp === 'web' ? ' web-vp' : ''}">
  <div class="status-bar"><span>9:41</span><span>📶 📡 🔋</span></div>
  <div class="phone-body">
    ${phoneScreensHtml}
  </div>
  ${bottomNav}
</div>
<div class="stabs">${screenTabsHtml}</div>
${FEEDBACK_WIDGET_HTML}
<script>
const F=${flowsJson};
function go(i){document.querySelectorAll('.pscr').forEach(s=>s.style.display='none');document.querySelectorAll('.stab').forEach(n=>n.classList.remove('on'));const s=document.getElementById('s'+i);if(s)s.style.display='flex';document.querySelectorAll('.stab').forEach((n,idx)=>{if(idx===i)n.classList.add('on')});document.querySelector('.phone-body')?.scrollTo(0,0)}
(function(){var p=new URLSearchParams(location.search);var s=parseInt(p.get('screen')||'0',10)||0;if(s>0)go(s)})();
</script>
</body></html>`;
}

// =====================================================
// STRATEGY PROTOTYPE (rich interactive screens from strategy/scope docs)
// Renders actual product UI screens derived entirely from the CPM data.
// Design system: sidebar + topbar, Dashboard first, prototype-type branching.
// =====================================================
function strategyPrototype(_ctx: CpmContext, flowScreens: any[], flowsJson: string, cpm: any, options?: PrototypeOptions): string {
  const productName = cpm?.meta?.source?.document_name?.replace(/\.[^.]+$/, '').replace(/_/g, ' ') ?? 'Product';
  const shortName = productName.replace(/strategy.*|scope.*|\blaunch\s*/ig, '').trim() || productName;
  const problem = cpm?.intent?.problem?.statement ?? '';
  const outcome = cpm?.intent?.goal?.primary_outcome ?? '';
  const jobs: any[] = cpm?.jobs ?? [];
  const openQuestions = cpm?.review?.open_questions ?? cpm?.open_questions ?? [];
  const successMetrics = cpm?.intent?.goal?.success_metrics ?? [];

  const rawType = (cpm?.prototype?.strategy?.recommended_type ?? 'clickable_ui').toLowerCase();
  const pt = rawType.includes('data_flow') ? 'data_flow_diagram' : rawType.includes('architecture') ? 'architecture_diagram' : rawType.includes('hybrid') ? 'hybrid_bundle' : 'clickable_ui';

  const includeFlows = pt === 'clickable_ui' || pt === 'hybrid_bundle';
  const includeDataFlow = pt === 'data_flow_diagram' || pt === 'hybrid_bundle';
  const includeArch = pt === 'architecture_diagram' || pt === 'hybrid_bundle';

  const jobsText = jobs.map((j: any) => `${j.description ?? ''} ${j.trigger ?? ''} ${j.success_outcome ?? ''}`).join(' ');
  const flowsText = (cpm?.flows ?? []).map((f: any) => (f?.steps ?? []).map((s: any) => `${s?.action ?? ''} ${s?.result ?? ''} ${s?.actor_id ?? ''}`).join(' ')).join(' ');
  const corpus = `${jobsText} ${flowsText}`;
  const extracted = extractDocEntities(corpus);

  const navItems: { id: number; label: string; icon: string }[] = [];
  let screenId = 0;
  navItems.push({ id: screenId++, label: 'Dashboard', icon: '📊' });

  if (includeFlows && flowScreens.length > 0) {
    for (const s of flowScreens) {
      navItems.push({ id: screenId++, label: s.name.slice(0, 22), icon: inferFlowIcon(s) });
    }
  }
  if (includeDataFlow) navItems.push({ id: screenId++, label: 'Data Flow', icon: '⇄' });
  if (includeArch) navItems.push({ id: screenId++, label: 'Architecture', icon: '🔲' });

  const activeScreen = Math.min(options?.screenId ?? 0, navItems.length - 1);
  const vp = options?.viewport ?? 'web';
  const base = options?.baseUrl;
  const navHtml = base !== undefined
    ? navItems.map((n) => {
        const isOn = n.id === activeScreen;
        const href = base ? `${base}?screen=${n.id}&viewport=${vp}` : `?screen=${n.id}&viewport=${vp}`;
        const target = base ? '_parent' : '_self';
        return `<a class="ni${isOn ? ' on' : ''}" href="${href}" target="${target}" data-i="${n.id}"><span class="ni-icon">${n.icon}</span>${esc(n.label)}</a>`;
      }).join('')
    : navItems.map((n, i) =>
        `<a class="ni${i === 0 ? ' on' : ''}" onclick="navigateTo(${n.id})" data-i="${n.id}"><span class="ni-icon">${n.icon}</span>${esc(n.label)}</a>`
      ).join('');

  const metrics = Array.isArray(successMetrics) ? successMetrics.slice(0, 4) : [];
  const metricLabels = metrics.length >= 4 ? metrics.map((m: any) => typeof m === 'string' ? m : m?.label ?? m?.metric ?? 'Metric') : ['Adoption', 'Completion', 'Satisfaction', 'Efficiency'];
  const metricValues = metrics.length >= 4 ? metrics.map((m: any) => typeof m === 'string' ? '—' : m?.value ?? m?.target ?? '—') : ['94%', '87%', '4.2', '12%'];

  const dashboardHtml = renderDashboard(shortName, problem, outcome, metricLabels, metricValues, flowScreens, openQuestions, includeFlows);

  const screensHtml: string[] = [];
  screenId = 0;
  const show = (id: number) => (id === activeScreen ? 'block' : 'none');
  screensHtml.push(`<div class="scr" id="s${screenId}" style="display:${show(screenId)}">${dashboardHtml}</div>`);
  screenId++;

  if (includeFlows && flowScreens.length > 0) {
    for (let idx = 0; idx < flowScreens.length; idx++) {
      const s = flowScreens[idx];
      const content = renderFlowScreen(s, idx, extracted, shortName);
      screensHtml.push(`<div class="scr" id="s${screenId}" style="display:${show(screenId)}">${content}</div>`);
      screenId++;
    }
  }
  if (includeDataFlow) {
    screensHtml.push(`<div class="scr" id="s${screenId}" style="display:${show(screenId)}"><div class="page-hdr"><h1>Data Flow Diagram</h1><p>Input → Processing → Storage → Output</p></div><div class="section">${renderDataFlowDiagram(cpm)}</div></div>`);
    screenId++;
  }
  if (includeArch) {
    screensHtml.push(`<div class="scr" id="s${screenId}" style="display:${show(screenId)}"><div class="page-hdr"><h1>Architecture Diagram</h1><p>System layers and boundaries</p></div><div class="section">${renderArchitectureDiagram(cpm)}</div></div>`);
  }

  const navDataJson = JSON.stringify(navItems.map((n) => n.id));
  const vpBase = base !== undefined ? (base || '') : '';
  const vpTarget = base ? '_parent' : '_self';
  const viewportToggle = base !== undefined ? `<span class="vp-toggle"><a href="${vpBase}?screen=${activeScreen}&viewport=web" target="${vpTarget}" class="vp-btn${vp === 'web' ? ' on' : ''}">Web</a><a href="${vpBase}?screen=${activeScreen}&viewport=mobile" target="${vpTarget}" class="vp-btn${vp === 'mobile' ? ' on' : ''}">Mobile</a></span>` : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(productName)}</title>
${DESIGN_SYSTEM_FONTS}
${LUCIDE_ICONS}
<style>
${DESIGN_SYSTEM_CSS}
${DIAGRAM_CSS}
.vp-toggle{display:flex;gap:4px;margin-right:16px}.vp-btn{padding:6px 12px;border-radius:6px;font-size:12px;font-weight:500;text-decoration:none;color:var(--text2);background:transparent;transition:var(--transition)}.vp-btn:hover{color:var(--text)}.vp-btn.on{color:#fff;background:rgba(255,255,255,.15)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:var(--font);background:var(--bg);color:var(--text);display:flex;height:100vh;overflow:hidden;font-size:14px;line-height:var(--body-leading);-webkit-font-smoothing:antialiased}
.sb{width:var(--sidebar-w);background:var(--sidebar);display:flex;flex-direction:column;flex-shrink:0;border-right:1px solid rgba(255,255,255,.08)}
.sb-hdr{padding:24px;border-bottom:1px solid rgba(255,255,255,.1)}.sb-hdr h2{color:#fff;font-size:18px;font-weight:700;letter-spacing:var(--heading-tight)}.sb-hdr p{color:var(--text3);font-size:12px;margin-top:6px;line-height:1.4}
.sb-nav{flex:1;overflow-y:auto;padding:12px 0}
.ni{display:flex;align-items:center;gap:12px;padding:12px 20px;color:rgba(255,255,255,.7);font-size:14px;text-decoration:none;cursor:pointer;transition:var(--transition);border-left:3px solid transparent}
.ni:hover{color:#fff;background:var(--sidebar-hover)}.ni.on{color:#fff;font-weight:600;background:var(--sidebar-hover);border-left-color:var(--blue)}
.ni-icon{font-size:18px;width:24px;text-align:center;opacity:.9}
.mn{flex:1;overflow-y:auto;background:var(--bg);display:flex;flex-direction:column;padding:0}
.topbar{height:52px;background:var(--surface);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:flex-end;padding:0 24px;gap:16px;flex-shrink:0;box-shadow:var(--shadow-sm)}
.topbar .tb-icon{color:var(--text2);cursor:pointer;font-size:18px;transition:var(--transition)}.topbar .tb-icon:hover{color:var(--text)}.topbar .tb-avatar{width:34px;height:34px;border-radius:50%;background:var(--blue);color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600}
.mn-content{flex:1;overflow-y:auto;padding-bottom:32px}
.scr{display:none}
.page-hdr{padding:36px 40px 28px;background:var(--surface);border-bottom:1px solid var(--border);margin-bottom:0}
.page-hdr h1{font-size:30px;font-weight:700;color:var(--text);margin-bottom:8px;letter-spacing:var(--heading-tight)}.page-hdr p{color:var(--text2);font-size:15px;margin-bottom:0}
.section{padding:32px 40px;margin-bottom:40px}.section h2{font-size:20px;font-weight:600;color:var(--text);margin-bottom:20px;letter-spacing:var(--heading-tight)}
.dash-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:20px;margin-bottom:32px}
.dash-metric{background:var(--surface);border-radius:var(--radius);padding:24px;border:1px solid var(--border);box-shadow:var(--shadow);transition:var(--transition)}
.dash-metric:hover{box-shadow:var(--shadow-lg);border-color:var(--border)}
.dash-metric .num{font-size:30px;font-weight:700;color:var(--blue);margin-bottom:4px;letter-spacing:var(--heading-tight)}.dash-metric .label{font-size:12px;color:var(--text2);text-transform:uppercase;letter-spacing:.06em}
.dash-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.dash-card{background:var(--surface);border-radius:var(--radius);padding:24px;border:1px solid var(--border);box-shadow:var(--shadow);transition:var(--transition)}
.dash-card:hover{box-shadow:var(--shadow-lg)}
.dash-card h3{font-size:16px;font-weight:600;color:var(--text);margin-bottom:16px}
.dash-activity{width:100%;border-collapse:collapse;font-size:13px}.dash-activity th{text-align:left;padding:12px 16px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--text2);border-bottom:1px solid var(--border)}
.dash-activity td{padding:14px 16px;border-bottom:1px solid var(--border);color:var(--text);transition:var(--transition)}.dash-activity tr:hover td{background:var(--bg)}
.qa-grid{display:flex;flex-direction:column;gap:12px}
.qa-card{display:flex;align-items:center;gap:16px;padding:16px;background:var(--blue-light);border-radius:var(--radius-sm);border:1px solid transparent;cursor:pointer;transition:var(--transition)}
.qa-card:hover{background:var(--surface);border-color:var(--blue);box-shadow:var(--shadow)}
.qa-card .qa-num{width:36px;height:36px;border-radius:var(--radius-sm);background:var(--blue);color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0}
.qa-card span{font-size:14px;font-weight:500;color:var(--text)}
.na-list{display:flex;flex-direction:column;gap:8px}
.na-item{display:flex;align-items:flex-start;gap:12px;padding:14px 18px;background:var(--amber-light);border-left:4px solid var(--amber);border-radius:var(--radius-sm);font-size:13px;color:var(--text)}
.cat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px}
.cat-card{border-radius:var(--radius);padding:24px;cursor:pointer;transition:var(--transition);min-height:120px;background:var(--surface);border:1px solid var(--border);box-shadow:var(--shadow-sm)}
.cat-card:hover{transform:translateY(-4px);box-shadow:var(--shadow-lg);border-color:var(--blue)}.cat-card span{font-size:17px;font-weight:600;color:var(--text)}
.content-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:20px}
.content-card{background:var(--surface);border-radius:var(--radius);overflow:hidden;cursor:pointer;transition:var(--transition);border:1px solid var(--border);box-shadow:var(--shadow-sm)}
.content-card:hover{box-shadow:var(--shadow-lg);border-color:var(--border)}
.content-card .thumb{width:100%;aspect-ratio:16/9;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:36px;position:relative}
.content-card .thumb .dur{position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,.85);color:#fff;font-size:11px;padding:4px 8px;border-radius:var(--radius-sm);font-weight:500}
.content-card .info{padding:16px}.content-card .info h3{font-size:15px;font-weight:600;color:var(--text);margin-bottom:6px}.content-card .info p{font-size:13px;color:var(--text2)}
.content-card .info .tags{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}.tag{background:var(--bg);color:var(--text2);font-size:11px;padding:4px 10px;border-radius:var(--radius-full)}
.search-bar{display:flex;align-items:center;gap:12px;background:var(--surface);border-radius:var(--radius-full);padding:12px 20px;margin-bottom:28px;max-width:520px;border:1px solid var(--border);transition:var(--transition)}
.search-bar:focus-within{border-color:var(--border-focus);box-shadow:0 0 0 3px var(--blue-glow)}
.search-bar input{background:0;border:0;color:var(--text);font-size:15px;outline:0;width:100%;font-family:inherit}
.banner{border-radius:var(--radius-lg);padding:48px 40px;margin:0 40px 28px;text-align:center;background:linear-gradient(135deg,var(--blue) 0%,#60a5fa 50%,#93c5fd 100%);box-shadow:var(--shadow-xl)}
.banner h2{color:#fff;font-size:28px;font-weight:700;margin-bottom:10px;letter-spacing:var(--heading-tight)}.banner p{color:rgba(255,255,255,.92);font-size:16px;margin-bottom:24px}
.banner .btn{display:inline-block;background:#fff;color:var(--blue);padding:14px 36px;border-radius:var(--radius-full);font-weight:600;font-size:15px;cursor:pointer;border:0;transition:var(--transition);box-shadow:var(--shadow)}.banner .btn:hover{transform:scale(1.03);box-shadow:var(--shadow-lg)}
.feature-card{background:var(--surface);border-radius:var(--radius);padding:24px;border:1px solid var(--border);margin-bottom:16px;display:flex;align-items:flex-start;gap:20px;transition:var(--transition)}
.feature-card:hover{box-shadow:var(--shadow)}
.feature-card .fc-icon{width:48px;height:48px;background:var(--blue-light);border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;color:var(--blue)}
.feature-card h3{color:var(--text);font-size:16px;font-weight:600;margin-bottom:6px}.feature-card p{color:var(--text2);font-size:14px;line-height:1.55}
.media-player{width:100%;aspect-ratio:16/9;background:#000;border-radius:var(--radius);display:flex;align-items:center;justify-content:center;margin-bottom:28px;position:relative;overflow:hidden}
.media-player .play-btn{width:72px;height:72px;background:var(--blue);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:28px;color:#fff;cursor:pointer;border:0;box-shadow:0 8px 32px var(--blue-glow);transition:var(--transition)}.media-player .play-btn:hover{transform:scale(1.08)}
.media-player .overlay-text{position:absolute;bottom:20px;left:20px;color:#fff;font-size:14px;background:rgba(0,0,0,.7);padding:8px 14px;border-radius:var(--radius-sm)}
.progress-bar{display:flex;align-items:center;gap:20px;margin-bottom:28px}.progress-bar .track{flex:1;height:8px;background:var(--bg);border-radius:var(--radius-full);overflow:hidden}
.progress-bar .track .fill{width:35%;height:100%;background:var(--blue);border-radius:var(--radius-full);transition:width .3s}.progress-bar .time{color:var(--text2);font-size:13px}
.action-banner{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px 24px;display:flex;align-items:center;gap:20px;margin-bottom:20px;transition:var(--transition)}
.action-banner:hover{border-color:var(--blue);box-shadow:var(--shadow-sm)}
.action-banner .ab-icon{font-size:28px;flex-shrink:0}.action-banner p{color:var(--text);font-size:14px;flex:1}.action-banner .btn-sm{background:var(--blue);color:#fff;border:0;padding:10px 20px;border-radius:var(--radius-full);font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;transition:var(--transition)}.action-banner .btn-sm:hover{opacity:.92;transform:scale(1.02)}
.stat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:20px;margin-bottom:28px}
.stat-card{background:var(--surface);border-radius:var(--radius);padding:24px;text-align:center;border:1px solid var(--border);box-shadow:var(--shadow-sm);transition:var(--transition)}
.stat-card:hover{box-shadow:var(--shadow)}
.stat-card .num{font-size:32px;font-weight:700;color:var(--blue);margin-bottom:6px;letter-spacing:var(--heading-tight)}.stat-card .label{font-size:12px;color:var(--text2);text-transform:uppercase;letter-spacing:.08em}
.streak-bar{display:flex;gap:6px;margin:20px 0}.streak-day{width:36px;height:36px;border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;transition:var(--transition)}
.streak-day.done{background:var(--blue);color:#fff}.streak-day.now{background:var(--surface);color:var(--text);border:2px solid var(--blue)}.streak-day.future{background:var(--bg);color:var(--text2)}
.scroll-row{display:flex;gap:16px;overflow-x:auto;padding-bottom:12px;margin-bottom:28px;scrollbar-width:thin}
.promo-card{min-width:280px;background:var(--surface);border-radius:var(--radius);overflow:hidden;cursor:pointer;flex-shrink:0;transition:var(--transition);border:1px solid var(--border);box-shadow:var(--shadow-sm)}.promo-card:hover{transform:scale(1.02);box-shadow:var(--shadow-lg)}
.promo-card .promo-img{height:140px;display:flex;align-items:center;justify-content:center;font-size:40px}
.promo-card .promo-info{padding:18px}.promo-card .promo-info h3{color:var(--text);font-size:15px;font-weight:600;margin-bottom:6px}.promo-card .promo-info p{color:var(--text2);font-size:13px}
.data-table{width:100%;border-collapse:collapse;background:var(--surface);border-radius:var(--radius);overflow:hidden;border:1px solid var(--border);box-shadow:var(--shadow-sm)}
.data-table th{text-align:left;padding:14px 20px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--text2);background:var(--bg);border-bottom:1px solid var(--border)}
.data-table td{padding:14px 20px;border-bottom:1px solid var(--border);color:var(--text);font-size:14px;transition:var(--transition)}.data-table tr:hover td{background:var(--bg)}
.chip-ok{background:var(--green-light);color:var(--green);padding:5px 12px;border-radius:var(--radius-full);font-size:11px;font-weight:600}
.chip-info{background:var(--blue-light);color:var(--blue);padding:5px 12px;border-radius:var(--radius-full);font-size:11px;font-weight:600}
.chip-warn{background:var(--amber-light);color:var(--amber);padding:5px 12px;border-radius:var(--radius-full);font-size:11px;font-weight:600}
.tab-row{display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:28px}.tab-row a{padding:14px 24px;color:var(--text2);font-size:14px;text-decoration:none;cursor:pointer;border-bottom:2px solid transparent;transition:var(--transition)}.tab-row a:hover{color:var(--text)}.tab-row a.active{color:var(--text);border-bottom-color:var(--blue);font-weight:600}
.lock-box{background:var(--surface);border-radius:var(--radius);padding:48px;text-align:center;margin:0 40px;border:1px solid var(--border);box-shadow:var(--shadow)}
.lock-box .lock-icon{font-size:56px;margin-bottom:20px;opacity:.8}.lock-box h3{color:var(--text);font-size:22px;margin-bottom:10px}.lock-box p{color:var(--text2);margin-bottom:24px;font-size:15px}
.lock-box .btn{background:var(--blue);color:#fff;border:0;padding:14px 36px;border-radius:var(--radius-full);font-weight:600;cursor:pointer;font-size:15px;transition:var(--transition)}.lock-box .btn:hover{opacity:.92;transform:scale(1.02)}
.form-card{background:var(--surface);border-radius:var(--radius);padding:24px;border:1px solid var(--border)}
.form-row{margin-bottom:16px}.form-row label{display:block;font-size:12px;font-weight:600;color:var(--text2);margin-bottom:4px}
.sel-card{display:flex;align-items:center;justify-content:space-between}.sel-check{font-size:18px;color:var(--text2)}
body.viewport-mobile{justify-content:center}body.viewport-mobile .prototype-wrap{max-width:428px;width:100%;display:flex;flex:1;overflow:hidden;box-shadow:0 0 0 1px rgba(255,255,255,.1)}
</style></head><body class="${vp === 'mobile' ? 'viewport-mobile' : ''}">
<div class="prototype-wrap" style="display:flex;flex:1;overflow:hidden">
<div class="sb"><div class="sb-hdr"><h2>${esc(shortName)}</h2><p>${esc(outcome.slice(0, 80))}</p></div><div class="sb-nav">${navHtml}</div></div>
<div class="mn"><div class="topbar">${viewportToggle}<span class="tb-icon" title="Notifications">🔔</span><span class="tb-avatar">U</span></div>
<div class="mn-content">${screensHtml.join('')}</div></div>
</div>
${FEEDBACK_WIDGET_HTML}
<script>const F=${flowsJson};const NAV_IDS=${navDataJson};function navigateTo(i){document.querySelectorAll('.scr').forEach(s=>s.style.display='none');document.querySelectorAll('.ni').forEach(n=>n.classList.remove('on'));const s=document.getElementById('s'+i);if(s)s.style.display='block';document.querySelectorAll('[data-i="'+i+'"]').forEach(n=>n.classList.add('on'));window.scrollTo(0,0)}
(function(){var p=new URLSearchParams(location.search);var s=parseInt(p.get('screen')||'0',10)||0;if(s>0)navigateTo(s)})();</script>
</body></html>`;
}

function renderDashboard(shortName: string, problem: string, outcome: string, metricLabels: string[], metricValues: string[], flowScreens: any[], openQuestions: any[], includeFlows: boolean): string {
  const title = shortName || 'Dashboard';
  const subtitle = (problem || outcome).slice(0, 120) || 'Overview';

  const metricsHtml = metricLabels.slice(0, 4).map((label, i) =>
    `<div class="dash-metric"><div class="num">${esc(metricValues[i] ?? '—')}</div><div class="label">${esc(label)}</div></div>`
  ).join('');

  const activityRows = (flowScreens.length > 0
    ? flowScreens.flatMap((f, fi) =>
        (f.steps ?? []).slice(0, 2).map((st: any) =>
          `<tr onclick="navigateTo(${includeFlows ? fi + 1 : 0})"><td>${esc(st.actor_id ?? 'User')}</td><td>${esc(st.action ?? '')}</td><td>${esc(f.name ?? '')}</td><td>Just now</td></tr>`
        )
      )
    : []
  ).slice(0, 5);
  const activityHtml = activityRows.length > 0
    ? `<table class="dash-activity"><thead><tr><th>Actor</th><th>Action</th><th>Flow</th><th>When</th></tr></thead><tbody>${activityRows.join('')}</tbody></table>`
    : '<p style="color:var(--text2);font-size:14px">No recent activity yet.</p>';

  const qaCards = includeFlows && flowScreens.length > 0
    ? flowScreens.slice(0, 4).map((s, i) =>
        `<div class="qa-card" onclick="navigateTo(${i + 1})"><div class="qa-num">${i + 1}</div><span>${esc(s.name)}</span></div>`
      ).join('')
    : '<p style="color:var(--text2);font-size:14px">No flows available.</p>';

  const naItems = (Array.isArray(openQuestions) ? openQuestions.slice(0, 3) : []).map((q: any) =>
    `<div class="na-item">${esc(typeof q === 'string' ? q : q?.question ?? q?.text ?? '')}</div>`
  ).join('');
  const naHtml = naItems || '<p style="color:var(--text2);font-size:14px">Nothing needs attention.</p>';

  return `<div class="page-hdr"><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>
<div class="section" style="padding-top:24px">
  <div class="dash-metrics">${metricsHtml}</div>
  <div class="dash-grid">
    <div class="dash-card"><h3>Recent Activity</h3>${activityHtml}</div>
    <div class="dash-card"><h3>Quick Actions</h3><div class="qa-grid">${qaCards}</div></div>
  </div>
  <div class="dash-card" style="margin-top:24px"><h3>Needs Attention</h3><div class="na-list">${naHtml}</div></div>
</div>`;
}

// ---- Helpers: all content is derived from the document data ----

/** Extract categories, actors, content types, and domain entirely from the document corpus. Nothing hard-coded. */
function extractDocEntities(corpus: string): {
  categories: string[];
  actors: string[];
  keywords: string[];
  platformName: string;
  contentUnit: string;   // e.g. video, track, room, flight, listing
  itemLabel: string;    // e.g. workout, song, hotel, option
  contentItems: string[]; // browseable items derived from doc (e.g. "fitness videos" -> types)
} {
  const lower = corpus.toLowerCase();
  const capTerms = new Set<string>();
  let m: RegExpExecArray | null;

  // Pull capitalized multi-word terms
  const capRe = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
  while ((m = capRe.exec(corpus)) !== null) {
    const t = m[1]?.trim();
    if (t && t.length > 2 && t.length < 30 && !/^(As|The|This|That|When|From|With|For|And|But|Not|Our|All|New|Get|See|Set|Use|Can|May|Has|Its|Via|Per|Now|Let|How|Any)$/.test(t)) {
      capTerms.add(t);
    }
  }

  // Extract quoted terms
  const quotedRe = /["""]([^"""]{3,40})["""]/g;
  while ((m = quotedRe.exec(corpus)) !== null) {
    if (m[1]) capTerms.add(m[1].trim());
  }

  // Extract content types from patterns: "discover X", "browse X", "find X", "play X", "watch X", "book X", "X videos", "X tracks"
  const contentItems = new Set<string>();
  const discoverRe = /(?:discover|browse|find|see|play|watch|book|search for)\s+(?:some\s+|a\s+|my\s+)?(\w+(?:\s+\w+)?)\s*(?:and|,|\.|$)/gi;
  while ((m = discoverRe.exec(corpus)) !== null) {
    const term = m[1]?.trim();
    if (term && term.length > 2 && term.length < 25) contentItems.add(term.replace(/\s+/g, ' '));
  }
  const compoundRe = /\b(\w+)\s+(?:videos?|tracks?|songs?|playlists?|albums?|rooms?|flights?|listings?|options?|workouts?|sessions?|courses?)/gi;
  while ((m = compoundRe.exec(corpus)) !== null) {
    if (m[1] && m[1].length > 2) {
      capTerms.add(m[1].charAt(0).toUpperCase() + m[1].slice(1));
      contentItems.add(m[0]!.trim());
    }
  }
  // Pull the noun before common content words
  const typeRe = /\b(\w+)\s+(?:videos?|tracks?|songs?|rooms?|flights?|workouts?|sessions?|episodes?)\b/gi;
  while ((m = typeRe.exec(corpus)) !== null) {
    if (m[1] && m[1].length > 2 && !/^(the|some|my|all|any)$/i.test(m[1])) {
      capTerms.add(m[1].charAt(0).toUpperCase() + m[1].slice(1));
    }
  }

  const platformMatch = corpus.match(/\b(Google|Apple|Amazon|Netflix|YouTube|Instagram|TikTok|Slack|Notion|Salesforce|Shopify|Stripe)\b/i);
  const platformName = platformMatch?.[1] ?? '';

  const actorSet = new Set<string>();
  const actorRe = /As (?:a |an )([^,]+),/gi;
  while ((m = actorRe.exec(corpus)) !== null) {
    if (m[1] && m[1].length < 40) actorSet.add(m[1].trim());
  }

  const kwSet = new Set<string>();
  const kwRe = /\b(\w{4,}(?:s|es|ing|tion|ment|ness|ity|ance|ence)?\b)/gi;
  while ((m = kwRe.exec(corpus)) !== null) {
    if (m[1] && m[1].length > 4 && m[1].length < 20) kwSet.add(m[1].toLowerCase());
  }

  // Infer contentUnit and itemLabel from document (not hard-coded)
  let contentUnit = 'item';
  let itemLabel = 'item';
  if (/video|fitness|workout|exercise|stream/i.test(lower)) {
    contentUnit = 'video';
    itemLabel = /workout|session|class|exercise/i.test(lower) ? 'session' : 'video';
  } else if (/music|track|song|album|playlist|artist|podcast/i.test(lower)) {
    contentUnit = /playlist|album|podcast/i.test(lower) ? 'collection' : 'track';
    itemLabel = /playlist/i.test(lower) ? 'playlist' : /album/i.test(lower) ? 'album' : /podcast/i.test(lower) ? 'episode' : 'track';
  } else if (/hotel|room|accommodat|book\s+(?:a\s+)?(?:room|stay)/i.test(lower)) {
    contentUnit = 'listing';
    itemLabel = 'room';
  } else if (/flight|trip|travel|destination/i.test(lower)) {
    contentUnit = 'option';
    itemLabel = 'flight';
  } else if (/restaurant|reservation|table|dining/i.test(lower)) {
    contentUnit = 'listing';
    itemLabel = 'reservation';
  } else if (/product|item|listing|shop/i.test(lower)) {
    contentUnit = 'listing';
    itemLabel = 'product';
  }

  return {
    categories: [...capTerms].slice(0, 12),
    actors: [...actorSet].slice(0, 6),
    keywords: [...kwSet].slice(0, 20),
    platformName,
    contentUnit,
    itemLabel,
    contentItems: contentItems.size > 0 ? [...contentItems].slice(0, 8) : [...capTerms].slice(0, 6),
  };
}

/** Pick an icon based on actual flow step content, not hardcoded names */
function inferFlowIcon(s: any): string {
  const text = [s.name, ...(s.steps ?? []).map((st: any) => st.action ?? '')].join(' ').toLowerCase();
  if (/browse|discover|find|search|explore|catalog/i.test(text)) return '🔍';
  if (/premium|access|subscri|gate|upgrade|free|pay/i.test(text)) return '🔐';
  if (/play|watch|stream|video|audio|listen|media/i.test(text)) return '▶';
  if (/progress|streak|habit|goal|achiev|gamif|track|milestone/i.test(text)) return '📈';
  if (/analytic|report|metric|dashboard|perform|payout|partner|creator|onboard/i.test(text)) return '📊';
  if (/launch|gtm|market|comms|readiness/i.test(text)) return '🚀';
  if (/content|metadata|catalog|ingest|editorial/i.test(text)) return '📦';
  if (/device|tv|screen|transfer|nudge/i.test(text)) return '📱';
  return '📋';
}

const GRADIENT_PALETTE = [
  'linear-gradient(135deg,#1db954,#169c46)', 'linear-gradient(135deg,#e61e32,#c41230)',
  'linear-gradient(135deg,#8c67ab,#6b4d8a)', 'linear-gradient(135deg,#1e3264,#162850)',
  'linear-gradient(135deg,#e8115b,#c60e4e)', 'linear-gradient(135deg,#148a08,#0d6e05)',
  'linear-gradient(135deg,#537bc4,#3d5fa0)', 'linear-gradient(135deg,#f59b23,#c47f1a)',
  'linear-gradient(135deg,#0d73ec,#0a5bbe)', 'linear-gradient(135deg,#e91e63,#ad1457)',
  'linear-gradient(135deg,#00bcd4,#00838f)', 'linear-gradient(135deg,#ff5722,#d84315)',
];

/**
 * Render a single flow screen. Every piece of text comes from
 * the flow's own steps (action, result, actor_id) and the linked job.
 * The visual layout is inferred from step content patterns.
 */
function renderFlowScreen(s: any, idx: number, entities: ReturnType<typeof extractDocEntities>, productName: string): string {
  const steps: any[] = s.steps ?? [];
  const flowName: string = s.name ?? `Screen ${idx + 1}`;
  const flowDesc: string = s.job?.description ?? '';
  const allStepText = steps.map((st: any) => `${st.action ?? ''} ${st.result ?? ''}`).join(' ').toLowerCase();

  // Classify what KIND of screen this should be based on what the steps describe
  const hasBrowse = /browse|category|discover|find|explore|organized|section|hub|catalog|type|filter/i.test(allStepText);
  const hasSearch = /search|query|result|term|find.*result/i.test(allStepText);

  let sections = '';

  // Header: flow name + user-facing copy (not raw JTBD)
  sections += `<div class="page-hdr"><h1>${esc(flowName)}</h1><p>${esc(toUserFacingCopy(flowDesc, 200))}</p></div>`;

  // Add search bar if any step mentions search
  if (hasSearch || hasBrowse) {
    const searchHint = extractPhrase(allStepText, /search.*?for\s+(.+?)(?:\s+on\b|\s+and\b|,|$)/i) ?? productName;
    sections += `<div class="section"><div class="search-bar">🔍 <input placeholder="Search ${esc(searchHint.slice(0, 40))}..."/></div></div>`;
  }

  // Render each step using shared document-agnostic inference
  const allStepsText = steps.map((st: any) => `${st?.action ?? ''} ${st?.result ?? ''}`).join(' ');
  for (let si = 0; si < steps.length; si++) {
    const st = steps[si];
    const action: string = st?.action ?? '';
    const result: string = st?.result ?? '';
    const actor: string = st?.actor_id ?? '';
    const componentType = inferStepComponentType(action, result, allStepsText);

    switch (componentType) {
      case 'category_grid':
        sections += renderStepAsGrid(action, result, si, entities);
        break;
      case 'content_grid':
        sections += renderStepAsContentGrid(action, result, si, entities, productName);
        break;
      case 'search':
        sections += renderStepAsSearchResults(action, result, si, entities, productName);
        break;
      case 'access_gate':
        sections += renderStepAsAccessGate(action, result, si, productName);
        break;
      case 'media_player':
        sections += renderStepAsMediaPlayer(action, result, si, productName);
        break;
      case 'progress_tracker':
        sections += renderStepAsProgressTracker(action, result, si);
        break;
      case 'data_table':
        sections += renderStepAsDataTable(action, result, actor, si);
        break;
      case 'recommendations':
        sections += renderStepAsRecommendations(action, result, si, entities);
        break;
      case 'program_cards':
        sections += renderStepAsProgramCards(action, result, si, entities);
        break;
      case 'action_banner': {
        const ab = `${action} ${result}`.toLowerCase();
        const icon = /device|tv|screen|transfer|nudge|switch|viewing/i.test(ab) ? '📱' : /autoplay|interrupt|protect|exclude|background/i.test(ab) ? '🔇' : '🚀';
        sections += renderStepAsActionBanner(action, result, icon);
        break;
      }
      case 'selection_cards':
        sections += renderStepAsSelectionCards(action, result, si, entities);
        break;
      case 'form':
        sections += renderStepAsForm(action, result, si);
        break;
      case 'approval':
        sections += renderStepAsApproval(action, result, si);
        break;
      case 'preview':
        sections += renderStepAsPreview(action, result, si, entities, productName);
        break;
      case 'validation_results':
        sections += renderStepAsValidationResults(action, result, si);
        break;
      case 'success_state':
        sections += renderStepAsSuccessState(action, result, si);
        break;
      default:
        sections += renderStepAsFeatureCard(action, result, actor, si);
    }
  }

  return sections;
}

// ---- Step renderers: each turns a single step into a visual block ----

function renderStepAsGrid(action: string, result: string, _si: number, entities: ReturnType<typeof extractDocEntities>): string {
  let items = entities.categories.length > 0 ? entities.categories : entities.contentItems;
  if (items.length === 0) items = entities.keywords.slice(0, 6).map(k => k.charAt(0).toUpperCase() + k.slice(1));
  if (items.length === 0) items = [...new Set((action + ' ' + result).match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [])].slice(0, 6);
  items = items.slice(0, 8);
  const cards = items.map((cat, ci) =>
    `<div class="cat-card" style="background:${GRADIENT_PALETTE[ci % GRADIENT_PALETTE.length]}"><span>${esc(cat)}</span></div>`
  ).join('');
  return `<div class="section"><h2>${esc(toUserFacingCopy(action, 50))}</h2><p style="color:#b3b3b3;font-size:13px;margin:-8px 0 16px">${esc(toUserFacingCopy(result, 80))}</p><div class="cat-grid">${cards}</div></div>`;
}

function renderStepAsSearchResults(action: string, result: string, _si: number, entities: ReturnType<typeof extractDocEntities>, productName: string): string {
  const items = entities.categories.length > 0 ? entities.categories : entities.contentItems;
  const searchItems = (items.length > 0 ? items : entities.keywords.slice(0, 4).map(k => k.charAt(0).toUpperCase() + k.slice(1))).slice(0, 4);
  const results = searchItems.map((cat, i) =>
    `<div class="content-card"><div class="thumb" style="background:${GRADIENT_PALETTE[(i+3) % GRADIENT_PALETTE.length]}"><span style="color:#fff;font-size:14px;font-weight:600">${esc(cat)}</span></div><div class="info"><h3>${esc(cat)}</h3><p>${esc(productName)} · Result ${i+1}</p></div></div>`
  ).join('');
  return `<div class="section"><h2>${esc(toUserFacingCopy(action, 50))}</h2><p style="color:#b3b3b3;font-size:13px;margin:-8px 0 16px">${esc(toUserFacingCopy(result, 80))}</p><div class="content-grid">${results}</div></div>`;
}

/** Content grid: categories and labels come entirely from document (video, track, room, etc.) */
function renderStepAsContentGrid(action: string, result: string, _si: number, entities: ReturnType<typeof extractDocEntities>, productName: string): string {
  let items = entities.categories.length > 0 ? entities.categories.slice(0, 6) : entities.contentItems.slice(0, 6);
  if (items.length === 0) {
    const kw = entities.keywords.slice(0, 4).map(k => k.charAt(0).toUpperCase() + k.slice(1));
    items = kw.length > 0 ? kw : [];
  }
  if (items.length === 0) {
    const fromText = [...new Set((action + ' ' + result).match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [])].slice(0, 4);
    items = fromText.length > 0 ? fromText : [entities.itemLabel];
  }
  const showDuration = /video|track|song|audio|session|workout|episode/i.test(entities.contentUnit + entities.itemLabel);
  const cards = items.map((cat, i) => {
    const label = typeof cat === 'string' ? cat : String(cat);
    const subLabel = `${esc(productName)} · ${esc(entities.itemLabel)}`;
    const durBadge = showDuration ? `<span class="dur">—:—</span>` : '';
    return `<div class="content-card" style="cursor:pointer"><div class="thumb" style="background:${GRADIENT_PALETTE[i % GRADIENT_PALETTE.length]}"><span style="color:#fff;font-size:24px">▶</span>${durBadge}</div><div class="info"><h3>${esc(label)}</h3><p>${subLabel}</p></div></div>`;
  }).join('');
  return `<div class="section"><h2>${esc(toUserFacingCopy(action, 50))}</h2><p style="color:#b3b3b3;font-size:13px;margin:-8px 0 16px">${esc(toUserFacingCopy(result, 80))}</p><div class="content-grid">${cards}</div></div>`;
}

function renderStepAsAccessGate(action: string, result: string, _si: number, productName: string): string {
  // Determine if this step describes the premium benefit or the free-user lock
  const isFreeGate = /free.*user|upsell|upgrade|lock|restrict/i.test(`${action} ${result}`);
  if (isFreeGate) {
    return `<div class="section"><div class="lock-box"><div class="lock-icon">🔒</div><h3>${esc(toUserFacingCopy(action, 60))}</h3><p>${esc(toUserFacingCopy(result, 80))}</p><button class="btn">Upgrade</button></div></div>`;
  }
  return `<div class="banner" style="background:linear-gradient(135deg,#1db954,#1ed760)"><h2>${esc(toUserFacingCopy(action, 60))}</h2><p>${esc(toUserFacingCopy(result, 80))}</p><button class="btn">Explore ${esc(productName)}</button></div>`;
}

function renderStepAsMediaPlayer(action: string, result: string, _si: number, _productName: string): string {
  const hasSpeed = /speed|pace|rate|tempo/i.test(`${action} ${result}`);
  const speedControl = hasSpeed
    ? `<div style="display:flex;align-items:center;gap:12px;margin-top:12px"><span style="font-size:12px;color:#b3b3b3">Speed</span><select style="background:#282828;color:#fff;border:1px solid #404040;border-radius:6px;padding:6px 12px;font-size:13px;cursor:pointer"><option>0.5×</option><option>0.75×</option><option selected>1×</option><option>1.25×</option><option>1.5×</option><option>1.75×</option><option>2×</option></select></div>`
    : '';
  return `<div class="section" style="max-width:800px">
    <div class="media-player"><div style="position:absolute;inset:0;background:linear-gradient(180deg,transparent 60%,rgba(0,0,0,.8))"></div><button class="play-btn">▶</button>
      <div class="overlay-text">${esc(toUserFacingCopy(action, 60))}</div></div>
    <h2 style="margin-bottom:4px">${esc(toUserFacingCopy(action, 60))}</h2><p style="color:#b3b3b3;margin-bottom:16px;font-size:13px">${esc(toUserFacingCopy(result, 80))}</p>
    <div class="progress-bar"><span class="time">0:00</span><div class="track"><div class="fill"></div></div><span class="time">--:--</span></div>
    ${speedControl}
  </div>`;
}

function renderStepAsProgressTracker(action: string, result: string, _si: number): string {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const streakHtml = days.map((d, i) =>
    i < 3 ? `<div class="streak-day done">${d}</div>` : i === 3 ? `<div class="streak-day now">${d}</div>` : `<div class="streak-day future">${d}</div>`
  ).join('');
  return `<div class="section">
    <h2>${esc(toUserFacingCopy(action, 50))}</h2><p style="color:#b3b3b3;font-size:13px;margin:-8px 0 16px">${esc(toUserFacingCopy(result, 80))}</p>
    <div class="stat-grid"><div class="stat-card"><div class="num">—</div><div class="label">completed</div></div><div class="stat-card"><div class="num">—</div><div class="label">streak</div></div><div class="stat-card"><div class="num">—</div><div class="label">total time</div></div></div>
    <div class="streak-bar">${streakHtml}</div>
  </div>`;
}

function renderStepAsDataTable(action: string, result: string, actor: string, _si: number): string {
  return `<div class="section"><h2>${esc(toUserFacingCopy(action, 50))}</h2><p style="color:#b3b3b3;font-size:13px;margin:-8px 0 16px">${esc(toUserFacingCopy(result, 80))}</p>
    <table class="data-table"><thead><tr><th>ITEM</th><th>VALUE</th><th>TREND</th><th>STATUS</th></tr></thead>
    <tbody><tr><td colspan="4" style="color:#b3b3b3;text-align:center;padding:24px">Data populated from ${esc(actor || 'system')}</td></tr></tbody></table>
  </div>`;
}

function renderStepAsRecommendations(action: string, result: string, _si: number, entities: ReturnType<typeof extractDocEntities>): string {
  let items = (entities.categories.length > 0 ? entities.categories : entities.contentItems).slice(0, 3);
  if (items.length === 0) items = entities.keywords.slice(0, 3).map(k => k.charAt(0).toUpperCase() + k.slice(1));
  const cards = items.map((item, i) =>
    `<div class="promo-card"><div class="promo-img" style="background:${GRADIENT_PALETTE[(i+5)%GRADIENT_PALETTE.length]}"><span style="color:#fff;font-size:14px;font-weight:600">${esc(item)}</span></div><div class="promo-info"><h3>${esc(item)}</h3><p>Recommended</p></div></div>`
  ).join('');
  return `<div class="section"><h2>${esc(toUserFacingCopy(action, 50))}</h2><p style="color:#b3b3b3;font-size:13px;margin:-8px 0 16px">${esc(toUserFacingCopy(result, 80))}</p><div class="scroll-row">${cards}</div></div>`;
}

function renderStepAsActionBanner(action: string, result: string, icon: string): string {
  return `<div class="section"><div class="action-banner"><span class="ab-icon">${icon}</span><p>${esc(action)}</p><button class="btn-sm">${esc(result.slice(0, 30) || 'Learn more')}</button></div></div>`;
}

function renderStepAsProgramCards(action: string, result: string, _si: number, entities: ReturnType<typeof extractDocEntities>): string {
  let items = (entities.categories.length > 0 ? entities.categories : entities.contentItems).slice(0, 3);
  if (items.length === 0) items = entities.keywords.slice(0, 3).map(k => k.charAt(0).toUpperCase() + k.slice(1));
  const suffix = /program|challenge|series|multi.?session/i.test(action + ' ' + result) ? ' Program' : '';
  const subLabel = /multi.?session|series|challenge/i.test(action + ' ' + result) ? 'Multi-session · In progress' : `Recommended ${entities.itemLabel}`;
  const cards = items.map((item, i) =>
    `<div class="promo-card"><div class="promo-img" style="background:${GRADIENT_PALETTE[i % GRADIENT_PALETTE.length]}"><span style="color:#fff;font-size:14px;font-weight:600">${esc(item)}</span></div><div class="promo-info"><h3>${esc(item)}${suffix}</h3><p>${esc(subLabel)}</p></div></div>`
  ).join('');
  return `<div class="section"><h2>${esc(toUserFacingCopy(action, 50))}</h2><p style="color:#b3b3b3;font-size:13px;margin:-8px 0 16px">${esc(toUserFacingCopy(result, 80))}</p><div class="scroll-row">${cards}</div></div>`;
}

function renderStepAsFeatureCard(action: string, result: string, actor: string, si: number): string {
  return `<div class="section"><div class="feature-card"><div class="fc-icon">${si+1}</div><div><h3>${esc(toUserFacingCopy(action, 50))}</h3>${result ? `<p>${esc(toUserFacingCopy(result, 80))}</p>` : ''}${actor ? `<p style="margin-top:4px"><span class="tag">${esc(actor)}</span></p>` : ''}</div></div></div>`;
}

function renderStepAsSelectionCards(action: string, result: string, _si: number, entities: ReturnType<typeof extractDocEntities>): string {
  const items = entities.categories.length > 0 ? entities.categories : entities.contentItems;
  const opts = (items.length > 0 ? items : entities.keywords.slice(0, 6).map(k => k.charAt(0).toUpperCase() + k.slice(1))).slice(0, 6);
  const cards = opts.map((opt) =>
    `<div class="cat-card sel-card" style="cursor:pointer;border:2px solid var(--border)"><span>${esc(opt)}</span><span class="sel-check">☐</span></div>`
  ).join('');
  return `<div class="section"><h2>${esc(toUserFacingCopy(action, 50))}</h2><p style="color:var(--text2);font-size:13px;margin:-8px 0 16px">${esc(toUserFacingCopy(result, 80))}</p><div class="cat-grid">${cards}</div></div>`;
}

function renderStepAsForm(action: string, result: string, _si: number): string {
  const fields = ['Name', 'Description', 'Settings'].map((label) =>
    `<div class="form-row"><label>${esc(label)}</label><input type="text" placeholder="Enter ${esc(label.toLowerCase())}..." class="wz-textarea" style="margin-top:4px"/></div>`
  ).join('');
  return `<div class="section"><h2>${esc(toUserFacingCopy(action, 50))}</h2><p style="color:var(--text2);font-size:13px;margin:-8px 0 16px">${esc(toUserFacingCopy(result, 80))}</p><div class="form-card"><div class="form-fields">${fields}</div><button class="action-banner btn-sm" style="margin-top:16px">Submit</button></div></div>`;
}

function renderStepAsApproval(action: string, result: string, _si: number): string {
  return `<div class="section"><div class="feature-card"><div class="fc-icon">✓</div><div><h3>${esc(toUserFacingCopy(action, 50))}</h3><p>${esc(toUserFacingCopy(result, 80))}</p><div style="display:flex;gap:12px;margin-top:16px"><button class="action-banner btn-sm" style="background:var(--green)">Approve</button><button class="action-banner btn-sm" style="background:var(--red)">Reject</button></div></div></div></div>`;
}

function renderStepAsPreview(action: string, result: string, _si: number, entities: ReturnType<typeof extractDocEntities>, productName: string): string {
  const items = entities.categories.slice(0, 2).length > 0 ? entities.categories.slice(0, 2) : entities.contentItems.slice(0, 2);
  const previewItems = items.length > 0 ? items : [productName, 'Preview'];
  const left = previewItems.map((it, i) => `<div class="content-card"><div class="thumb" style="background:${GRADIENT_PALETTE[i % GRADIENT_PALETTE.length]}"><span style="color:#fff">▶</span></div><div class="info"><h3>${esc(it)}</h3><p>Preview</p></div></div>`).join('');
  const right = `<div class="dash-card" style="padding:24px"><h3 style="margin-bottom:12px">Preview</h3><p style="color:var(--text2);font-size:14px">${esc(toUserFacingCopy(result, 120))}</p><button class="action-banner btn-sm" style="margin-top:16px">Confirm</button></div>`;
  return `<div class="section"><h2>${esc(toUserFacingCopy(action, 50))}</h2><div class="preview-split" style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:16px"><div class="content-grid">${left}</div>${right}</div></div>`;
}

function renderStepAsValidationResults(action: string, result: string, _si: number): string {
  const rows = [['Field A', 'Valid', 'chip-ok', '✓'], ['Field B', 'Invalid', 'chip-warn', '✗'], ['Field C', 'Valid', 'chip-ok', '✓']].map(([f, s, chip, icon]) =>
    `<tr><td>${esc(f ?? '')}</td><td>${esc(s ?? '')}</td><td><span class="${chip}">${icon}</span></td></tr>`
  ).join('');
  return `<div class="section"><h2>${esc(toUserFacingCopy(action, 50))}</h2><p style="color:var(--text2);font-size:13px;margin:-8px 0 16px">${esc(toUserFacingCopy(result, 80))}</p><div class="dash-card"><table class="data-table"><thead><tr><th>Field</th><th>Status</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function renderStepAsSuccessState(action: string, result: string, _si: number): string {
  return `<div class="section"><div class="banner" style="text-align:center;padding:48px"><span style="font-size:48px;display:block;margin-bottom:16px">✓</span><h2>${esc(toUserFacingCopy(action, 50))}</h2><p>${esc(toUserFacingCopy(result, 100))}</p></div></div>`;
}

/** Extract a phrase from text using a regex, returning the first capture group */
function extractPhrase(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m?.[1]?.trim() ?? null;
}

// =====================================================
// CONSUMER PROTOTYPE (light theme, top nav, card-based)
// Covers Instagram, Airbnb, TikTok, generic consumer apps
// Flow screens only — no wizard
// =====================================================
function consumerPrototype(ctx: CpmContext, flowScreens: any[], flowsJson: string, desc: string): string {
  const accent = /instagram/i.test(desc) ? '#E1306C' : /airbnb/i.test(desc) ? '#FF5A5F' : /tiktok/i.test(desc) ? '#FE2C55' : /uber/i.test(desc) ? '#000000' : '#3B82F6';
  const appLabel = /instagram/i.test(desc) ? 'Instagram' : /airbnb/i.test(desc) ? 'Airbnb' : /tiktok/i.test(desc) ? 'TikTok' : esc(ctx.appName.slice(0, 20));
  const t: ThemeColors = { accent, bg: '#FAFAFA', surface: '#fff', text: '#262626', muted: '#8E8E8E', border: '#EFEFEF', success: '#10B981', warning: 'rgba(245,158,11,.3)' };

  const navTabs = flowScreens.length > 0 ? flowScreens.map((s: any, i: number) => `<a class="tn${i===0?' on':''}" onclick="go(${i})" data-i="${i}">${esc(s.name.slice(0,12))}</a>`).join('') : '<a class="tn on" data-i="0">No flows</a>';

  const flowScreensHtml = flowScreens.length > 0 ? flowScreens.map((s: any, idx: number) => {
    const steps: any[] = s.steps ?? [];
    const allText = steps.map((st: any) => `${st?.action ?? ''} ${st?.result ?? ''}`).join(' ');
    const jobDesc = s.job?.description ?? '';
    const stepsUi = steps.map((st: any, si: number) => {
      const componentType = inferFlowAwareComponentType(s.name ?? '', jobDesc, st?.action ?? '', st?.result ?? '', si, steps.length, allText);
      return renderStepComponent(componentType, st?.action ?? '', st?.result ?? '', st?.actor_id ?? '', si, accent);
    }).join('');
    return `<div class="scr" id="s${idx}" style="display:${idx===0?'block':'none'}">
      <div class="page-hero" style="border-left:4px solid ${accent}">
        <h2>${esc(s.name)}</h2>
        ${s.job ? `<p>${esc(toUserFacingCopy(jobDesc, 80))}</p>` : ''}
      </div>
      ${stepsUi}
    </div>`;
  }).join('') : `<div class="scr" id="s0" style="display:block"><p style="color:var(--text2);padding:40px;text-align:center">No user flows extracted.</p></div>`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(ctx.appName)}</title>${DESIGN_SYSTEM_FONTS}
<style>${DESIGN_SYSTEM_CSS}
*{margin:0;padding:0;box-sizing:border-box}body{font-family:var(--font);background:var(--bg);color:var(--text);font-size:14px;line-height:var(--body-leading)}
.topnav{background:var(--surface);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;padding:0 24px;height:56px;position:sticky;top:0;z-index:10;box-shadow:var(--shadow-sm)}
.topnav h1{font-size:18px;font-weight:700;color:${accent};letter-spacing:var(--heading-tight)}.topnav-r{display:flex;align-items:center;gap:16px;font-size:20px;color:var(--text)}
.subnav{background:var(--surface);border-bottom:1px solid var(--border);display:flex;gap:0;padding:0 24px;overflow-x:auto}
.tn{padding:12px 16px;font-size:13px;font-weight:500;color:var(--text2);cursor:pointer;text-decoration:none;border-bottom:2px solid transparent;white-space:nowrap;transition:var(--transition)}.tn:hover{color:var(--text)}.tn.on{color:${accent};border-bottom-color:${accent};font-weight:600}
.main{max-width:800px;margin:0 auto;padding:24px}
.page-hero{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:24px 28px;margin-bottom:20px;box-shadow:var(--shadow-sm)}
.page-hero h2{font-size:20px;font-weight:600;color:var(--text);margin-bottom:6px;letter-spacing:var(--heading-tight)}
.page-hero p{font-size:14px;color:var(--text2)}
.flow-cards{display:flex;flex-direction:column;gap:12px}
.fcard{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:18px 22px;display:flex;gap:16px;align-items:flex-start;transition:var(--transition);cursor:pointer;box-shadow:var(--shadow-sm)}
.fcard:hover{box-shadow:var(--shadow-lg);border-color:var(--border)}
.fcard-num{width:36px;height:36px;border-radius:50%;background:${accent};color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0}
.fcard-body{flex:1}
.fcard-actor{font-size:11px;font-weight:600;text-transform:uppercase;color:${accent};letter-spacing:.5px;margin-bottom:2px}
.fcard-action{font-size:14px;font-weight:500;color:var(--text);margin-bottom:4px}
.fcard-result{font-size:13px;color:var(--text2)}
.scr{display:none}.wz-wrap{max-width:720px;margin:0 auto}${wizardScreenStyles(t)}
.mo{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.4);display:none;align-items:center;justify-content:center;z-index:100}.mo-c{background:var(--surface);border-radius:var(--radius-lg);padding:24px;max-width:480px;width:90%;box-shadow:var(--shadow-xl)}.mo-h{display:flex;justify-content:space-between;margin-bottom:14px}.mo-h h3{color:var(--text);font-size:16px}.mo-x{background:0;border:0;color:var(--text2);font-size:18px;cursor:pointer}.mo-l{font-size:10px;font-weight:600;text-transform:uppercase;color:var(--text2);margin-bottom:2px}.mo-v{font-size:14px;color:var(--text);margin-bottom:12px}
</style></head><body>
<div class="topnav"><h1>${appLabel}</h1><div class="topnav-r">🔍 ❤️ 👤</div></div>
<div class="subnav">${navTabs}</div>
<div class="main">${flowScreensHtml}</div>
<div class="mo" id="mo" onclick="if(event.target===this)xm()"><div class="mo-c"><div class="mo-h"><h3 id="mt"></h3><button class="mo-x" onclick="xm()">✕</button></div><div id="mb"></div></div></div>
${FEEDBACK_WIDGET_HTML}
<script>const F=${flowsJson};function go(i){document.querySelectorAll('.scr').forEach(s=>s.style.display='none');document.querySelectorAll('.tn').forEach(n=>n.classList.remove('on'));const s=document.getElementById('s'+i);if(s)s.style.display='block';document.querySelectorAll('[data-i="'+i+'"]').forEach(n=>n.classList.add('on'))}function step(fi,si){const f=F[fi];if(!f)return;const st=f.s[si];if(!st)return;document.getElementById('mt').textContent='Step '+(si+1);document.getElementById('mb').innerHTML='<div class="mo-l">Actor</div><div class="mo-v">'+st.a+'</div><div class="mo-l">Action</div><div class="mo-v">'+st.x+'</div><div class="mo-l">Result</div><div class="mo-v">'+st.r+'</div>';document.getElementById('mo').style.display='flex'}function xm(){document.getElementById('mo').style.display='none'}document.addEventListener('keydown',e=>{if(e.key==='Escape')xm()})</script>
</body></html>`;
}

// =====================================================
// SOCIAL MEDIA PROTOTYPE (Instagram, TikTok, Snapchat)
// Bottom tab bar + stories row + feed cards
// Flow screens only — no wizard
// =====================================================
function socialPrototype(ctx: CpmContext, flowScreens: any[], flowsJson: string, desc: string): string {
  const nameAndDesc = `${ctx.appName} ${desc}`;
  const accent = /instagram/i.test(nameAndDesc) ? '#E1306C' : /tiktok/i.test(nameAndDesc) ? '#FE2C55' : /snapchat/i.test(nameAndDesc) ? '#FFFC00' : /discord/i.test(nameAndDesc) ? '#5865F2' : '#E1306C';
  const brandName = ctx.appName.replace(/\bPrd\b/gi, '').replace(/\s+/g, ' ').trim();
  const label = /instagram/i.test(nameAndDesc) ? 'Instagram' : /tiktok/i.test(nameAndDesc) ? 'TikTok' : /snapchat/i.test(nameAndDesc) ? 'Snapchat' : /discord/i.test(nameAndDesc) ? 'Discord' : brandName.slice(0, 20);
  const isDark = /tiktok|discord/i.test(nameAndDesc);
  const bg = isDark ? '#000' : '#FAFAFA';
  const card = isDark ? '#1a1a1a' : '#fff';
  const text = isDark ? '#fff' : '#262626';
  const muted = isDark ? '#aaa' : '#8e8e8e';
  const border = isDark ? '#333' : '#DBDBDB';
  const t: ThemeColors = { accent, bg, surface: card, text, muted, border, success: '#10B981', warning: 'rgba(245,158,11,.3)' };

  const tabLabels = flowScreens.length > 0 ? flowScreens.slice(0, 5).map((s: any) => s.name.slice(0, 8)) : ['No flows'];
  const bottomTabs = tabLabels.map((l, i) =>
    `<div class="btab${i===0?' on':''}" onclick="go(${i})" data-i="${i}"><span class="btab-ic">${['🏠','📄','💼','⚡','📊'][i]??'📌'}</span><span class="btab-l">${esc(l)}</span></div>`
  ).join('');

  const flowScreensHtml = flowScreens.length > 0 ? flowScreens.map((s: any, idx: number) => {
    const steps: any[] = s.steps ?? [];
    const allText = steps.map((st: any) => `${st?.action ?? ''} ${st?.result ?? ''}`).join(' ');
    const jobDesc = s.job?.description ?? '';
    const stepsUi = steps.map((st: any, si: number) => {
      const componentType = inferFlowAwareComponentType(s.name ?? '', jobDesc, st?.action ?? '', st?.result ?? '', si, steps.length, allText);
      return renderStepComponent(componentType, st?.action ?? '', st?.result ?? '', st?.actor_id ?? '', si, accent);
    }).join('');
    return `<div class="scr" id="s${idx}" style="display:${idx===0?'block':'none'}">
      <div style="padding:16px">
        <h2 style="font-size:18px;font-weight:700;color:${text};margin-bottom:4px">${esc(s.name)}</h2>
        ${s.job ? `<p style="font-size:13px;color:${muted};margin-bottom:16px">${esc(toUserFacingCopy(jobDesc, 80))}</p>` : ''}
        ${stepsUi}
      </div>
    </div>`;
  }).join('') : `<div class="scr" id="s0" style="display:block"><p style="color:${muted};padding:40px;text-align:center">No user flows extracted.</p></div>`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(ctx.appName)}</title>${DESIGN_SYSTEM_FONTS}
<style>${DESIGN_SYSTEM_CSS}
*{margin:0;padding:0;box-sizing:border-box}body{font-family:var(--font);background:${bg};color:${text};font-size:14px;padding-bottom:60px;line-height:var(--body-leading)}
.topbar{position:sticky;top:0;z-index:10;background:${card};border-bottom:1px solid ${border};display:flex;align-items:center;justify-content:space-between;padding:0 16px;height:52px}
.topbar h1{font-size:22px;font-weight:700;color:${text};font-style:italic;letter-spacing:var(--heading-tight)}.topbar-r{display:flex;gap:16px;font-size:20px}
.stories{display:flex;gap:12px;padding:12px 16px;overflow-x:auto;border-bottom:1px solid ${border};background:${card}}
.story{text-align:center;flex-shrink:0}.story-ring{width:56px;height:56px;border-radius:50%;border:2px solid ${accent};display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:${accent};margin-bottom:4px;transition:var(--transition)}.story:hover .story-ring{transform:scale(1.05)}.story-name{font-size:11px;color:${muted};max-width:56px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.feed{max-width:600px;margin:0 auto;padding:8px 0}
.feed-card{background:${card};border:1px solid ${border};margin-bottom:8px;transition:var(--transition)}.feed-card:hover{border-color:${accent}}
.feed-hdr{display:flex;align-items:center;gap:10px;padding:10px 14px}.feed-av{width:32px;height:32px;border-radius:50%;background:${accent};color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700}.feed-hdr strong{font-size:14px;color:${text}}.feed-sub{font-size:11px;color:${muted}}
.feed-body{padding:0 14px 10px;font-size:14px;color:${text};line-height:1.5}
.feed-actions{display:flex;gap:16px;padding:8px 14px;border-top:1px solid ${border};font-size:13px;color:${text}}
.feed-result{padding:6px 14px 10px;font-size:12px;color:${muted};font-style:italic}
.bottom-bar{position:fixed;bottom:0;left:0;right:0;background:${card};border-top:1px solid ${border};display:flex;justify-content:space-around;padding:6px 0;z-index:10}
.btab{text-align:center;cursor:pointer;padding:4px 8px;color:${muted};font-size:10px;transition:var(--transition)}.btab.on{color:${accent}}.btab-ic{display:block;font-size:20px;margin-bottom:2px}
.scr{display:none}.wz-wrap{max-width:600px;margin:0 auto}${wizardScreenStyles(t)}
</style></head><body>
<div class="topbar"><h1>${label}</h1><div class="topbar-r">❤️ 💬</div></div>
${flowScreensHtml}
<div class="bottom-bar">${bottomTabs}</div>
${FEEDBACK_WIDGET_HTML}
<script>const F=${flowsJson};function go(i){document.querySelectorAll('.scr').forEach(s=>s.style.display='none');document.querySelectorAll('.btab').forEach(n=>n.classList.remove('on'));const s=document.getElementById('s'+i);if(s)s.style.display='block';document.querySelectorAll('[data-i="'+i+'"]').forEach(n=>n.classList.add('on'))}</script>
</body></html>`;
}

// =====================================================
// Flow-context-aware step type inference
// Uses both the flow name and individual step text to pick the right component
// =====================================================
function inferFlowAwareComponentType(
  flowName: string,
  jobDesc: string,
  action: string,
  result: string,
  si: number,
  totalSteps: number,
  allStepsText: string
): string {
  const act = action.toLowerCase();
  const res = result.toLowerCase();
  const flowCtx = `${flowName} ${jobDesc}`.toLowerCase();

  const typeFromInference = inferStepComponentType(action, result, allStepsText);
  if (typeFromInference !== 'feature_card' && typeFromInference !== 'action_banner') return typeFromInference;

  if (si === totalSteps - 1 || /^(execute|complete|finalize|goal achieved)/i.test(act) || /completed successfully|transaction completed|goal achieved/i.test(res)) {
    return 'success_state';
  }
  if (/^(review and confirm|approve|sign.?off)/i.test(act) || (si === totalSteps - 2 && totalSteps > 2)) {
    return 'approval';
  }
  if (/^(confirm action|confirm )/i.test(act) && /successfully/i.test(res)) {
    return 'success_state';
  }

  if (/^initiate|^start|^begin|^open|^trigger/i.test(act) || si === 0) {
    if (/report|issue|submit|request|create|file|raise|fill|input|describe/i.test(flowCtx)) return 'form';
    if (/view|see|check|understand|detail|reservation|booking|status|order|receipt/i.test(flowCtx)) return 'data_table';
    if (/search|find|discover|browse/i.test(flowCtx)) return 'search';
    if (/choose|select|option|resolution|guided|pick|decide/i.test(flowCtx)) return 'selection_cards';
    if (/recommend|suggest|improve|insight|tip/i.test(flowCtx)) return 'recommendations';
    if (/track|progress|goal|streak|monitor/i.test(flowCtx)) return 'progress_tracker';
    return 'data_table';
  }

  if (/^(process|prepare|load|fetch|calculate|compute|retrieve|gather)/i.test(act)) return 'data_table';

  return typeFromInference;
}

// =====================================================
// Portable step-to-UI renderer (inline styles, works in any prototype)
// Converts a single flow step into an interactive UI component
// =====================================================
function renderStepComponent(type: string, action: string, result: string, actor: string, si: number, accent: string): string {
  const a = esc(toUserFacingCopy(action, 60));
  const r = esc(toUserFacingCopy(result, 100));
  const bdr = '#EBEBEB';
  const bg2 = '#F8FAFC';
  const muted = '#717171';

  switch (type) {
    case 'form':
      return `<div style="background:#fff;border:1px solid ${bdr};border-radius:12px;padding:24px;margin-bottom:16px">
        <h3 style="font-size:16px;font-weight:600;margin-bottom:4px">${a}</h3>
        ${r ? `<p style="font-size:13px;color:${muted};margin-bottom:16px">${r}</p>` : ''}
        <div style="margin-bottom:12px"><label style="font-size:12px;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:.04em">Type</label><select style="display:block;width:100%;padding:10px 12px;border:1px solid ${bdr};border-radius:8px;font-size:14px;margin-top:4px;background:#fff"><option>Select...</option></select></div>
        <div style="margin-bottom:12px"><label style="font-size:12px;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:.04em">Description</label><textarea style="display:block;width:100%;padding:10px 12px;border:1px solid ${bdr};border-radius:8px;font-size:14px;margin-top:4px;min-height:80px;resize:vertical" placeholder="Describe in detail..."></textarea></div>
        <button style="background:${accent};color:#fff;border:0;border-radius:8px;padding:12px 24px;font-size:14px;font-weight:600;cursor:pointer">Submit</button>
      </div>`;

    case 'search':
      return `<div style="background:#fff;border:1px solid ${bdr};border-radius:12px;padding:24px;margin-bottom:16px">
        <h3 style="font-size:16px;font-weight:600;margin-bottom:12px">${a}</h3>
        <div style="display:flex;align-items:center;gap:8px;background:${bg2};border:1px solid ${bdr};border-radius:24px;padding:10px 16px;margin-bottom:16px"><span>🔍</span><input type="text" placeholder="Search..." style="border:0;background:none;flex:1;font-size:14px;outline:none"/></div>
        ${[1,2,3].map(i => `<div style="display:flex;align-items:center;gap:12px;padding:12px;border-bottom:1px solid ${bdr};cursor:pointer"><div style="width:48px;height:48px;border-radius:8px;background:${bg2};display:flex;align-items:center;justify-content:center;font-size:18px;color:${accent}">${i}</div><div><div style="font-size:14px;font-weight:500">Result ${i}</div><div style="font-size:12px;color:${muted}">Matching item</div></div></div>`).join('')}
      </div>`;

    case 'selection_cards':
      return `<div style="background:#fff;border:1px solid ${bdr};border-radius:12px;padding:24px;margin-bottom:16px">
        <h3 style="font-size:16px;font-weight:600;margin-bottom:4px">${a}</h3>
        ${r ? `<p style="font-size:13px;color:${muted};margin-bottom:16px">${r}</p>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">${['Option A', 'Option B', 'Option C', 'Option D'].map((opt, i) =>
          `<div style="border:2px solid ${i === 0 ? accent : bdr};border-radius:10px;padding:16px;cursor:pointer;background:${i === 0 ? accent + '08' : '#fff'};transition:all .15s"><div style="font-size:14px;font-weight:600;color:${i === 0 ? accent : '#222'}">${opt}</div><div style="font-size:12px;color:${muted};margin-top:4px">Choose this option</div></div>`
        ).join('')}</div>
      </div>`;

    case 'data_table':
      return `<div style="background:#fff;border:1px solid ${bdr};border-radius:12px;padding:24px;margin-bottom:16px">
        <h3 style="font-size:16px;font-weight:600;margin-bottom:4px">${a}</h3>
        ${r ? `<p style="font-size:13px;color:${muted};margin-bottom:16px">${r}</p>` : ''}
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">${['94%', '2.4K', '+18%'].map((v, i) => `<div style="background:${bg2};border-radius:8px;padding:14px;text-align:center"><div style="font-size:22px;font-weight:700;color:${accent}">${v}</div><div style="font-size:11px;color:${muted};margin-top:4px;text-transform:uppercase">${['Rate', 'Total', 'Change'][i]}</div></div>`).join('')}</div>
        <div style="height:120px;background:${bg2};border-radius:8px;display:flex;align-items:flex-end;padding:12px;gap:6px">${[65,45,80,55,70,90,60,75].map(h => `<div style="flex:1;height:${h}%;background:${accent};border-radius:4px 4px 0 0;opacity:.7"></div>`).join('')}</div>
      </div>`;

    case 'approval':
      return `<div style="background:#fff;border:1px solid ${bdr};border-radius:12px;padding:24px;margin-bottom:16px">
        <h3 style="font-size:16px;font-weight:600;margin-bottom:4px">${a}</h3>
        ${r ? `<p style="font-size:13px;color:${muted};margin-bottom:16px">${r}</p>` : ''}
        <div style="background:${bg2};border-radius:8px;padding:16px;margin-bottom:16px">${['Item', 'Details', 'Amount'].map(f => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid ${bdr}"><span style="font-size:13px;color:${muted}">${f}</span><span style="font-size:13px;font-weight:500">—</span></div>`).join('')}</div>
        <div style="display:flex;gap:12px"><button style="flex:1;background:${accent};color:#fff;border:0;border-radius:8px;padding:12px;font-size:14px;font-weight:600;cursor:pointer">Confirm</button><button style="flex:1;background:#fff;color:#222;border:1px solid ${bdr};border-radius:8px;padding:12px;font-size:14px;font-weight:500;cursor:pointer">Cancel</button></div>
      </div>`;

    case 'success_state':
      return `<div style="background:#fff;border:1px solid ${bdr};border-radius:12px;padding:40px 24px;margin-bottom:16px;text-align:center">
        <div style="width:64px;height:64px;border-radius:50%;background:#E6F9F0;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:28px;color:#10B981">✓</div>
        <h3 style="font-size:18px;font-weight:600;margin-bottom:8px">${a}</h3>
        ${r ? `<p style="font-size:14px;color:${muted};max-width:360px;margin:0 auto 20px">${r}</p>` : ''}
        <button style="background:${accent};color:#fff;border:0;border-radius:8px;padding:12px 32px;font-size:14px;font-weight:600;cursor:pointer">Done</button>
      </div>`;

    case 'progress_tracker':
      return `<div style="background:#fff;border:1px solid ${bdr};border-radius:12px;padding:24px;margin-bottom:16px">
        <h3 style="font-size:16px;font-weight:600;margin-bottom:12px">${a}</h3>
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px"><svg viewBox="0 0 80 80" width="80" height="80"><circle cx="40" cy="40" r="34" fill="none" stroke="#eee" stroke-width="6"/><circle cx="40" cy="40" r="34" fill="none" stroke="${accent}" stroke-width="6" stroke-dasharray="${2*Math.PI*34*0.7} ${2*Math.PI*34*0.3}" stroke-linecap="round" transform="rotate(-90 40 40)"/><text x="40" y="44" text-anchor="middle" font-size="16" font-weight="700" fill="#222">70%</text></svg><div><div style="font-size:14px;font-weight:500;margin-bottom:4px">${r || 'On track'}</div><div style="font-size:12px;color:${muted}">Updated just now</div></div></div>
        <div style="background:${bg2};border-radius:6px;height:8px;overflow:hidden"><div style="width:70%;height:100%;background:${accent};border-radius:6px"></div></div>
      </div>`;

    case 'recommendations':
      return `<div style="background:#fff;border:1px solid ${bdr};border-radius:12px;padding:24px;margin-bottom:16px">
        <h3 style="font-size:16px;font-weight:600;margin-bottom:12px">${a}</h3>
        ${[0,1,2].map(i => `<div style="display:flex;align-items:center;gap:14px;padding:12px;border:1px solid ${bdr};border-radius:10px;margin-bottom:8px;cursor:pointer;transition:all .15s"><div style="width:44px;height:44px;border-radius:8px;background:${GRADIENT_PALETTE[i % GRADIENT_PALETTE.length]};display:flex;align-items:center;justify-content:center;font-size:18px;color:#fff">${['💡','🎯','⭐'][i]}</div><div style="flex:1"><div style="font-size:14px;font-weight:500">Suggestion ${i+1}</div><div style="font-size:12px;color:${muted}">Recommended action</div></div><span style="color:${accent};font-size:14px">→</span></div>`).join('')}
      </div>`;

    case 'media_player':
      return `<div style="background:#222;border-radius:12px;overflow:hidden;margin-bottom:16px">
        <div style="aspect-ratio:16/9;background:linear-gradient(135deg,#1a1a2e,#333);display:flex;align-items:center;justify-content:center"><div style="width:56px;height:56px;border-radius:50%;background:${accent};display:flex;align-items:center;justify-content:center;font-size:22px;color:#fff;cursor:pointer">▶</div></div>
        <div style="padding:16px"><div style="font-size:15px;font-weight:600;color:#fff;margin-bottom:4px">${a}</div><div style="font-size:13px;color:#aaa">${r}</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:12px"><span style="font-size:11px;color:#aaa">0:00</span><div style="flex:1;height:4px;background:#444;border-radius:2px"><div style="width:35%;height:100%;background:${accent};border-radius:2px"></div></div><span style="font-size:11px;color:#aaa">3:45</span></div></div>
      </div>`;

    case 'access_gate':
      return `<div style="background:linear-gradient(135deg,${accent}15,${accent}05);border:1px solid ${accent}30;border-radius:12px;padding:32px 24px;margin-bottom:16px;text-align:center">
        <div style="font-size:36px;margin-bottom:12px">🔒</div>
        <h3 style="font-size:18px;font-weight:600;margin-bottom:8px">${a}</h3>
        ${r ? `<p style="font-size:14px;color:${muted};margin-bottom:20px">${r}</p>` : ''}
        <button style="background:${accent};color:#fff;border:0;border-radius:8px;padding:12px 32px;font-size:14px;font-weight:600;cursor:pointer">Upgrade</button>
      </div>`;

    case 'category_grid':
    case 'content_grid':
      return `<div style="margin-bottom:16px">
        <h3 style="font-size:16px;font-weight:600;margin-bottom:12px">${a}</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px">${GRADIENT_PALETTE.slice(0, 4).map((g, i) =>
          `<div style="background:${g};border-radius:10px;aspect-ratio:4/3;display:flex;align-items:flex-end;padding:12px;cursor:pointer"><span style="font-size:13px;font-weight:600;color:#fff">Item ${i+1}</span></div>`
        ).join('')}</div>
      </div>`;

    case 'list':
      return `<div style="background:#fff;border:1px solid ${bdr};border-radius:12px;padding:24px;margin-bottom:16px">
        <h3 style="font-size:16px;font-weight:600;margin-bottom:12px">${a}</h3>
        ${[1,2,3,4].map(i => `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;${i < 4 ? 'border-bottom:1px solid ' + bdr : ''}"><div style="width:36px;height:36px;border-radius:6px;background:${bg2};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:${accent}">${i}</div><div style="flex:1"><div style="font-size:14px;font-weight:500">Item ${i}</div><div style="font-size:12px;color:${muted}">${r ? r.slice(0, 40) : 'Details'}</div></div><span style="color:${muted}">›</span></div>`).join('')}
      </div>`;

    case 'validation_results':
      return `<div style="background:#fff;border:1px solid ${bdr};border-radius:12px;padding:24px;margin-bottom:16px">
        <h3 style="font-size:16px;font-weight:600;margin-bottom:12px">${a}</h3>
        ${[['Check 1', true], ['Check 2', true], ['Check 3', false]].map(([label, ok]) => `<div style="display:flex;align-items:center;gap:10px;padding:8px 0"><span style="color:${ok ? '#10B981' : '#EF4444'};font-size:16px">${ok ? '✓' : '✗'}</span><span style="font-size:14px;color:${ok ? '#222' : '#EF4444'}">${label}</span></div>`).join('')}
      </div>`;

    case 'preview':
      return `<div style="background:#fff;border:1px solid ${bdr};border-radius:12px;padding:24px;margin-bottom:16px">
        <h3 style="font-size:16px;font-weight:600;margin-bottom:12px">${a}</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px"><div style="background:${bg2};border-radius:8px;padding:20px;text-align:center"><div style="font-size:13px;color:${muted};margin-bottom:8px">Before</div><div style="height:80px;background:#ddd;border-radius:6px"></div></div><div style="background:${bg2};border-radius:8px;padding:20px;text-align:center"><div style="font-size:13px;color:${muted};margin-bottom:8px">After</div><div style="height:80px;background:${accent}20;border:2px solid ${accent};border-radius:6px"></div></div></div>
        ${r ? `<p style="font-size:13px;color:${muted};margin-top:12px">${r}</p>` : ''}
      </div>`;

    default:
      return `<div style="background:#fff;border:1px solid ${bdr};border-radius:12px;padding:20px;margin-bottom:16px;display:flex;align-items:flex-start;gap:16px">
        <div style="width:44px;height:44px;border-radius:10px;background:${accent}12;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:${accent};flex-shrink:0">${si + 1}</div>
        <div><h3 style="font-size:15px;font-weight:600;margin-bottom:4px">${a}</h3>${r ? `<p style="font-size:13px;color:${muted};line-height:1.5">${r}</p>` : ''}${actor ? `<span style="display:inline-block;margin-top:8px;font-size:11px;background:${bg2};padding:3px 8px;border-radius:4px;color:${muted}">${esc(actor)}</span>` : ''}</div>
      </div>`;
  }
}

// =====================================================
// MARKETPLACE PROTOTYPE (Airbnb, Uber, Shopify)
// Top search + filters + photo card grids + ratings
// Flow screens only — no wizard
// =====================================================
function marketplacePrototype(ctx: CpmContext, flowScreens: any[], flowsJson: string, desc: string): string {
  const nameAndDesc = `${ctx.appName} ${desc}`;
  const accent = /airbnb/i.test(nameAndDesc) ? '#FF5A5F' : /uber|lyft/i.test(nameAndDesc) ? '#000' : /shopify/i.test(nameAndDesc) ? '#5C6AC4' : '#FF5A5F';
  const brandName = ctx.appName.replace(/\bPrd\b/gi, '').replace(/\s+/g, ' ').trim();
  const label = brandName.length > 30 ? brandName.slice(0, 30) : brandName;
  const t: ThemeColors = { accent, bg: '#fff', surface: '#fff', text: '#222', muted: '#717171', border: '#EBEBEB', success: '#10B981', warning: 'rgba(245,158,11,.3)' };

  const navTabs = flowScreens.length > 0 ? flowScreens.map((s: any, i: number) => `<a class="tn${i===0?' on':''}" onclick="go(${i})" data-i="${i}">${esc(s.name.slice(0,20))}</a>`).join('') : '<a class="tn on" data-i="0">No flows</a>';

  const flowScreensHtml = flowScreens.length > 0 ? flowScreens.map((s: any, idx: number) => {
    const steps: any[] = s.steps ?? [];
    const allText = steps.map((st: any) => `${st?.action ?? ''} ${st?.result ?? ''}`).join(' ');
    const jobDesc = s.job?.description ?? '';
    const stepsHtml = steps.map((st: any, si: number) => {
      const action = st?.action ?? '';
      const result = st?.result ?? '';
      const componentType = inferFlowAwareComponentType(s.name ?? '', jobDesc, action, result, si, steps.length, allText);
      return renderStepComponent(componentType, action, result, st?.actor_id ?? '', si, accent);
    }).join('');
    return `<div class="scr" id="s${idx}" style="display:${idx===0?'block':'none'}">
      <h2>${esc(s.name)}</h2>
      ${s.job ? `<p class="sdesc">${esc(toUserFacingCopy(jobDesc, 80))}</p>` : ''}
      ${stepsHtml}
    </div>`;
  }).join('') : `<div class="scr" id="s0" style="display:block"><p style="color:var(--text2);padding:40px;text-align:center">No user flows extracted.</p></div>`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(ctx.appName)}</title>${DESIGN_SYSTEM_FONTS}
<style>${DESIGN_SYSTEM_CSS}
*{margin:0;padding:0;box-sizing:border-box}body{font-family:var(--font);background:var(--surface);color:var(--text);font-size:14px;line-height:var(--body-leading)}
.topbar{position:sticky;top:0;z-index:10;background:var(--surface);border-bottom:1px solid var(--border);padding:12px 24px;display:flex;align-items:center;justify-content:space-between;box-shadow:var(--shadow-sm)}
.topbar h1{font-size:20px;font-weight:700;color:${accent};letter-spacing:var(--heading-tight)}.topbar-r{display:flex;gap:12px;font-size:14px;color:var(--text)}
.search-hero{background:var(--surface);border-bottom:1px solid var(--border);padding:16px 24px;display:flex;align-items:center;gap:12px}
.search-box{flex:1;max-width:500px;display:flex;align-items:center;gap:8px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-full);padding:12px 20px;font-size:14px;color:var(--text2);transition:var(--transition)}
.search-box:focus-within{border-color:var(--border-focus);box-shadow:0 0 0 3px var(--blue-glow)}
.search-box span{font-size:16px}
.subnav{background:var(--surface);border-bottom:1px solid var(--border);display:flex;gap:0;padding:0 24px;overflow-x:auto}
.tn{padding:12px 16px;font-size:13px;font-weight:500;color:var(--text2);cursor:pointer;text-decoration:none;border-bottom:2px solid transparent;white-space:nowrap;transition:var(--transition)}.tn:hover{color:var(--text)}.tn.on{color:${accent};border-bottom-color:${accent};font-weight:600}
.main{max-width:1200px;margin:0 auto;padding:24px}
h2{font-size:22px;font-weight:600;margin-bottom:4px;letter-spacing:var(--heading-tight)}.sdesc{color:var(--text2);margin-bottom:16px}
.mgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:20px}
.mcard{border-radius:var(--radius);overflow:hidden;cursor:pointer;transition:var(--transition);box-shadow:var(--shadow-sm)}.mcard:hover{transform:translateY(-4px);box-shadow:var(--shadow-lg)}
.mcard-img{aspect-ratio:4/3;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;color:${accent};border-radius:var(--radius)}
.mcard-info{padding:12px 0}
.mcard-title{font-size:15px;font-weight:500;color:var(--text);margin-bottom:2px}
.mcard-sub{font-size:13px;color:var(--text2);margin-bottom:2px}
.mcard-meta{font-size:13px;color:var(--text)}
.scr{display:none}.wz-wrap{max-width:720px;margin:0 auto}${wizardScreenStyles(t)}
</style></head><body>
<div class="topbar"><h1>${label}</h1><div class="topbar-r">Become a Host 🌐 ☰</div></div>
<div class="search-hero"><div class="search-box"><span>🔍</span> Where · When · Who</div></div>
<div class="subnav">${navTabs}</div>
<div class="main">${flowScreensHtml}</div>
${FEEDBACK_WIDGET_HTML}
<script>const F=${flowsJson};function go(i){document.querySelectorAll('.scr').forEach(s=>s.style.display='none');document.querySelectorAll('.tn').forEach(n=>n.classList.remove('on'));const s=document.getElementById('s'+i);if(s)s.style.display='block';document.querySelectorAll('[data-i="'+i+'"]').forEach(n=>n.classList.add('on'))}</script>
</body></html>`;
}

// =====================================================
// PRODUCTIVITY/SAAS PROTOTYPE (Slack, Notion, Linear)
// Dark/light sidebar + channels/pages + content area
// Flow screens only — no wizard
// =====================================================
function productivityPrototype(ctx: CpmContext, flowScreens: any[], flowsJson: string, desc: string): string {
  const isSlack = /slack/i.test(desc);
  const isNotion = /notion/i.test(desc);
  const isLinear = /linear/i.test(desc);
  const accent = isSlack ? '#4A154B' : isLinear ? '#5E6AD2' : '#2383E2';
  const label = isSlack ? 'Slack' : isNotion ? 'Notion' : isLinear ? 'Linear' : esc(ctx.appName.slice(0,16));
  const isDk = isLinear;
  const bg = isDk ? '#1a1a2e' : '#fff';
  const sidebar = isSlack ? '#3F0E40' : isDk ? '#111' : '#F7F6F3';
  const text = isDk ? '#e0e0e0' : '#37352F';
  const muted = isDk ? '#888' : '#999';
  const border = isDk ? '#333' : '#E5E5E5';
  const t: ThemeColors = { accent, bg, surface: isDk ? '#1a1a2e' : '#F7F6F3', text, muted, border, success: '#10B981', warning: 'rgba(245,158,11,.3)' };
  const navHtml = flowScreens.length > 0 ? flowScreens.map((s: any, i: number) => `<a class="ni${i===0?' on':''}" onclick="go(${i})" data-i="${i}"><span class="ni-h">#</span> ${esc(s.name.slice(0,18))}</a>`).join('') : '<a class="ni on" data-i="0"><span class="ni-h">#</span> No flows</a>';

  const flowScreensHtml = flowScreens.length > 0 ? flowScreens.map((s: any, idx: number) => {
    const steps: any[] = s.steps ?? [];
    const allText = steps.map((st: any) => `${st?.action ?? ''} ${st?.result ?? ''}`).join(' ');
    const jobDesc = s.job?.description ?? '';
    const stepsUi = steps.map((st: any, si: number) => {
      const componentType = inferFlowAwareComponentType(s.name ?? '', jobDesc, st?.action ?? '', st?.result ?? '', si, steps.length, allText);
      return renderStepComponent(componentType, st?.action ?? '', st?.result ?? '', st?.actor_id ?? '', si, accent);
    }).join('');
    return `<div class="scr" id="s${idx}" style="display:${idx===0?'flex':'none'}">
      <div class="content">
        <div class="content-hdr"><h2>${isSlack ? '# ' : ''}${esc(s.name)}</h2>${s.job ? `<p>${esc(toUserFacingCopy(jobDesc, 80))}</p>` : ''}</div>
        ${stepsUi}
      </div>
    </div>`;
  }).join('') : `<div class="scr" id="s0" style="display:flex"><div class="content"><p style="color:${muted};padding:40px;text-align:center">No user flows extracted.</p></div></div>`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(ctx.appName)}</title><style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;background:${bg};color:${text};display:flex;height:100vh;overflow:hidden;font-size:14px}
.sb{width:220px;min-width:220px;background:${sidebar};display:flex;flex-direction:column;${isSlack?'color:rgba(255,255,255,.7);':''}overflow-y:auto}
.sb-h{padding:14px 16px;border-bottom:1px solid ${isSlack?'rgba(255,255,255,.1)':border}}.sb-h h2{font-size:16px;font-weight:700;color:${isSlack?'#fff':text}}.sb-h p{font-size:11px;color:${isSlack?'rgba(255,255,255,.5)':muted};margin-top:2px}
.sb-lbl{font-size:11px;font-weight:600;color:${isSlack?'rgba(255,255,255,.4)':muted};padding:12px 16px 4px;text-transform:uppercase;letter-spacing:.5px}
.ni{display:flex;align-items:center;gap:6px;padding:4px 16px;cursor:pointer;color:${isSlack?'rgba(255,255,255,.7)':muted};font-size:14px;text-decoration:none;border-radius:0}.ni:hover{background:${isSlack?'rgba(255,255,255,.1)':isDk?'#222':'#EFEFEF'};color:${isSlack?'#fff':text}}.ni.on{background:${isSlack?'#1164A3':isDk?accent+'33':'#E8E8E8'};color:${isSlack?'#fff':text};font-weight:600}
.ni-h{font-size:16px;opacity:.6}
.mn{flex:1;overflow:hidden;display:flex;flex-direction:column}
.scr{display:none;flex-direction:column;height:100%}
.content{flex:1;overflow-y:auto;padding:20px 32px}
.content-hdr{margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid ${border}}.content-hdr h2{font-size:24px;font-weight:700;color:${text}}.content-hdr p{font-size:14px;color:${muted};margin-top:4px}
.items{display:flex;flex-direction:column;gap:2px}
.item{display:flex;align-items:center;gap:12px;padding:8px 12px;border-radius:6px;cursor:pointer;border:1px solid transparent;transition:all .1s}.item:hover{background:${isDk?'#1a1a2e':'#F7F6F3'};border-color:${border}}
.item-check{font-size:16px;flex-shrink:0}
.item-body{flex:1}.item-t{font-size:14px;color:${text}}.item-m{font-size:12px;color:${muted};margin-top:1px}
.item-tag{flex-shrink:0}
.tag-done{background:#E6F4EA;color:#1B7340;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600}
.tag-prog{background:#E3F2FD;color:#1565C0;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600}
.tag-todo{background:#F3F3F3;color:#888;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600}
.wz-wrap{padding:0 32px;max-width:720px}${wizardScreenStyles(t)}
</style></head><body>
<div class="sb"><div class="sb-h"><h2>${label}</h2><p>${isSlack?'Workspace':'Product'}</p></div><div class="sb-lbl">${isSlack?'Channels':'Pages'}</div>${navHtml}</div>
<div class="mn">${flowScreensHtml}</div>
${FEEDBACK_WIDGET_HTML}
<script>const F=${flowsJson};function go(i){document.querySelectorAll('.scr').forEach(s=>s.style.display='none');document.querySelectorAll('.ni').forEach(n=>n.classList.remove('on'));const s=document.getElementById('s'+i);if(s)s.style.display='flex';document.querySelectorAll('[data-i="'+i+'"]').forEach(n=>n.classList.add('on'))}</script>
</body></html>`;
}
