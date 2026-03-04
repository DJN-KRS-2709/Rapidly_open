import { NextResponse } from 'next/server';
import { readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { generatePrototypeHtml } from '@/lib/prototypeHtml';
import { generatePrototypeMockData } from '@/lib/prototypeEnrichment';
import {
  inferStepComponentType,
  extractEntitiesFromCorpus,
  stepToFigmaDescription,
  toUserFacingCopy,
} from '@/lib/prototypeInference';
import { detectTheme, type UiTheme } from '@/lib/themeDetection';

const RUNS_DIR = path.join(process.cwd(), 'runs');

// Type for structural features derived from CPM
interface StructuralFeatures {
  appType: 'wizard' | 'dashboard' | 'crud' | 'viewer' | 'tool';
  hasWizard: boolean;
  hasForm: boolean;
  hasList: boolean;
  hasFileUpload: boolean;
  hasReview: boolean;
  hasGeneration: boolean;
  hasApproval: boolean;
  hasSearch: boolean;
  hasMusic: boolean;
  hasLibrary: boolean;
  isFinanceApp: boolean;
  hasAppStyleSteps: boolean; // Consumer/app-style flows (search + browse/discover patterns)
  isStrategyDoc: boolean; // Product brief, strategy, vision documents (often consumer apps)
  hasWorkflow: boolean;
  hasMetrics: boolean;
  primaryEntities: string[];
  primaryActions: string[];
  externalSystems: string[];
  theme: UiTheme;
  contentType: string; // e.g., "tracks", "documents", "items"
}

// Type for UI pattern detection
type UiPattern = 'file_picker' | 'text_input' | 'textarea' | 'dropdown' | 'button' | 'display_card' | 'list_view' | 'table' | 'dialog' | 'status_chip' | 'generic';

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

// Helper to extract app name from document
function extractAppName(cpm: any): string {
  const documentName = cpm?.meta?.source?.document_name?.replace('.txt', '').replace('.md', '') ?? 'App';
  const name = cpm?.meta?.name ?? documentName;
  return name
    .replace(/^Product Brief[:\s]*/i, '')
    .replace(/^PRD[:\s]*/i, '')
    .replace(/^\[RESTRICTED\]\s*/i, '')
    .split(/[-_]/)
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .slice(0, 40);
}

// Infer UI pattern from a flow step action
function inferUiPatternFromStep(action: string): UiPattern {
  const lower = action.toLowerCase();
  if (/upload|select.*file|import|drag.*drop|file.*picker/i.test(lower)) return 'file_picker';
  if (/enter.*text|input.*text|type.*in|edit.*text/i.test(lower)) return 'text_input';
  if (/text\s*area|long.*text|description|statement/i.test(lower)) return 'textarea';
  if (/select.*from|choose|dropdown|pick.*option|radio|checkbox/i.test(lower)) return 'dropdown';
  if (/click.*button|submit|generate|confirm|approve|continue|save/i.test(lower)) return 'button';
  if (/review|display|show|view.*card|appear/i.test(lower)) return 'display_card';
  if (/list|table|grid|cards/i.test(lower)) return 'list_view';
  if (/dialog|modal|popup|opens/i.test(lower)) return 'dialog';
  if (/status|chip|badge|indicator/i.test(lower)) return 'status_chip';
  return 'generic';
}

// Extract entities and actions from CPM content
function extractEntitiesFromCpm(cpm: any): { entities: string[]; actions: string[] } {
  const jobs = cpm?.jobs ?? [];
  const flows = cpm?.flows ?? [];
  
  const entitySet = new Set<string>();
  const actionSet = new Set<string>();
  
  // Common entity patterns to extract
  const entityPatterns = [
    /(?:the\s+)?(\w+)\s+(?:document|file|record|item|card|list|section|field|button|dialog)/gi,
    /(?:upload|review|edit|generate|approve|select|create|delete)\s+(?:the\s+)?(\w+)/gi,
    /(\w+)\s+(?:is|are|was|were)\s+(?:uploaded|reviewed|edited|generated|approved|selected|created|deleted)/gi,
  ];
  
  // Extract from job descriptions
  for (const job of jobs) {
    const desc = job?.description ?? '';
    const jobId = job?.job_id ?? '';
    
    // Extract entity from job ID (e.g., "upload_prd" -> "PRD")
    const idParts = jobId.split('_').filter((p: string) => p.length > 2);
    idParts.forEach((p: string) => {
      if (!/^(job|the|and|for|with)$/i.test(p)) {
        entitySet.add(p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());
      }
    });
    
    // Extract action from job description
    const actionMatch = desc.match(/^(?:As\s+a\s+\w+,\s+)?I\s+(?:need\s+to|want\s+to|can)?\s*(\w+)/i);
    if (actionMatch) {
      actionSet.add(actionMatch[1].charAt(0).toUpperCase() + actionMatch[1].slice(1).toLowerCase());
    }
  }
  
  // Extract from flow names and steps
  for (const flow of flows) {
    const flowName = flow?.name ?? '';
    
    // Extract action from flow name (e.g., "Upload PRD" -> action: "Upload", entity: "PRD")
    const flowParts = flowName.split(/\s+/);
    if (flowParts.length >= 1) {
      actionSet.add(flowParts[0]);
    }
    if (flowParts.length >= 2) {
      entitySet.add(flowParts.slice(1).join(' '));
    }
    
    // Extract from steps
    for (const step of (flow?.steps ?? [])) {
      const action = step?.action ?? '';
      const result = step?.result ?? '';
      
      // Look for entity patterns
      for (const pattern of entityPatterns) {
        let match;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(action + ' ' + result)) !== null) {
          const entity = match[1];
          if (entity && entity.length > 2 && !/^(the|and|for|with|user|system)$/i.test(entity)) {
            entitySet.add(entity.charAt(0).toUpperCase() + entity.slice(1).toLowerCase());
          }
        }
      }
    }
  }
  
  // Filter and clean
  const entities = [...entitySet].filter(e => e.length > 2).slice(0, 10);
  const actions = [...actionSet].filter(a => a.length > 2).slice(0, 10);
  
  return { entities, actions };
}


// Detect content type from PRD
function detectContentType(allText: string): string {
  const lower = allText.toLowerCase();
  
  if (/track|song|music/i.test(lower)) return 'tracks';
  if (/playlist/i.test(lower)) return 'playlists';
  if (/album/i.test(lower)) return 'albums';
  if (/video/i.test(lower)) return 'videos';
  if (/document|prd|file/i.test(lower)) return 'documents';
  if (/post|article/i.test(lower)) return 'posts';
  if (/product/i.test(lower)) return 'products';
  return 'items';
}

// Detect structural features from CPM
function detectStructuralFeatures(cpm: any): StructuralFeatures {
  const jobs = cpm?.jobs ?? [];
  const flows = cpm?.flows ?? [];
  
  // Collect all text for analysis
  const allText = [
    cpm?.intent?.problem?.statement ?? '',
    cpm?.intent?.goal?.primary_outcome ?? '',
    ...jobs.map((j: any) => `${j.description ?? ''} ${j.success_outcome ?? ''}`),
    ...flows.map((f: any) => `${f.name ?? ''} ${f.steps?.map((s: any) => s.action).join(' ') ?? ''}`),
  ].join(' ');
  
  const lower = allText.toLowerCase();
  
  // Detect structural patterns
  const hasWizard = flows.length > 2 && /step|wizard|flow|continue|next|previous/i.test(lower);
  const hasForm = /enter|input|edit|update|field|form|textarea/i.test(lower);
  const hasList = /list|table|grid|cards|items|view.*all/i.test(lower);
  const hasFileUpload = /upload|import|file|document|drag.*drop/i.test(lower);
  const hasReview = /review|validate|check|verify|approve/i.test(lower);
  const hasGeneration = /generate|create|produce|output|export/i.test(lower);
  const hasApproval = /approve|confirm|align|sign.*off|mark.*as/i.test(lower);
  const hasSearch = /search|find|query|retriev|lookup/i.test(lower);
  // Music detection - be specific to avoid false positives from "track" (as in "track progress")
  const hasMusic = /(track|playlist|album|artist|song)\s*(list|play|stream|download|shuffle)/i.test(lower) ||
    /music|audio|streaming|podcast/i.test(lower);
  const hasLibrary = /\blibrary\b.*\b(music|song|playlist|track|album|saved)/i.test(lower) || /your\s*library/i.test(lower);
  
  // Detect enterprise/finance app patterns - require STRONG signals
  // Single mentions of "revenue" or "invoice" aren't enough - the app needs to BE about finance
  // Look for finance-SPECIFIC terms that indicate core functionality, not just mentions
  const coreFinanceTerms = (lower.match(/\b(reconcil|settlement|cash\s*application|month[\s-]*end\s*close|mec\b|otc\b|order[\s-]*to[\s-]*cash|ledger|accounts?\s*receivable|accounts?\s*payable|ar\s*aging|ap\s*aging|journal\s*entry|financial\s*close|netsuite|erp\s*system)\b/gi) || []).length;
  const financeContextTerms = (lower.match(/\b(revenue\s*recognition|billing\s*cycle|invoice\s*processing|payment\s*matching|variance\s*analysis|fiscal\s*period|budget\s*tracking)\b/gi) || []).length;
  // Only mark as finance app if there are multiple strong finance indicators
  // OR if core finance terms appear in problem/outcome (the app's main purpose)
  const problemOutcome = `${cpm?.intent?.problem?.statement ?? ''} ${cpm?.intent?.goal?.primary_outcome ?? ''}`.toLowerCase();
  const hasFinanceInCore = /reconcil|settlement|cash\s*application|month[\s-]*end|mec\b|mac\b|otc\b|ledger|accounts?\s*(receivable|payable)|financial\s*close/i.test(problemOutcome);
  const isFinanceApp = (coreFinanceTerms >= 2) || (coreFinanceTerms >= 1 && financeContextTerms >= 1) || hasFinanceInCore;
  
  const hasWorkflow = /workflow|process|step|checklist|task|handoff|handover|stage|phase|milestone|status|progress|pipeline|queue/i.test(lower);
  const hasMetrics = /metric|kpi|revenue|amount|total|target|goal|percentage|rate|ratio|count|volume|trend|analytics|dashboard|report/i.test(lower);

  // Consumer/app-style: search + (library|music) or viewer app type
  const hasAppStyleSteps = (hasSearch && (hasLibrary || hasMusic)) || (hasSearch && flows.length >= 2);
  const isStrategyDoc = /strategy|product\s*brief|vision\s*doc|go.to.market|gtm\b/i.test(lower);

  // Determine app type based on features
  let appType: StructuralFeatures['appType'] = 'tool';
  if (hasSearch && hasMusic) appType = 'viewer'; // Music search/browse app
  else if (hasWizard && flows.length >= 3) appType = 'wizard';
  else if (hasList && hasForm) appType = 'crud';
  else if (/dashboard|overview|metrics|stats/i.test(lower)) appType = 'dashboard';
  else if (/view|read|browse|explore/i.test(lower) && !hasForm) appType = 'viewer';
  
  // Extract entities and actions
  const { entities, actions } = extractEntitiesFromCpm(cpm);
  
  // Extract external systems mentioned
  const externalSystems: string[] = [];
  if (/api|service|backend/i.test(lower)) externalSystems.push('Backend API');
  if (/database|storage|store/i.test(lower)) externalSystems.push('Data Store');
  if (/figma/i.test(lower)) externalSystems.push('Figma');
  if (/slack|notification/i.test(lower)) externalSystems.push('Notifications');
  if (externalSystems.length === 0) externalSystems.push('Backend API');
  
  // Detect theme and content type
  const theme = detectTheme(allText);
  const contentType = detectContentType(allText);
  
  return {
    appType,
    hasWizard,
    hasForm,
    hasList,
    hasFileUpload,
    hasReview,
    hasGeneration,
    hasApproval,
    hasSearch,
    hasMusic,
    hasLibrary,
    isFinanceApp,
    hasAppStyleSteps,
    isStrategyDoc,
    hasWorkflow,
    hasMetrics,
    primaryEntities: entities,
    primaryActions: actions,
    externalSystems,
    theme,
    contentType,
  };
}

// Generate UI component description from pattern and context
function generateUiComponent(pattern: UiPattern, context: { label: string; placeholder?: string; options?: string[] }): string {
  switch (pattern) {
    case 'file_picker':
      return `- **File Upload Zone**: Drag-and-drop area with dashed border
  - Icon: 📄 Upload icon (large, centered)
  - Text: "${context.placeholder || 'Drag and drop your file here'}"
  - Subtext: "or click to browse"
  - [Browse Files] button below
  - Supported formats notice`;
    case 'text_input':
      return `- **${context.label}** (text input)
  - Label: "${context.label}"
  - Placeholder: "${context.placeholder || `Enter ${context.label.toLowerCase()}...`}"
  - Single line input with border`;
    case 'textarea':
      return `- **${context.label}** (textarea, editable)
  - Label: "${context.label}"
  - Multi-line text area (4-6 rows)
  - Placeholder: "${context.placeholder || `Enter ${context.label.toLowerCase()}...`}"
  - Character count in corner`;
    case 'dropdown':
      return `- **${context.label}** (dropdown selector)
  - Label: "${context.label}"
  - Options: ${context.options?.map(o => `[${o}]`).join(', ') || '[Option 1], [Option 2], [Option 3]'}
  - Chevron icon on right`;
    case 'button':
      return `- [${context.label}] button (primary, prominent)`;
    case 'display_card':
      return `- **${context.label} Card**
  - White/light background with subtle border
  - Content displayed in structured format
  - Edit icon in top-right corner`;
    case 'list_view':
      return `- **${context.label} List**
  - Scrollable list of items
  - Each item is an editable card
  - [Add ${context.label.replace(/s$/, '')}] button at bottom`;
    case 'table':
      return `- **${context.label} Table**
  - Column headers with sort indicators
  - Rows with hover state
  - Action buttons in last column`;
    case 'dialog':
      return `- **${context.label} Dialog** (modal overlay)
  - Dark backdrop
  - Centered white card
  - Close button (X) in top-right
  - Action buttons at bottom`;
    case 'status_chip':
      return `- Status: **${context.label}** chip (colored badge)`;
    default:
      return `- ${context.label}`;
  }
}

// @ts-ignore - Preserved for potential future use
function generateScreenFromFlow(flow: any, screenNum: number, _appName: string): string {
  const flowName = flow?.name ?? `Flow ${screenNum}`;
  const steps = flow?.steps ?? [];
  
  // Group steps by UI pattern
  const uiElements: string[] = [];
  const actionButtons: string[] = [];
  
  for (const step of steps) {
    const action = step?.action ?? '';
    const result = step?.result ?? '';
    const pattern = inferUiPatternFromStep(action);
    
    // Extract label from action
    const labelMatch = action.match(/(?:clicks?|enters?|selects?|reviews?|uploads?)\s+(.+?)(?:\s+button|\s+from|\s+in|\s+to|$)/i);
    const label = labelMatch?.[1]?.replace(/^the\s+/i, '') || action.slice(0, 30);
    
    if (pattern === 'button' && /continue|submit|next|confirm|generate|approve/i.test(action)) {
      actionButtons.push(label.charAt(0).toUpperCase() + label.slice(1));
    } else {
      const component = generateUiComponent(pattern, {
        label: label.charAt(0).toUpperCase() + label.slice(1),
        placeholder: result.slice(0, 50),
      });
      if (!uiElements.includes(component)) {
        uiElements.push(component);
      }
    }
  }
  
  // Build screen content
  let screenContent = `## SCREEN ${screenNum}: ${flowName.toUpperCase()}
Frame: \`${flowName.replace(/\s+/g, '')}\`

### Header
- Back navigation: [← Back]
- Title: "**${flowName}**"
- Progress indicator (if wizard): Step ${screenNum} of N

### Main Content Area

`;

  // Add UI elements
  if (uiElements.length > 0) {
    screenContent += uiElements.join('\n\n');
  } else {
    // Fallback: generate from steps directly
    screenContent += `### Flow Steps
${steps.slice(0, 6).map((step: any, idx: number) => `
**${idx + 1}. ${step?.action?.slice(0, 60) || 'Action'}**
- Result: ${step?.result?.slice(0, 60) || 'Completed'}
`).join('')}`;
  }
  
  // Add action buttons
  if (actionButtons.length > 0) {
    screenContent += `\n\n### Action Bar (bottom)
${actionButtons.map(btn => `- [${btn}] button`).join('\n')}`;
  } else {
    screenContent += `\n\n### Action Bar (bottom)
- [Continue] button (primary)
- [Save Draft] button (secondary)`;
  }
  
  // Add preconditions/constraints if any
  if (flow?.preconditions?.length) {
    screenContent += `\n\n### Notices
${flow.preconditions.slice(0, 3).map((p: string) => `- ⚠️ ${p.slice(0, 60)}`).join('\n')}`;
  }
  
  screenContent += '\n\n---\n';
  
  return screenContent;
}

// ============ HELPER TYPES AND FUNCTIONS ============

// Type for assignee
interface Assignee {
  name: string;
  role: string;
}

// Generate realistic assignee names for finance domain
function generateAssignees(): Assignee[] {
  return [
    { name: 'Sarah Chen', role: 'Finance Lead' },
    { name: 'Mike Johnson', role: 'Operations Manager' },
    { name: 'Lisa Park', role: 'Revenue Analyst' },
    { name: 'Tom Wilson', role: 'Platform Engineer' },
    { name: 'Emily Rodriguez', role: 'Billing Specialist' },
    { name: 'David Kim', role: 'Close Manager' },
    { name: 'Rachel Green', role: 'AR Specialist' },
    { name: 'James Lee', role: 'Integration Lead' },
  ];
}

// ============ END PRD CONTENT EXTRACTION HELPERS ============

// ============ TOOL-SPECIFIC SCREEN TEMPLATES ============

// HighRadius-style cash application workbench
function generateHighRadiusStyleWorkbench(assignees: Array<{ name: string; role: string }>): string {
  return `
### AI-Suggested Matches (HighRadius-style)
The system uses AI to suggest payment-to-invoice matches with confidence scores.

| Confidence | Invoice | Remittance | Amount | Customer | Suggestion | Actions |
|------------|---------|------------|--------|----------|------------|---------|
| **98%** 🟢 | INV-2024-001 | REM-5501 | $45,230.00 | Acme Corp | Auto-match | [Accept] [Review] |
| **87%** 🟡 | INV-2024-002 | REM-5502 | $12,450.00 | TechStart Inc | Partial match | [Accept] [Split] [Review] |
| **62%** 🟠 | INV-2024-003 | REM-5503 | $8,900.00 | GlobalTech | Low confidence | [Review] [Manual Match] |
| **45%** 🔴 | INV-2024-004 | REM-5504 | $3,200.00 | StartupXYZ | Multiple options | [Review] [Reject] |

### Worklist Queue
| Queue | Items | Priority | Assigned To | Action |
|-------|-------|----------|-------------|--------|
| Unmatched Remittances | 12 | 🔴 High | ${assignees[0]?.name ?? 'AR Team'} | [Open Queue] |
| Short Payments | 5 | 🟡 Medium | ${assignees[1]?.name ?? 'AR Team'} | [Open Queue] |
| Overpayments | 3 | 🟡 Medium | ${assignees[2]?.name ?? 'AR Team'} | [Open Queue] |
| Pending Review | 8 | 🟢 Low | ${assignees[0]?.name ?? 'AR Team'} | [Open Queue] |

### Quick Actions
| Button | Keyboard | Description |
|--------|----------|-------------|
| [Accept All High Confidence] | Ctrl+A | Auto-post all matches above 95% |
| [Batch Review] | Ctrl+B | Open batch review panel |
| [Export Exceptions] | Ctrl+E | Export unmatched items to Excel |
`;
}

// FloQast-style month-end close checklist
function generateFloQastStyleChecklist(assignees: Array<{ name: string; role: string }>): string {
  const today = new Date();
  const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  
  const date0 = formatDate(new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000));
  const date1 = formatDate(new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000));
  const date2 = formatDate(today);
  const date3 = formatDate(new Date(today.getTime() + 1 * 24 * 60 * 60 * 1000));
  const date4 = formatDate(new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000));
  
  return `
### Close Checklist (FloQast-style)
Track completion status with built-in sign-off workflow.

| Task | Owner | Due | Status | Preparer | Reviewer | Actions |
|------|-------|-----|--------|----------|----------|---------|
| AR Reconciliation | ${assignees[0]?.name ?? 'Finance'} | ${date0} | ✅ Complete | ✓ Signed | ✓ Approved | [View] |
| AP Reconciliation | ${assignees[1]?.name ?? 'Finance'} | ${date0} | ✅ Complete | ✓ Signed | ✓ Approved | [View] |
| Deferred Revenue Roll | ${assignees[2]?.name ?? 'Finance'} | ${date1} | 🔄 In Progress | ✓ Signed | ⏳ Pending | [Edit] [Submit] |
| Intercompany Eliminations | ${assignees[3]?.name ?? 'Finance'} | ${date2} | ⏳ Not Started | - | - | [Start Task] |
| Revenue Recognition | ${assignees[4]?.name ?? 'Finance'} | ${date3} | ⏳ Not Started | - | - | [Start Task] |
| Final Review | ${assignees[5]?.name ?? 'Finance'} | ${date4} | 🔒 Blocked | - | - | [View Dependencies] |

### Flux Analysis Panel
Compare current period to prior period with variance explanations.

| Account | Prior Period | Current | Variance | % Change | Status | Action |
|---------|-------------|---------|----------|----------|--------|--------|
| 4000 - Revenue | $1,234,567 | $1,456,789 | +$222,222 | +18.0% | ⚠️ Needs Explanation | [Add Note] |
| 1200 - AR | $450,000 | $480,000 | +$30,000 | +6.7% | ✅ Explained | [View] |
| 2100 - AP | $320,000 | $298,000 | -$22,000 | -6.9% | ✅ Explained | [View] |
| 1300 - Prepaid | $89,450 | $112,300 | +$22,850 | +25.5% | ⚠️ Needs Explanation | [Add Note] |

### Progress Timeline
\`\`\`
Day 1 ────●──── Day 3 ────●──── Day 5 ────○──── Day 7 ────○──── Day 10
          ✓ Data         ✓ Recs          Journals       Review       Close
          Freeze         Complete        Due            Period       Complete
\`\`\`
`;
}

// BlackLine-style reconciliation grid
function generateBlackLineStyleReconciliation(assignees: Array<{ name: string; role: string }>): string {
  return `
### Account Certifications (BlackLine-style)
Reconcile and certify account balances with multi-level approval.

| Account | Account Name | GL Balance | Sub-ledger | Variance | Preparer | Reviewer | Status | Actions |
|---------|--------------|------------|------------|----------|----------|----------|--------|---------|
| 1200 | Accounts Receivable | $1,234,567 | $1,234,567 | $0 | ${assignees[0]?.name ?? 'Preparer'} | ${assignees[1]?.name ?? 'Reviewer'} | ✅ Certified | [View] |
| 1300 | Prepaid Expenses | $89,450 | $89,200 | $250 | ${assignees[2]?.name ?? 'Preparer'} | ${assignees[3]?.name ?? 'Reviewer'} | ⚠️ Variance | [Investigate] |
| 2100 | Accounts Payable | $567,890 | $567,890 | $0 | ${assignees[4]?.name ?? 'Preparer'} | - | 🔄 In Review | [Certify] |
| 2200 | Accrued Expenses | $234,567 | $234,567 | $0 | - | - | ⏳ Not Started | [Start] |
| 3100 | Deferred Revenue | $1,890,000 | $1,885,000 | $5,000 | ${assignees[5]?.name ?? 'Preparer'} | - | ⚠️ Variance | [Investigate] |

### Variance Thresholds
- **Auto-certify**: Variance < $1,000 or < 1%
- **Requires Explanation**: Variance $1,000 - $10,000 or 1-5%
- **Requires Approval**: Variance > $10,000 or > 5%

### Reconciliation Summary
| Status | Count | Amount |
|--------|-------|--------|
| ✅ Certified | 45 | $12.4M |
| 🔄 In Review | 12 | $3.2M |
| ⚠️ Has Variance | 5 | $890K |
| ⏳ Not Started | 8 | $2.1M |

### Quick Actions
| Button | Description |
|--------|-------------|
| [Auto-Certify All] | Certify accounts within threshold |
| [View Variances] | Show only accounts with variances |
| [Export Report] | Download reconciliation report |
`;
}

// Zuora-style subscription billing interface
function generateZuoraStyleBilling(): string {
  return `
### Subscription Management (Zuora-style)
Manage subscriptions, amendments, and billing runs.

| Subscription | Customer | Product | MRR | Status | Term End | Actions |
|--------------|----------|---------|-----|--------|----------|---------|
| SUB-001234 | Acme Corp | Enterprise | $4,500/mo | Active | Dec 2025 | [Amend] [Cancel] |
| SUB-001235 | TechStart | Pro | $1,200/mo | Active | Mar 2025 | [Amend] [Renew] |
| SUB-001236 | GlobalCo | Basic | $500/mo | Pending Cancel | Jan 2025 | [Retain] [Process] |
| SUB-001237 | StartupXYZ | Trial | $0/mo | Trial | Feb 2025 | [Convert] [Extend] |

### Bill Run Queue
| Run ID | Period | Accounts | Amount | Status | Actions |
|--------|--------|----------|--------|--------|---------|
| BR-2024-01 | Jan 2024 | 1,234 | $2.4M | ✅ Complete | [View Invoices] |
| BR-2024-02 | Feb 2024 | 1,256 | $2.5M | 🔄 Processing | [Monitor] |
| BR-2024-03 | Mar 2024 | - | - | ⏳ Scheduled | [Configure] [Run Now] |

### Usage Metering
| Meter | Current Usage | Included | Overage | Rate | Actions |
|-------|---------------|----------|---------|------|---------|
| API Calls | 45,230 | 50,000 | 0 | $0.01/call | [View Details] |
| Storage (GB) | 128 | 100 | 28 | $0.10/GB | [View Details] |
| Users | 52 | 50 | 2 | $25/user | [View Details] |
`;
}

// Coupa-style approval workflow
function generateCoupaStyleApprovals(assignees: Array<{ name: string; role: string }>): string {
  return `
### Approval Queue (Coupa-style)
Review and approve pending requests with budget validation.

| Request | Type | Requestor | Amount | Budget Status | Approval Chain | Actions |
|---------|------|-----------|--------|---------------|----------------|---------|
| REQ-2024-001 | Purchase | ${assignees[0]?.name ?? 'Requestor'} | $12,500 | ✅ Within Budget | ⬤ ○ ○ | [Approve] [Reject] [Comment] |
| REQ-2024-002 | Travel | ${assignees[1]?.name ?? 'Requestor'} | $3,200 | ✅ Within Budget | ⬤ ⬤ ○ | [Approve] [Reject] [Comment] |
| REQ-2024-003 | Software | ${assignees[2]?.name ?? 'Requestor'} | $45,000 | ⚠️ Over Budget | ⬤ ○ ○ | [Approve w/ Exception] [Reject] |
| REQ-2024-004 | Services | ${assignees[3]?.name ?? 'Requestor'} | $8,900 | ✅ Within Budget | ⬤ ⬤ ⬤ | [Final Approve] |

### Budget Summary
| Department | Allocated | Spent | Committed | Available |
|------------|-----------|-------|-----------|-----------|
| Engineering | $500,000 | $320,000 | $45,000 | $135,000 |
| Marketing | $250,000 | $180,000 | $12,500 | $57,500 |
| Operations | $150,000 | $98,000 | $8,900 | $43,100 |

### Approval Actions
| Button | Keyboard | Description |
|--------|----------|-------------|
| [Approve All] | Ctrl+Shift+A | Approve all within-budget requests |
| [Bulk Reject] | Ctrl+Shift+R | Reject selected with reason |
| [Delegate] | Ctrl+D | Delegate approval to another |
`;
}

// Signifyd-style anomaly detection
function generateSignifydStyleAnomalyDetection(): string {
  return `
### Alert Queue (Signifyd-style)
AI-flagged anomalies requiring investigation.

| Alert ID | Type | Entity | Risk Score | Reason | Time | Status | Actions |
|----------|------|--------|------------|--------|------|--------|---------|
| ALT-5501 | High Value | TXN-89012 | 🔴 92 | Amount 3x avg | 2 min ago | 🔍 Open | [Investigate] [Clear] [Block] |
| ALT-5502 | Pattern | CUST-1234 | 🟠 78 | Unusual timing | 15 min ago | 🔍 Open | [Investigate] [Clear] |
| ALT-5503 | Velocity | ACCT-5678 | 🟡 65 | 5 txn in 1 hr | 1 hr ago | 🔄 In Review | [Escalate] [Clear] |
| ALT-5504 | New Entity | VEND-9999 | 🟡 58 | First transaction | 2 hr ago | ✅ Cleared | [View Details] |

### Risk Score Breakdown
\`\`\`
High Risk (80-100):  ████████░░  12 alerts - Immediate action required
Medium Risk (50-79): ██████████  45 alerts - Review within 24 hours  
Low Risk (0-49):     ████░░░░░░   8 alerts - Monitor only
\`\`\`

### Investigation Panel
When clicking [Investigate], shows:
- Transaction timeline
- Entity history  
- Similar patterns
- Recommended action
- One-click resolution buttons

### Quick Filters
| Filter | Count | Action |
|--------|-------|--------|
| All Open | 57 | [View] |
| High Risk Only | 12 | [View] |
| My Assignments | 8 | [View] |
| Escalated | 3 | [View] |
`;
}

// ============ END TOOL-SPECIFIC SCREEN TEMPLATES ============

// ============ GENERIC DYNAMIC SCREEN GENERATION ============

// Generate screens dynamically from actual PRD flows and jobs
function generateDynamicFlowScreens(
  flows: any[],
  jobs: any[],
  assignees: Array<{ name: string; role: string }>,
  terminology: any
): string {
  if (!flows || flows.length === 0) {
    // No flows, generate a generic workspace from jobs
    if (!jobs || jobs.length === 0) {
      return '';
    }
    // Generate screens from jobs instead
    return jobs.slice(0, 4).map((job: any, idx: number) => {
      const jobName = job?.description?.slice(0, 40) || `Task ${idx + 1}`;
      const jobId = job?.job_id || `JOB-${idx + 1}`;
      const trigger = job?.trigger || 'User initiates action';
      const successOutcome = job?.success_outcome || 'Task completed successfully';
      
      return `
## SCREEN ${idx + 2}: ${jobName.toUpperCase()}
Frame: \`${jobId.replace(/[^a-zA-Z0-9]/g, '')}\`
**Entry Point**: Dashboard → ${jobName}

### Header
- Breadcrumb: Dashboard > ${jobName}
- Title: "**${jobName}**"
- [← Back to Dashboard]

### Context
- **Trigger**: ${trigger}
- **Goal**: ${successOutcome}

### Main Content
| Field | Value | Action |
|-------|-------|--------|
| Status | 🔄 In Progress | [Update Status ▼] |
| Assigned | ${assignees[idx % assignees.length]?.name || 'User'} | [Reassign →] |
| Created | Today | |

### Actions
\`\`\`
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  [${terminology.submit || 'Submit'}]   [${terminology.review || 'Review'}]   [Save Draft]   [Cancel]  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
\`\`\`

---
`;
    }).join('\n');
  }

  // Generate screens from actual flows
  return flows.slice(0, 6).map((flow: any, idx: number) => {
    const flowName = flow?.name || `Flow ${idx + 1}`;
    const flowId = flowName.replace(/[^a-zA-Z0-9]/g, '');
    const steps = flow?.steps || [];
    const description = flow?.description || '';
    
    // Determine screen type based on flow name/content
    const isListView = /list|queue|view|search|browse/i.test(flowName);
    const isFormView = /create|add|new|edit|configure|setup/i.test(flowName);
    const isWorkflowView = /workflow|process|approve|review/i.test(flowName);

    let screenContent = `
## SCREEN ${idx + 2}: ${flowName.toUpperCase()}
Frame: \`${flowId}\`
**Entry Point**: Dashboard → ${flowName}

### Header
- Breadcrumb: Dashboard > ${flowName}
- Title: "**${flowName}**"
${description ? `- Subtitle: "${description.slice(0, 60)}"` : ''}
- [← Back to Dashboard]
`;

    if (isListView) {
      // Generate list/queue view
      screenContent += `
### Filters
| Filter | Options |
|--------|---------|
| Status | All, Pending, Complete |
| Date | Today, This Week, Custom |
| Search | 🔍 [Search...] |

### Items List
\`\`\`
┌─────────────────────────────────────────────────────────────────────────────┐
│ □ Select All                                                    [Actions ▼] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ ☐ ITEM-001                                              Status: Pending     │
│   Description of first item...                                              │
│   Created by: ${assignees[0]?.name || 'User'} • Today                       │
│   [View →]  [${terminology.approve || 'Approve'}]  [${terminology.reject || 'Reject'}]                                │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ ☐ ITEM-002                                              Status: In Review   │
│   Description of second item...                                             │
│   Created by: ${assignees[1]?.name || 'User'} • Yesterday                   │
│   [View →]  [${terminology.approve || 'Approve'}]  [${terminology.reject || 'Reject'}]                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
\`\`\`
`;
    } else if (isFormView) {
      // Generate form view
      screenContent += `
### Form
\`\`\`
┌─────────────────────────────────────────────────────────────────────────────┐
│  ${flowName.toUpperCase()}                               Status: Draft 📝    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Name *                                                                     │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ Enter name...                                                         │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  Description                                                                │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ Enter description...                                                  │ │
│  │                                                                        │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  Category *                              Priority                           │
│  ┌─────────────────────────┐            ┌───────────────────────────────┐ │
│  │ Select... ▼             │            │ Normal ▼                      │ │
│  └─────────────────────────┘            └───────────────────────────────┘ │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [Cancel]              [Save Draft]              [💾 ${terminology.submit || 'Submit'}]    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
\`\`\`
`;
    } else if (isWorkflowView && steps.some((s: any) => /approve|reject|sign.?off|validate/i.test(`${s?.action ?? ''} ${s?.result ?? ''}`))) {
      // True approval workflow only: steps explicitly describe approve/reject
      screenContent += `
### Progress
\`\`\`
${steps.slice(0, 5).map((s: any, i: number) => `${i === 0 ? '●' : '○'} Step ${i + 1}: ${s?.action?.slice(0, 40) || `Step ${i + 1}`}`).join('\n') || '● Step 1\n○ Step 2\n○ Step 3'}
\`\`\`

### Current Step
${steps[0] ? `
**${steps[0].action || 'Action'}**

${steps[0].details || 'Complete this step to proceed.'}
` : `
Complete the current action to proceed to the next step.
`}

### Actions
\`\`\`
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  [← Previous]                                           [Continue →]        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
\`\`\`
`;
    } else {
      // Document-agnostic: infer UI component per step, output actual app screens
      const corpus = flows.map((f: any) =>
        (f?.steps ?? []).map((s: any) => `${s?.action ?? ''} ${s?.result ?? ''}`).join(' ')
      ).join(' ') + ' ' + jobs.map((j: any) => `${j?.description ?? ''} ${j?.trigger ?? ''}`).join(' ');
      const entities = extractEntitiesFromCorpus(corpus);
      const productName = flowName?.slice(0, 30) || jobs[0]?.description?.slice(0, 30) || 'App';

      if (steps.length > 0) {
        for (let si = 0; si < steps.length; si++) {
          const s = steps[si];
          const action = s?.action ?? '';
          const result = s?.result ?? '';
          const allStepsText = steps.map((st: any) => `${st?.action ?? ''} ${st?.result ?? ''}`).join(' ');
          const componentType = inferStepComponentType(action, result, allStepsText);
          screenContent += stepToFigmaDescription(componentType, s, entities, productName);
        }
      } else {
        screenContent += `
### Content
${description || 'View and manage this item.'}
`;
      }
    }

    return screenContent + '\n---\n';
  }).join('\n');
}

// Generate dynamic interactivity summary from actual flows/jobs
function generateDynamicInteractivitySummary(
  flows: any[],
  _jobs: any[],
  features: StructuralFeatures,
  terminology: any
): string {
  // Get primary actions from features or default
  const primaryActions = features?.primaryActions?.slice(0, 5) || ['View', 'Create', 'Edit', 'Delete'];
  const secondaryActions = ['Filter', 'Search', 'Export', 'Settings'];

  // Build screen list from flows
  const screenList = flows.slice(0, 6).map((flow: any) => {
    const name = flow?.name || 'Screen';
    return `| ${name} | ${primaryActions.slice(0, 2).join(', ')} | ${secondaryActions.slice(0, 2).join(', ')} |`;
  }).join('\n');

  // Build state transitions from entities
  const entities = features?.primaryEntities?.slice(0, 4) || ['Item'];
  const stateTransitions = entities.map((entity: string) => 
    `${entity}:     Draft → Active → ${terminology.approve ? 'Approved' : 'Complete'} / Archived`
  ).join('\n');

  return `## INTERACTIVITY SUMMARY

### Primary Actions Per Screen
| Screen | Primary Actions | Secondary Actions |
|--------|-----------------|-------------------|
| Dashboard | View, Navigate | Filter, Search |
${screenList}

### State Transitions
\`\`\`
${stateTransitions}
\`\`\`

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| A | ${terminology.approve ?? 'Approve'} selected |
| R | ${terminology.reject ?? 'Reject'} selected |
| E | Expand details |
| / | Focus search |
| Esc | Close modal |
| Enter | Confirm action |
`;
}

// ============ END DYNAMIC SCREEN GENERATION ============

// Generate enterprise/finance application UI with ACTION-ORIENTED work interfaces
// This function generates screens from the ACTUAL PRD content (flows/jobs)
// JTBD tool-specific templates are only added when those patterns are detected
function generateEnterpriseScreen(
  cpm: any,
  features: StructuralFeatures,
  theme: UiTheme,
  appName: string
): string {
  const problem = cpm?.intent?.problem?.statement ?? '';
  const outcome = cpm?.intent?.goal?.primary_outcome ?? '';
  const flows = cpm?.flows ?? [];
  const jobs = cpm?.jobs ?? [];
  const assignees = generateAssignees();
  
  // Get JTBD tool info from theme if available
  const jtbdTool = theme.jtbdTool;
  const toolAttribution = jtbdTool 
    ? `\n\n**UI Reference**: This prototype uses patterns inspired by **${jtbdTool.toolName}** (${jtbdTool.toolDescription}).`
    : '';
  
  // Get tool-specific terminology
  const terminology = jtbdTool?.terminology ?? {
    item: 'item',
    approve: 'approve',
    reject: 'reject',
    submit: 'submit',
    review: 'review',
  };
  
  // Combine all PRD text for pattern detection
  const allText = [
    problem,
    outcome,
    ...jobs.map((j: any) => `${j.description ?? ''} ${j.success_outcome ?? ''}`),
    ...flows.map((f: any) => `${f.name ?? ''} ${f.steps?.map((s: any) => s.action).join(' ') ?? ''}`),
  ].join(' ').toLowerCase();
  
  // Detect SPECIFIC finance patterns (only trigger finance UI when these are present)
  const hasCashApplication = /cash\s*application|payment\s*match|remittance|lockbox|unapplied\s*cash/i.test(allText);
  const hasReconciliation = /reconcil|settlement\s*match|balance\s*match|variance|cert/i.test(allText);
  const hasMEC = /mec\b|month[\s-]*end|close\s*process|period\s*close|financial\s*close/i.test(allText);
  const hasBilling = /billing|invoice|subscription|bill\s*run/i.test(allText);
  const hasApprovals = /approval\s*workflow|procurement|requisition|purchase\s*order/i.test(allText);
  const hasAnomalyDetection = /anomaly|exception\s*review|fraud|unusual\s*pattern|alert\s*queue/i.test(allText);
  
  // Check if this is actually a finance/operations app
  const isActuallyFinanceApp = hasCashApplication || hasReconciliation || hasMEC || hasBilling || hasAnomalyDetection;
  
  // Determine which conditional screens to show based on detected patterns
  const showOnboarding = /onboard|config|setup|product\s*setup/i.test(allText);
  const showMEC = hasMEC;
  
  // Build navigation from actual flows
  const flowNames = flows.slice(0, 8).map((f: any) => f?.name ?? 'Flow');
  
  let ui = `## APPLICATION OVERVIEW
**${appName}** - ${outcome.slice(0, 150) || 'Enterprise application'}

**Problem Being Solved:**
${problem.slice(0, 300) || 'See PRD for details'}
${toolAttribution}

## DESIGN SYSTEM
- Background: ${theme.background}
- Surface: ${theme.surface}
- Primary: ${theme.primary}
- Text: ${theme.text}, Secondary: ${theme.textSecondary}

---

## NAVIGATION: SIDEBAR
### Sidebar (fixed left, width: 240px)
| Icon | Label | Badge | Click Action |
|------|-------|-------|--------------|
| 🏠 | **Dashboard** | | → Screen: Dashboard |
${flowNames.slice(0, 6).map((name: string, i: number) => `| ${['📄', '✏️', '🔍', '📋', '⚙️', '✅'][i] || '📌'} | ${name} | ${i === 0 ? '**New**' : ''} | → Screen: ${name.replace(/[^a-zA-Z0-9]/g, '')} |`).join('\n')}
| ─── | | | |
| ⚙️ | Settings | | → Screen: Settings |
| ❓ | Help | | → Screen: Help |
---

## SCREEN 1: DASHBOARD
Frame: \`Dashboard\`
**Entry Point**: Main landing page showing overview and quick actions

### Header
- Logo: ${appName}
- Title: "**${appName}**"
- Right: 🔍 Search | 🔔 Notifications | 👤 ${assignees[0]?.name ?? 'User'}

### Overview Cards
| ${features.primaryEntities.slice(0, 4).map(e => `**${e}**`).join(' | ') || '**Items** | **Tasks** | **Status** | **Progress**'} |
|${features.primaryEntities.slice(0, 4).map(() => '---').join('|') || '---|---|---|---'}|
| ${features.primaryEntities.slice(0, 4).map((_, i) => [`**12**`, `**8**`, `**4**`, `**94%**`][i] || '**-**').join(' | ') || '**12** | **8** | **4** | **94%**'} |

### Quick Actions (from Jobs to be Done)
${jobs.slice(0, 4).map((job: any) => `- [${job?.job_id || job?.description?.slice(0, 25) || 'Start'} →]`).join('\n') || '- [Start New →]\n- [View All →]\n- [Settings →]'}

### Recent Activity
| Time | User | Action | Status |
|------|------|--------|--------|
| 10:32 AM | ${assignees[0]?.name ?? 'User'} | ${flows[0]?.name ?? 'Action'} completed | ✅ Done |
| 10:15 AM | ${assignees[1]?.name ?? 'User'} | Started ${flows[1]?.name ?? 'workflow'} | 🔄 In Progress |
| 09:45 AM | ${assignees[2]?.name ?? 'User'} | ${terminology.review ?? 'Reviewed'} item | ✅ Done |

---

${generateDynamicFlowScreens(flows, jobs, assignees, terminology)}

${isActuallyFinanceApp && showOnboarding ? `---

## SCREEN: PRODUCT CONFIGURATION STUDIO
Frame: \`ProductConfig\`
**Entry Point**: Sidebar → Product Setup

### Header
- Breadcrumb: Configuration > Product Setup
- Title: "**Product Configuration**"
- [← Back to Work Hub]  [Save Draft]  [Publish]

### Configuration Form
\`\`\`
┌─────────────────────────────────────────────────────────────────────────────┐
│  PRODUCT CONFIGURATION                               Status: Draft 📝       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  BASIC INFORMATION                                                          │
│  ─────────────────                                                          │
│                                                                              │
│  Product Name *                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ Premium Subscription - Enterprise                                     │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  Product Code *                        Category                             │
│  ┌─────────────────────────┐          ┌─────────────────────────────────┐ │
│  │ PREM-ENT-001            │          │ Subscription ▼                  │ │
│  └─────────────────────────┘          └─────────────────────────────────┘ │
│                                                                              │
│  Description                                                                │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ Enterprise-tier premium subscription with advanced features...        │ │
│  │                                                                        │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  PRICING                                                                    │
│  ───────                                                                    │
│                                                                              │
│  Pricing Model *                       Base Price *                         │
│  ┌─────────────────────────┐          ┌─────────────────────────────────┐ │
│  │ Tiered ▼                │          │ $ 299.00         per month      │ │
│  └─────────────────────────┘          └─────────────────────────────────┘ │
│                                                                              │
│  [+ Add Pricing Tier]                                                       │
│                                                                              │
│  REVENUE RECOGNITION                                                        │
│  ────────────────────                                                       │
│                                                                              │
│  Recognition Method *                  Recognition Period                   │
│  ┌─────────────────────────┐          ┌─────────────────────────────────┐ │
│  │ Straight-line ▼         │          │ Over subscription term          │ │
│  └─────────────────────────┘          └─────────────────────────────────┘ │
│                                                                              │
│  ☑ Defer revenue until service delivery                                    │
│  ☐ Recognize on invoice date                                               │
│  ☑ Prorate partial months                                                  │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [Cancel]              [Save as Draft]              [💾 Save & Publish]    │
│                                                                              │
│  Last saved: 2 minutes ago by ${assignees[0]?.name ?? 'User'}                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
\`\`\`

### Validation Panel (right sidebar)
\`\`\`
┌─────────────────────────┐
│ VALIDATION              │
├─────────────────────────┤
│ ✓ Product name set      │
│ ✓ Product code unique   │
│ ✓ Pricing configured    │
│ ✓ Rev rec rules set     │
│ ⚠️ No GL account linked │
│                         │
│ [Fix Issues]            │
└─────────────────────────┘
\`\`\`

---
` : ''}

${isActuallyFinanceApp && showMEC ? `## SCREEN: CLOSE MANAGER (MEC)
Frame: \`CloseManager\`
**Entry Point**: Sidebar → Close Manager

### Header
- Breadcrumb: Month-End Close > January 2026
- Title: "**Close Manager**"
- Subtitle: "January 2026 Close Period"
- [← Back to Work Hub]

### Close Progress
\`\`\`
┌─────────────────────────────────────────────────────────────────────────────┐
│  JANUARY 2026 CLOSE                                     Due: Feb 5, 2026   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Overall Progress: ████████████░░░░░░░░  65%                                │
│                                                                              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │ Completed  │  │ In Progress│  │ Blocked    │  │ Not Started│            │
│  │     8      │  │     3      │  │     1      │  │     4      │            │
│  │ tasks      │  │ tasks      │  │ task       │  │ tasks      │            │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘            │
│                                                                              │
│  Critical Path: Data Validation → Reconciliation → Journal Review → Sign-off│
│                     ✓               ●                 ○              ○       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
\`\`\`

### My Assigned Tasks (actionable)
\`\`\`
┌─────────────────────────────────────────────────────────────────────────────┐
│  MY TASKS (3 assigned to you)                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ 🔄 Revenue Reconciliation                           IN PROGRESS        ││
│  │                                                                         ││
│  │ Compare recognized revenue against billing system totals.              ││
│  │ Variance threshold: ±$1,000                                            ││
│  │                                                                         ││
│  │ Current Status: Variance of $2,340 identified - needs investigation    ││
│  │                                                                         ││
│  │ Due: Feb 3, 2026 (TODAY)                                               ││
│  │                                                                         ││
│  │ ┌─────────────────────────────────────────────────────────────────┐   ││
│  │ │ [📊 Open Reconciliation]  [💬 Add Note]  [✓ Mark Complete]      │   ││
│  │ └─────────────────────────────────────────────────────────────────┘   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ ○ Journal Entry Review                              NOT STARTED        ││
│  │                                                                         ││
│  │ Review and approve month-end journal entries.                          ││
│  │ Blocked by: Revenue Reconciliation                                     ││
│  │                                                                         ││
│  │ Due: Feb 4, 2026                                                       ││
│  │                                                                         ││
│  │ ┌─────────────────────────────────────────────────────────────────┐   ││
│  │ │ [▶️ Start Task]  [📋 View Requirements]  [→ Reassign]           │   ││
│  │ └─────────────────────────────────────────────────────────────────┘   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ ○ Final Sign-off                                    NOT STARTED        ││
│  │                                                                         ││
│  │ Approve final close package for submission to Controller.              ││
│  │ Requires: All prior tasks complete                                     ││
│  │                                                                         ││
│  │ Due: Feb 5, 2026                                                       ││
│  │                                                                         ││
│  │ ┌─────────────────────────────────────────────────────────────────┐   ││
│  │ │ [📄 Preview Package]  [Cannot start - dependencies pending]     │   ││
│  │ └─────────────────────────────────────────────────────────────────┘   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
\`\`\`

### Task Action Modal: Mark Complete (appears when clicking "Mark Complete")
\`\`\`
┌─────────────────────────────────────────────────────────────────────────────┐
│  COMPLETE TASK: Revenue Reconciliation                         [✕ Close]   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Completion Checklist:                                                      │
│  ☑ Revenue totals compared and documented                                  │
│  ☑ Variances investigated and explained                                    │
│  ☑ Supporting documentation attached                                       │
│  ☐ Manager notified of completion                                          │
│                                                                              │
│  Completion Notes *                                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ Reconciliation complete. $2,340 variance due to timing difference     │ │
│  │ on subscription renewals - will clear in February period.             │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  Attachments                                                                │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ 📎 Jan_2026_Reconciliation.xlsx                        [✕ Remove]    │ │
│  │ 📎 Variance_Analysis.pdf                               [✕ Remove]    │ │
│  │                                                                        │ │
│  │ [+ Add Attachment]                                                     │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌──────────────────────┐              ┌─────────────────────────────┐     │
│  │      Cancel          │              │   ✓ Complete Task           │     │
│  └──────────────────────┘              └─────────────────────────────┘     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
\`\`\`

---
` : ''}

${isActuallyFinanceApp ? `## SCREEN: APPROVALS QUEUE
Frame: \`Approvals\`
**Entry Point**: Sidebar → Approvals

### Header
- Breadcrumb: Work Hub > Approvals
- Title: "**Pending Approvals**"
- Subtitle: "Items awaiting your approval"
- [← Back to Work Hub]

### Approval List
\`\`\`
┌─────────────────────────────────────────────────────────────────────────────┐
│  AWAITING YOUR APPROVAL (2)                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ 📋 Close Task Completion                                               ││
│  │                                                                         ││
│  │ Task: Data Validation for January 2026                                 ││
│  │ Submitted by: ${assignees[1]?.name ?? 'Team Member'} on Feb 2, 2026 at 4:32 PM                     ││
│  │                                                                         ││
│  │ Summary: All data feeds validated successfully. 3 minor discrepancies ││
│  │ identified and documented. Ready for reconciliation phase.            ││
│  │                                                                         ││
│  │ Attachments: [📎 Validation_Report.pdf] [📎 Discrepancy_Log.xlsx]     ││
│  │                                                                         ││
│  │ ┌─────────────────────────────────────────────────────────────────┐   ││
│  │ │ [✓ Approve]   [✕ Reject]   [💬 Request Changes]   [📄 Details] │   ││
│  │ └─────────────────────────────────────────────────────────────────┘   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ 💰 Write-off Request                                  🔴 HIGH VALUE    ││
│  │                                                                         ││
│  │ Request: Write off $12,450 for uncollectable receivable                ││
│  │ Customer: Defunct Corp (closed business)                               ││
│  │ Submitted by: ${assignees[2]?.name ?? 'Team Member'} on Feb 1, 2026                                ││
│  │                                                                         ││
│  │ Justification: Customer filed for bankruptcy on Jan 15. Legal has     ││
│  │ confirmed no recovery expected. Supporting documentation attached.     ││
│  │                                                                         ││
│  │ ┌─────────────────────────────────────────────────────────────────┐   ││
│  │ │ [✓ Approve Write-off]  [✕ Deny]  [↗️ Escalate to Controller]   │   ││
│  │ └─────────────────────────────────────────────────────────────────┘   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
\`\`\`

### Approval Modal: Approve with Comments
\`\`\`
┌─────────────────────────────────────────────────────────────────────────────┐
│  APPROVE: Data Validation for January 2026                    [✕ Close]    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  You are approving this task completion.                                    │
│                                                                              │
│  Approval Comments (optional)                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ Reviewed validation report. Good work on identifying the              │ │
│  │ discrepancies early. Approved to proceed to reconciliation.           │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ☑ Notify submitter of approval                                            │
│  ☑ Unlock dependent tasks                                                  │
│                                                                              │
│  ┌──────────────────────┐              ┌─────────────────────────────┐     │
│  │      Cancel          │              │   ✓ Confirm Approval        │     │
│  └──────────────────────┘              └─────────────────────────────┘     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
\`\`\`

---
` : ''}

${generateDynamicInteractivitySummary(flows, jobs, features, terminology)}
`;

  // Add tool-specific UI templates based on detected JTBD
  if (jtbdTool) {
    ui += `
---

## TOOL-SPECIFIC UI PATTERNS

The following screens use UI patterns inspired by **${jtbdTool.toolName}** (${jtbdTool.toolDescription}).

`;
    
    // Add HighRadius-style workbench for cash application
    if (jtbdTool.toolName === 'HighRadius' || hasCashApplication) {
      ui += `
### ${jtbdTool.toolName}-Style Cash Application Interface
${generateHighRadiusStyleWorkbench(assignees)}
`;
    }
    
    // Add FloQast-style checklist for month-end close
    if (jtbdTool.toolName === 'FloQast' || hasMEC) {
      ui += `
### ${jtbdTool.toolName === 'FloQast' ? 'FloQast' : 'Close Management'}-Style Month-End Close
${generateFloQastStyleChecklist(assignees)}
`;
    }
    
    // Add BlackLine-style reconciliation for settlement matching
    if (jtbdTool.toolName === 'BlackLine' || hasReconciliation) {
      ui += `
### ${jtbdTool.toolName === 'BlackLine' ? 'BlackLine' : 'Reconciliation'}-Style Account Certification
${generateBlackLineStyleReconciliation(assignees)}
`;
    }
    
    // Add Zuora-style billing interface
    if (jtbdTool.toolName === 'Zuora Billing' || hasBilling) {
      ui += `
### Zuora-Style Subscription Billing
${generateZuoraStyleBilling()}
`;
    }
    
    // Add Coupa-style approvals
    if (jtbdTool.toolName === 'Coupa' || hasApprovals) {
      ui += `
### Coupa-Style Approval Workflow
${generateCoupaStyleApprovals(assignees)}
`;
    }
    
    // Add Signifyd-style anomaly detection
    if (jtbdTool.toolName === 'Signifyd' || hasAnomalyDetection) {
      ui += `
### Signifyd-Style Anomaly Detection
${generateSignifydStyleAnomalyDetection()}
`;
    }
  }

  return ui;
}

// NOTE: generateChecklistDetailScreen and generateFlowDetailScreen were removed
// as they were replaced by action-oriented work interfaces and JTBD tool-specific templates

// ============ DYNAMIC VIEWS GENERATOR v2 ============
// Generates rich, natural-language screen descriptions from PRD content.
// Each flow becomes a view (or grouped if > 7). Single large flows are split.
// Output is a detailed design brief optimized for AI prototyping tools.
// Nothing is hardcoded — all content is derived from the PRD's flows, jobs, and context.

interface DynamicViewV2 {
  name: string;
  description: string;
  icon: string;
  flowSteps: Array<{ step: any; flow: any; flowIdx: number; stepIdx: number }>;
  linkedJobs: any[];
  flowNames: string[];
}

// ─── Helper: parse step number from actor_id like "1. User" ───
function parseActorStepNumber(actorId: string): number | null {
  const m = String(actorId ?? '').match(/^(\d+)\.\s*/);
  return m ? parseInt(m[1]!, 10) : null;
}

// ─── Helper: clean actor name (remove number prefix) ───
function cleanActorName(actorId: string): string {
  return String(actorId ?? 'User')
    .replace(/^(\d+)\.\s*/, '')
    .replace(/^actor_/i, '')
    .replace(/_/g, ' ')
    .trim() || 'User';
}

// ─── Split a large single flow into logical sections ───
function splitFlowIntoSections(flow: any): Array<{ name: string; steps: any[] }> {
  const steps: any[] = flow?.steps ?? [];
  if (steps.length <= 8) {
    return [{ name: flow?.name ?? 'Main', steps }];
  }

  // Detect boundaries where actor step numbering resets (e.g., 10→1)
  const boundaries: number[] = [0];
  for (let i = 1; i < steps.length; i++) {
    const prev = parseActorStepNumber(steps[i - 1]?.actor_id ?? '');
    const curr = parseActorStepNumber(steps[i]?.actor_id ?? '');
    if (prev !== null && curr !== null && curr < prev) {
      boundaries.push(i);
    }
  }

  // If no numbering resets found, split in chunks of ~8-10
  if (boundaries.length <= 1) {
    const chunkSize = Math.ceil(steps.length / Math.ceil(steps.length / 9));
    boundaries.length = 0;
    for (let i = 0; i < steps.length; i += chunkSize) {
      boundaries.push(i);
    }
  }

  // Build sections with auto-derived names
  const sections: Array<{ name: string; steps: any[] }> = [];
  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i]!;
    const end = i < boundaries.length - 1 ? boundaries[i + 1]! : steps.length;
    const sectionSteps = steps.slice(start, end);

    // Derive a section name from the dominant actions/results in this section
    const combinedText = sectionSteps
      .map((s: any) => `${s?.action ?? ''} ${s?.result ?? ''}`)
      .join(' ');
    const sectionName = deriveSectionName(combinedText, sectionSteps);

    sections.push({ name: sectionName, steps: sectionSteps });
  }

  return sections;
}

// ─── Derive a concise section name from combined step text ───
function deriveSectionName(_text: string, steps: any[]): string {
  // Extract the most meaningful action phrases from the steps
  const actions = steps
    .map((s: any) => String(s?.action ?? ''))
    .filter(Boolean);
  const results = steps
    .map((s: any) => String(s?.result ?? ''))
    .filter(Boolean);

  // Try to extract a dominant theme from the first and last steps
  const firstAction = actions[0] ?? '';
  const lastResult = results[results.length - 1] ?? '';

  // Use the first action as the primary signal, cleaned up
  const cleaned = firstAction
    .replace(/^(clicks?|selects?|opens?|views?|reviews?|updates?|enters?)\s+(the\s+|a\s+|an\s+)?/i, '')
    .trim();

  if (cleaned.length > 3 && cleaned.length < 40) {
    // Capitalize first letter of each word
    return cleaned
      .split(/\s+/)
      .slice(0, 4)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  // Fallback: use last result as hint
  if (lastResult.length > 3) {
    return lastResult.split(/\s+/).slice(0, 4).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  return 'Application View';
}

// ─── Describe a component in natural language ───
function describeComponent(
  action: string,
  result: string,
  componentType: string,
  theme: any,
  viewContext: string,
): string {
  const a = action.trim();
  const r = result.trim();
  const aUi = toUserFacingCopy(a, 50);
  const rUi = toUserFacingCopy(r, 60);

  switch (componentType) {
    case 'metrics': {
      const metrics = extractMetricNamesV2(`${a} ${r} ${viewContext}`);
      const metricList = metrics.length > 0 ? metrics.join(', ') : 'key performance indicators';
      return `A **metrics dashboard section** displaying ${metricList}. CRITICAL: Display in separate cards. One value per card. Value 28px bold max, label 12px below. Do not merge or concatenate values. Each metric is shown in its OWN card with value on top, label below. Cards use ${theme.surface} background with subtle shadow. Tapping any metric card opens a detailed drill-down view.`;
    }

    case 'chart': {
      const metrics = extractMetricNamesV2(`${a} ${r}`);
      const chartSubject = metrics[0] || 'data trends';
      return `A **data visualization chart** showing ${chartSubject} over time. Use a line or area chart with ${theme.primary} as the primary line color and a semi-transparent gradient fill below. Include labeled axes, interactive hover tooltips showing exact values, and annotation markers at key inflection points. The chart header includes time range filters (1h, 24h, 7d, 30d).`;
    }

    case 'list': {
      return `A **recommendations list** showing actionable suggestions. Each item is a card with: an icon indicating the recommendation type, a bold title, a description of the specific action to take, an impact indicator bar (high/medium/low), and "Apply" and "Save" action buttons. Cards are sorted by impact. Applied recommendations show a checkmark and muted styling.`;
    }

    case 'notification': {
      return `A **motivational feedback section** with an encouraging message, a progress visualization (progress bar or circular indicator using ${theme.primary}), achievement stats (streaks, improvements, milestones), and a prominent call-to-action button to continue the workflow. The section has a celebratory feel with subtle animation.`;
    }

    case 'selection': {
      return `A **selection interface** where the user chooses from available options. Each option is displayed as a selectable card with a title and brief description. The selected option has a ${theme.primary} border and light tint background. Unselected options have a gray border on ${theme.surface} background. Selecting an option immediately updates the content below.`;
    }

    case 'action_button': {
      return `A **primary action button** labeled based on the action ("${aUi}"). The button uses ${theme.primary} background with white text. States: default → loading (spinner replaces text) → success (brief checkmark animation) → done. After clicking, the result "${rUi}" is shown as a success toast notification.`;
    }

    case 'upload': {
      return `A **file upload zone** with a dashed border, cloud icon, and text "Drag files here or click to browse." Include a browse button (${theme.primary}). States: idle (dashed border) → drag-over (${theme.primary} solid border, light background tint) → uploading (progress bar with percentage) → complete (green checkmark, file name displayed). Show the uploaded file as a card with name, type, size, and a remove button.`;
    }

    case 'media': {
      return `A **media display area** showing a content preview. If it's a video, show a thumbnail with a centered play button overlay and duration badge. If it's an image, show it at full width with rounded corners. Below the media, display the title, description, timestamp, and relevant metadata. Tapping opens a full-screen viewer.`;
    }

    case 'status': {
      return `A **status indicator** showing the current state with a colored badge (green for positive, amber for neutral, red for negative). Include a progress bar (${theme.primary} fill) showing completion percentage, and a text description of what "${rUi}" means. The status updates in real-time with smooth animation.`;
    }

    case 'form': {
      return `A **form input field** for "${aUi}". Use a text input or textarea (depending on content length) with a label above and helper text below. The field has auto-save (debounced 500ms, shows "Saved ✓" indicator). Focus state: ${theme.primary} 2px border. Validation: inline error messages in red below the field when invalid. After editing, the result is: "${rUi}".`;
    }

    case 'table': {
      return `A **data table** displaying rows of information relevant to "${aUi}". Include sortable column headers, hover highlighting on rows, and action icons (edit, delete, view) on each row. The table has alternating row backgrounds for readability. Support reordering via drag-and-drop or arrow buttons.`;
    }

    case 'card': {
      return `A **content card** displaying "${aUi}" information. The card has ${theme.surface} background, 8px rounded corners, and subtle shadow on hover. Content shows the key information from the action, with secondary detail text. Include contextual action buttons (e.g., "View Details", "Edit"). Result: "${rUi}".`;
    }

    default: {
      return `An **interactive element** for "${aUi}". The user performs this action and sees: "${rUi}". Design this as an appropriate UI component based on the interaction type — use the design system colors and spacing.`;
    }
  }
}

// ─── Extract metric names (same logic as before) ───
function extractMetricNamesV2(text: string): string[] {
  const metrics: string[] = [];
  const patterns: Array<[RegExp, string]> = [
    [/views?/i, 'Views'], [/watch\s*time/i, 'Watch Time'], [/engagement/i, 'Engagement'],
    [/retention/i, 'Retention'], [/reach/i, 'Reach'], [/impressions?/i, 'Impressions'],
    [/shares?/i, 'Shares'], [/comments?/i, 'Comments'], [/likes?/i, 'Likes'],
    [/followers?/i, 'Followers'], [/saves?/i, 'Saves'], [/click\s*rate/i, 'Click Rate'],
    [/conversion/i, 'Conversion'], [/bounce\s*rate/i, 'Bounce Rate'], [/revenue/i, 'Revenue'],
    [/subscribers?/i, 'Subscribers'], [/downloads?/i, 'Downloads'], [/ratings?/i, 'Rating'],
    [/growth/i, 'Growth'], [/momentum/i, 'Momentum'], [/performance/i, 'Performance'],
    [/hook\s*strength/i, 'Hook Strength'], [/audience/i, 'Audience'], [/completion/i, 'Completion'],
    [/frequency/i, 'Frequency'], [/streak/i, 'Streak'], [/score/i, 'Score'],
    [/orders?/i, 'Orders'], [/sales/i, 'Sales'], [/profit/i, 'Profit'],
    [/cost/i, 'Cost'], [/inventory/i, 'Inventory'], [/customers?/i, 'Customers'],
  ];
  const seen = new Set<string>();
  for (const [pattern, label] of patterns) {
    if (pattern.test(text) && !seen.has(label)) {
      metrics.push(label);
      seen.add(label);
    }
    if (metrics.length >= 6) break;
  }
  return metrics;
}

// Generate mobile app UI (Home, Search, Library, flow-based screens) for consumer/app-style documents
function generateMobileAppUI(cpm: any, features: StructuralFeatures, theme: UiTheme, _appName: string): string {
  const flows = cpm?.flows ?? [];
  const requirements = cpm?.requirements ?? [];
  const contentType = features.contentType;

  // Extract requirements for display
  const accessRules = requirements.filter((r: any) =>
    /age|auth|managed|unauthenticated/i.test(r?.description ?? '')
  );
  const searchRules = requirements.filter((r: any) =>
    /search|retriev|index|filter/i.test(r?.description ?? '')
  );

  let ui = `## NAVIGATION: APP-STYLE
### Top Bar (sticky, dark: ${theme.background})
- Left: App logo
- Center: Search bar with icon "Search for ${contentType}..."
- Right: [Your Library] button, User avatar dropdown

### Bottom Navigation (mobile) / Sidebar (desktop)
- 🏠 Home
- 🔍 Search (current)
- 📚 Your Library
- ➕ Create

---

## SCREEN 1: HOME / DISCOVER
Frame: \`Home\`

### Hero Section
- Large gradient banner (${theme.primary} to ${theme.background})
- Title: "**Discover ${contentType}**"
- Subtitle: "Find ${contentType} created by the community"
- [Start Searching] button (${theme.primary}, prominent)

### Recently Played Section
Title: "**Recently Played**" with [See All →]

Horizontal scroll of cards (4 visible):
| Card 1 | Card 2 | Card 3 | Card 4 |
|--------|--------|--------|--------|
| Cover art (square, rounded) | Cover art | Cover art | Cover art |
| Title: "Summer Vibes" | "Chill Mix" | "Party Mode" | "Acoustic" |
| by @creator | by @user | by @artist | by @maker |
| ▶ 12.4K plays | ▶ 8.7K | ▶ 45.2K | ▶ 3.1K |

### Your Library Quick Access
${features.hasLibrary ? `Title: "**From Your Library**"
Grid of saved ${contentType} (2x2)` : ''}

---

## SCREEN 2: SEARCH
Frame: \`Search\`

### Search Header
- Large search input (focused state, ${theme.primary} border)
- Placeholder: "Search ${contentType} by name, creator, or tag..."
- Voice search icon, Clear (X) button

### Search Filters
${searchRules.length > 0 ? `Active filter pills from requirements:
${searchRules.slice(0, 3).map((r: any) => `- [${(r?.title ?? 'Filter').slice(0, 25)}] (${theme.primary} pill, removable)`).join('\n')}` : `Filter pills:
- [All ${contentType}] (selected, ${theme.primary})
- [Saved Only]
- [Recent]`}

### Search Results
Header: "**Results**" - "24 ${contentType} found"

List view with cards:
| # | Cover | Info | Actions |
|---|-------|------|---------|
| 1 | 🎵 Square art | **"Summer Vibes"** by @creator • ▶ 12.4K plays | [▶] [♡] [⋯] |
| 2 | 🎵 Square art | **"Chill Mix"** by @producer_x • ▶ 8.7K plays | [▶] [♡] [⋯] |
| 3 | 🎵 Square art | **"Party Track"** by @djmaster • ▶ 45.2K plays | [▶] [♡] [⋯] |

Each row:
- Hover: Background lightens to ${theme.surface}
- Play button overlay on cover art
- Heart icon: Outline (not saved) or Filled ${theme.primary} (saved)
- More menu (⋯): Share, Add to list, Report

${accessRules.length > 0 ? `### Access Notices
${accessRules.slice(0, 2).map((r: any) => `⚠️ ${(r?.title ?? 'Notice').slice(0, 30)}: ${(r?.description ?? '').slice(0, 60)}...`).join('\n')}` : ''}

---

## SCREEN 3: ${contentType.toUpperCase().slice(0, -1)} DETAIL
Frame: \`Detail\`

### Header Bar
- [← Back] button (${theme.text})
- [Share] icon, [⋯] More menu

### Hero Section (large cover art layout)
| Cover Art (200x200) | Info |
|---------------------|------|
| Large square image | Type badge: "${contentType.slice(0, -1)}" (${theme.primary} pill) |
| with play overlay | **"Summer Vibes"** |
| | by **@creator** (clickable) |
| | Based on: "Original" - Creator Name |
| | ▶ 12.4K plays • 💾 2.3K saves • 📅 Jan 15, 2026 |

### Action Buttons Row
- [▶ Play] - Large ${theme.primary} button
- [♡ Save to Library] - Outline button (or filled if saved)
- [↗ Share] - Outline button
- [⋯] More options

### Item Info Card
| Field | Value |
|-------|-------|
| ${contentType.slice(0, -1)} Name | "Summer Vibes" |
| Original | "Summer Dreams" by Creator X |
| Creator | @creator |
| Created | January 15, 2026 |

---

## SCREEN 4: YOUR LIBRARY
Frame: \`Library\`

### Header
- Title: "**Your Library**"
- Subtitle: "Your saved ${contentType}"
- Sort: [Recently Added ▼]

### Filter Tabs
- [All] (selected) - [${contentType}] - [Lists] - [Creators]

### Library Grid (3 columns)
${contentType} cards with:
- Square cover art
- Title
- Creator
- Added date
- Play overlay on hover

### Empty State (if no items)
- Large 📚 icon (${theme.textSecondary})
- "Your library is empty"
- "Save ${contentType} to see them here"
- [Discover ${contentType}] button

---

`;

  // Add flow-specific screens
  let screenNum = 5;
  for (const flow of flows.slice(0, 3)) {
    const flowName = flow?.name ?? `Flow ${screenNum - 4}`;
    const steps = flow?.steps ?? [];

    ui += `## SCREEN ${screenNum}: ${flowName.toUpperCase()}
Frame: \`${flowName.replace(/\s+/g, '')}\`

### Context
This screen implements the "${flowName}" user flow.

### Flow Steps (App-style cards)
${steps.slice(0, 5).map((step: any, idx: number) => {
  const action = step?.action ?? 'Action';
  const result = step?.result ?? 'Result';
  return `**Step ${idx + 1}:** ${action.slice(0, 60)}
- Result: ${result.slice(0, 50)}
- UI: ${action.toLowerCase().includes('search') ? 'Search interface' : action.toLowerCase().includes('save') ? 'Save confirmation' : 'Card/List view'}`;
}).join('\n\n')}

${flow?.preconditions?.length ? `### Preconditions (shown as notices)
${flow.preconditions.slice(0, 3).map((p: string) => `- ⚠️ ${p.slice(0, 60)}`).join('\n')}` : ''}

---

`;
    screenNum++;
  }

  // Add interactivity section
  ui += `## INTERACTIVITY (APP-STYLE)
- **Hover States**: Cards lift slightly with shadow, play button appears
- **Active States**: ${theme.primary} highlight on selected items
- **Transitions**: Smooth 200ms transitions on all interactions
- **Play Animation**: Equalizer bars animation when playing
- **Save Animation**: Heart fills with bounce effect
- **Loading**: Skeleton cards with shimmer effect
- **Toast Notifications**: Bottom-center, dark with ${theme.primary} accent
  - "Added to Your Library"
  - "Removed from Library"
  - "Link copied to clipboard"

## MOBILE ADAPTATIONS
- Bottom navigation bar (Home, Search, Library, Create)
- Full-width cards in list view
- Swipe gestures for actions (swipe right to save)
- Mini player bar at bottom when playing
`;

  return ui;
}

// ─── Build views from PRD content ───
function buildDynamicViewsV2(cpm: any, appName: string, features: any, theme: any): string {
  const flows: any[] = cpm?.flows ?? [];
  const jobs: any[] = cpm?.jobs ?? [];
  const openQuestions: any[] = cpm?.review?.open_questions ?? cpm?.open_questions ?? [];
  // problem and outcome are available in the prompt header, used here for context
  void (cpm?.intent?.problem?.statement);
  void (cpm?.intent?.goal?.primary_outcome);

  // ── Step 1: Create views from flows ──
  const views: DynamicViewV2[] = [];

  if (flows.length === 0 && jobs.length > 0) {
    // No flows — create views from jobs
    for (let ji = 0; ji < Math.min(jobs.length, 7); ji++) {
      const job = jobs[ji];
      const rawName = (job?.job_id ?? '').replace(/^job_/i, '').replace(/_/g, ' ');
      const name = rawName
        ? rawName.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        : `Feature ${ji + 1}`;
      views.push({
        name,
        description: toUserFacingCopy(job?.description ?? '', 150) || 'User feature',
        icon: inferViewIconV2(name, job?.description ?? ''),
        flowSteps: [],
        linkedJobs: [job],
        flowNames: [],
      });
    }
  } else if (flows.length === 1 && (flows[0]?.steps ?? []).length > 10) {
    // Single flow with many steps — split into logical sections
    const sections = splitFlowIntoSections(flows[0]);
    for (let si = 0; si < sections.length; si++) {
      const section = sections[si]!;
      const sectionSteps = section.steps.map((s: any, idx: number) => ({
        step: s,
        flow: flows[0],
        flowIdx: 0,
        stepIdx: idx,
      }));
      const stepsText = sectionSteps
        .map((s: any) => `${s.step?.action ?? ''} ${s.step?.result ?? ''}`)
        .join(' ');
      views.push({
        name: section.name,
        description: toUserFacingCopy(
          sectionSteps
            .map((s: any) => s.step?.result ?? '')
            .filter(Boolean)
            .join('. '),
          150
        ) || section.name,
        icon: inferViewIconV2(section.name, stepsText),
        flowSteps: sectionSteps,
        linkedJobs: [],
        flowNames: [section.name],
      });
    }
  } else if (flows.length <= 7) {
    // Each flow becomes its own view
    for (let fi = 0; fi < flows.length; fi++) {
      const flow = flows[fi];
      const flowName = flow?.name ?? `Flow ${fi + 1}`;
      const flowSteps = (flow?.steps ?? []).map((s: any, si: number) => ({
        step: s,
        flow,
        flowIdx: fi,
        stepIdx: si,
      }));
      const stepsText = flowSteps
        .map((s: any) => `${s.step?.action ?? ''} ${s.step?.result ?? ''}`)
        .join(' ');
      views.push({
        name: flowName,
        description: flowSteps
          .map((s: any) => s.step?.result ?? '')
          .filter(Boolean)
          .join('. ')
          .slice(0, 150) || flowName,
        icon: inferViewIconV2(flowName, stepsText),
        flowSteps,
        linkedJobs: [],
        flowNames: [flowName],
      });
    }
  } else {
    // Many flows — group by semantic similarity down to 7
    const groups: Array<{ flowIndices: number[]; text: string }> = flows.map(
      (f: any, fi: number) => ({
        flowIndices: [fi],
        text: `${f?.name ?? ''} ${(f?.steps ?? []).map((s: any) => `${s?.action ?? ''} ${s?.result ?? ''}`).join(' ')}`.toLowerCase(),
      }),
    );

    while (groups.length > 7) {
      let bestI = 0;
      let bestJ = 1;
      let bestScore = -1;
      for (let i = 0; i < groups.length; i++) {
        for (let j = i + 1; j < groups.length; j++) {
          const score = calculateWordOverlapV2(groups[i]!.text, groups[j]!.text);
          if (score > bestScore) {
            bestScore = score;
            bestI = i;
            bestJ = j;
          }
        }
      }
      groups[bestI]!.flowIndices.push(...groups[bestJ]!.flowIndices);
      groups[bestI]!.text += ' ' + groups[bestJ]!.text;
      groups.splice(bestJ, 1);
    }

    for (const group of groups) {
      const groupFlows = group.flowIndices.map((fi) => flows[fi]);
      const primaryName = groupFlows[0]?.name ?? 'View';
      const allGroupSteps = group.flowIndices.flatMap((fi: number) => {
        const flow = flows[fi];
        return (flow?.steps ?? []).map((s: any, si: number) => ({
          step: s,
          flow,
          flowIdx: fi,
          stepIdx: si,
        }));
      });
      const stepsText = allGroupSteps
        .map((s: any) => `${s.step?.action ?? ''} ${s.step?.result ?? ''}`)
        .join(' ');
      views.push({
        name:
          groupFlows.length === 1
            ? primaryName
            : `${primaryName} & Related`,
        description: allGroupSteps
          .map((s: any) => s.step?.result ?? '')
          .filter(Boolean)
          .join('. ')
          .slice(0, 150) || primaryName,
        icon: inferViewIconV2(primaryName, stepsText),
        flowSteps: allGroupSteps,
        linkedJobs: [],
        flowNames: groupFlows.map((f: any) => f?.name ?? 'Flow'),
      });
    }
  }

  // ── Step 2: Assign jobs to views via semantic matching ──
  for (const job of jobs) {
    if (views.some((v) => v.linkedJobs.includes(job))) continue;
    const jobText =
      `${job?.description ?? ''} ${job?.trigger ?? ''} ${job?.success_outcome ?? ''}`.toLowerCase();
    let bestMatch = -1;
    let bestScore = 0;

    for (let vi = 0; vi < views.length; vi++) {
      const viewText = [
        ...views[vi]!.flowNames,
        views[vi]!.description,
        ...views[vi]!.flowSteps.map(
          (s) => `${s.step?.action ?? ''} ${s.step?.result ?? ''}`,
        ),
      ]
        .join(' ')
        .toLowerCase();
      const score = calculateWordOverlapV2(jobText, viewText);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = vi;
      }
    }

    if (bestMatch >= 0) {
      views[bestMatch]!.linkedJobs.push(job);
    } else if (views.length > 0) {
      views[0]!.linkedJobs.push(job);
    }
  }

  // ── Step 3: Generate the complete output ──
  let output = '';
  const viewCount = views.length;
  const navType =
    features.hasWizard || features.appType === 'wizard'
      ? 'wizard'
      : viewCount <= 4
        ? 'tabs'
        : 'sidebar';

  // Navigation overview
  output += `## SCREENS OVERVIEW\n\n`;
  output += `This prototype has **${viewCount} screens** representing the complete user journey.\n`;
  output += `Navigation type: **${navType === 'wizard' ? 'Step-by-step wizard' : navType === 'tabs' ? 'Tab bar navigation' : 'Sidebar navigation'}**\n\n`;

  output += `| # | Screen Name | Purpose | Jobs | Steps |\n`;
  output += `|---|-------------|---------|------|-------|\n`;
  for (let i = 0; i < views.length; i++) {
    const v = views[i]!;
    output += `| ${i + 1} | ${v.icon} **${v.name}** | ${v.description.slice(0, 60)} | ${v.linkedJobs.length} | ${v.flowSteps.length} |\n`;
  }
  output += '\n';

  // Navigation design
  if (navType === 'wizard') {
    output += `### Wizard Navigation\n\n`;
    output += `Display a **horizontal progress bar** at the top of every screen showing all ${viewCount} steps.\n`;
    output += `- Active step: Filled circle (${theme.primary}) with step number, bold label\n`;
    output += `- Completed steps: Green checkmark icon, clickable to navigate back\n`;
    output += `- Upcoming steps: Gray circle, muted label, not clickable\n`;
    output += `- Connectors: Solid line between completed steps, dashed to upcoming\n`;
    output += `- Steps: ${views.map((v, i) => `${i + 1}. ${v.name}`).join(' → ')}\n\n`;
  } else if (navType === 'tabs') {
    output += `### Tab Bar Navigation\n\n`;
    output += `Display a **tab bar** at the ${viewCount <= 5 ? 'bottom' : 'top'} of every screen.\n`;
    output += `- Active tab: ${theme.primary} icon and label\n`;
    output += `- Inactive tab: Gray icon, no label (bottom) or muted label (top)\n`;
    output += `- Tabs: ${views.map((v) => `${v.icon} ${v.name}`).join(' | ')}\n`;
    output += `- Switching tabs uses a smooth slide animation\n\n`;
  } else {
    output += `### Sidebar Navigation\n\n`;
    output += `Fixed left sidebar (240px, ${theme.surface} background) with:\n`;
    output += `- ${appName} logo at top\n`;
    output += views.map((v) => `- ${v.icon} **${v.name}** ${v.flowSteps.length > 0 ? `(${v.flowSteps.length})` : ''}`).join('\n') + '\n';
    output += `- Active item: ${theme.primary} left border, bold text, light tint background\n`;
    output += `- Hover: Subtle background change\n\n`;
  }

  output += `---\n\n`;

  // ── Step 4: Render each screen ──
  for (let i = 0; i < views.length; i++) {
    output += renderDynamicViewV2(
      views[i]!,
      i + 1,
      viewCount,
      appName,
      theme,
      features,
      openQuestions,
      navType,
      i > 0 ? views[i - 1]!.name : null,
      i < views.length - 1 ? views[i + 1]!.name : null,
      cpm,
    );
  }

  // ── Step 5: Complete JTBD coverage ──
  if (jobs.length > 0) {
    output += `## JOBS TO BE DONE — COMPLETE COVERAGE\n\n`;
    output += `Every job from the PRD is addressed by at least one screen. Here is the complete mapping:\n\n`;

    for (let idx = 0; idx < jobs.length; idx++) {
      const job = jobs[idx];
      const viewIdx = views.findIndex((v) => v.linkedJobs.includes(job));
      const viewName =
        viewIdx >= 0
          ? `Screen ${viewIdx + 1}: ${views[viewIdx]!.name}`
          : 'Multiple screens';

      output += `### ${job?.job_id ?? `Job ${idx + 1}`} [${(job?.priority ?? 'should').toUpperCase()}]\n\n`;
      output += `**User Story:** ${job?.description ?? 'No description'}\n\n`;
      output += `**Trigger:** ${job?.trigger ?? 'User initiates action'}\n\n`;
      output += `**Success Outcome:** ${job?.success_outcome ?? 'Task completed'}\n\n`;
      output += `**Addressed In:** ${viewName}\n\n`;
      output += `**How It's Fulfilled:** When the user reaches this screen, they can perform the actions described in the flow steps. The UI provides clear feedback that the job's success outcome has been achieved — through visual confirmation, status changes, and/or progress indicators.\n\n`;
    }

    output += `---\n\n`;
  }

  return output;
}

// ─── Render a single screen ───
function renderDynamicViewV2(
  view: DynamicViewV2,
  viewNum: number,
  totalViews: number,
  appName: string,
  theme: any,
  _features: any,
  _openQuestions: any[],
  navType: string,
  prevView: string | null,
  nextView: string | null,
  cpm: any,
): string {
  const steps = view.flowSteps;
  const linkedJobs = view.linkedJobs;
  const allStepsText = steps
    .map((s) => `${s.step?.action ?? ''} ${s.step?.result ?? ''}`)
    .join(' ');

  // Determine unique component types for this screen
  const componentInfos = steps.map((s) => {
    const action = s.step?.action ?? '';
    const result = s.step?.result ?? '';
    return {
      action,
      result,
      actor: cleanActorName(s.step?.actor_id ?? ''),
      comp: inferStepComponentTypeV2(action, result),
    };
  });

  let out = '';

  // ─── Screen Header ───
  out += `## SCREEN ${viewNum}: ${view.name.toUpperCase()}\n\n`;
  out += `**Purpose:** ${view.description}\n\n`;

  if (view.flowNames.length > 1) {
    out += `**Flows covered:** ${view.flowNames.join(', ')}\n\n`;
  }

  // ─── Jobs This Screen Addresses ───
  if (linkedJobs.length > 0) {
    out += `### User Goals\n\n`;
    out += `This screen helps the user accomplish:\n\n`;
    for (const job of linkedJobs) {
      out += `- **${job?.description ?? 'User goal'}**\n`;
      out += `  - Triggered by: ${job?.trigger ?? 'user action'}\n`;
      out += `  - Success: ${job?.success_outcome ?? 'goal achieved'}\n\n`;
    }
  }

  // ─── Screen Layout ───
  out += `### Layout & Components\n\n`;
  out += `This is a ${theme.isDark ? 'dark' : 'light'}-themed screen with ${theme.background} background.\n\n`;

  // Header bar
  out += `**Header Bar:**\n`;
  out += `- Background: ${theme.surface}\n`;
  if (navType === 'wizard') {
    out += `- Left: ${prevView ? `"← Back" text button` : `${appName} logo`}\n`;
    out += `- Center: "${view.name}" title\n`;
    out += `- Below: Wizard progress bar showing step ${viewNum} of ${totalViews} active\n`;
  } else {
    out += `- Left: ${appName} logo/title\n`;
    out += `- Center: "${view.name}" screen title\n`;
    out += `- Right: Search, notifications, or settings icons\n`;
  }
  out += '\n';

  // Main content area — describe every component
  out += `**Main Content Area** (scrollable):\n\n`;

  const viewNameLower = view.name.toLowerCase();
  const isWizardScreen =
    /upload\s*prd|problem\s*statement|extracted\s*jobs|extracted\s*flows|summary/i.test(
      viewNameLower,
    );
  const jobsCount = cpm?.jobs?.length ?? 0;
  const flowsCount = cpm?.flows?.length ?? 0;
  const problem = cpm?.intent?.problem?.statement ?? '';
  const outcome = cpm?.intent?.goal?.primary_outcome ?? '';

  if (isWizardScreen && /upload\s*prd/i.test(viewNameLower)) {
    out += `**Upload PRD Screen (wizard step):**\n`;
    out += `- Status: "Uploaded" chip, below it "✓ File processed successfully" text\n`;
    out += `- Run selector: Two run IDs in format Run_YYYY_MM_DD_NNN (e.g. Run_2026_02_11_001, Run_2026_02_11_002). First marked "Current", second "Previous". Each in its own card/row.\n`;
    out += `- Extraction Results section (heading "Extraction Results"): List of items, each with bold title + description on same line:\n`;
    out += `  - "✓ **Problem & Outcome Extracted** - Successfully identified problem statement and desired outcomes"\n`;
    out += `  - "✓ **${jobsCount} Jobs to be Done Identified** - User jobs extracted and categorized by priority"\n`;
    out += `  - "✓ **${flowsCount} User Flows Detected** - Complete flow sequences with steps and actors"\n`;
    out += `- Metrics: Display in THREE SEPARATE cards. Do NOT concatenate. Card 1: value (e.g. 1,248) with "Total Views" label below (28px value, 12px label). Card 2: value "67%" with "Engagement" below. Card 3: value "89%" with "Completion" below.\n`;
    out += `- "View Details" button only (no Edit button)\n`;
    out += `- Fixed bottom-right: feedback widget "Done! How does this look?" with thumbs up, thumbs down, close (X) icons\n\n`;
  } else if (isWizardScreen && /summary/i.test(viewNameLower)) {
    out += `**Summary Screen (wizard step):**\n`;
    const problemText = (
      typeof problem === 'string' && problem.trim()
        ? problem.trim().slice(0, 300)
        : 'The product needs to address key user pain points and deliver measurable value.'
    ).replace(/"/g, "'");
    const outcomeText = (
      typeof outcome === 'string' && outcome.trim()
        ? outcome.trim().slice(0, 300)
        : 'Successful delivery of a well-designed prototype that meets stakeholder expectations.'
    ).replace(/"/g, "'");
    out += `- Problem Statement section: Heading "Problem Statement", then a readable text block (max-width ~640px, line-height 1.6) displaying: "${problemText}"\n`;
    out += `- Primary Outcome section: Heading "Primary Outcome", then a readable text block displaying: "${outcomeText}"\n`;
    out += `- Generate Prototype Outputs: Three green status chips side by side: "UI Screens Generated", "Data Flow Generated", "Architecture Generated". Below: "✓ All outputs generated successfully" text.\n`;
    out += `- Figma Make Prompt section: Heading "Figma Make Prompt", "Load Prompt" button.\n`;
    out += `- Mark as Aligned section: Instructional text, "Done! How does this look?" button.\n`;
    out += `- Fixed bottom-right: feedback widget with thumbs up, thumbs down, close (X) icons.\n`;
    out += `- Use typography scale: page title 24px max, section headings 18px, body 14px. Do not use oversized overlay text.\n\n`;
  } else if (isWizardScreen) {
    out += `**Wizard screen:** If this step shows extraction results, use Run_YYYY_MM_DD_NNN format for run IDs with Current/Previous labels. For metrics, display each value in a SEPARATE card (value 28px on top, label 12px below). Never concatenate metrics into one text block.\n\n`;
  }

  if (steps.length === 0 && linkedJobs.length > 0) {
    // No flow steps but has jobs — describe based on job content
    out += `This screen addresses the following user goals. Design appropriate UI components for each:\n\n`;
    for (let ji = 0; ji < linkedJobs.length; ji++) {
      const job = linkedJobs[ji];
      const descUi = toUserFacingCopy(job?.description ?? '', 80);
      out += `${ji + 1}. **${descUi || 'Feature'}**\n`;
      out += `   Design a component that helps the user: "${descUi || ''}". `;
      out += `The trigger is "${job?.trigger ?? 'user action'}" and success looks like "${job?.success_outcome ?? 'completed'}". `;
      out += `Use ${theme.primary} for primary actions and ${theme.surface} for card backgrounds.\n\n`;
    }
  } else {
    // Describe each component derived from flow steps
    // Track rendered components by both type AND action to avoid true duplicates
    // while still rendering distinct components of the same type
    const renderedKeys = new Set<string>();
    let compNum = 0;

    for (let i = 0; i < componentInfos.length; i++) {
      const info = componentInfos[i]!;
      const typeKey = info.comp.type;

      // Create a content-aware key to detect actual duplicates
      // Two "card" components with different actions are NOT duplicates
      const contentKey = `${typeKey}::${info.action.slice(0, 40).toLowerCase()}`;

      // Skip true duplicates (same type AND same action content)
      if (renderedKeys.has(contentKey)) continue;
      renderedKeys.add(contentKey);

      // For generic types like 'card' or 'generic', allow up to 3 per type
      // For specific types (metrics, chart, upload), show each unique one
      const typeCount = Array.from(renderedKeys).filter(k => k.startsWith(typeKey + '::')).length;
      if (typeCount > 3 && (typeKey === 'card' || typeKey === 'generic')) continue;

      compNum++;
      out += `${compNum}. `;
      out += describeComponent(
        info.action,
        info.result,
        typeKey,
        theme,
        allStepsText,
      );
      out += '\n\n';
    }
  }

  // Approval section — show on the screen whose steps mention approval/align/prototype approved
  const stepsReferenceApproval = allStepsText.match(/approv|mark\s*as\s*aligned|prototype\s*approved|frozen|locked|alignment/i);
  if (stepsReferenceApproval) {
    out += `**Approval & Alignment Section:**\n`;
    out += `Display a prominent section for finalizing and approving the work:\n`;
    out += `- **"Mark as Aligned"** button — when clicked, freezes the current work, preventing further edits. Shows a confirmation dialog explaining the work will be locked.\n`;
    out += `- **"Prototype Approved"** button — opens an approval dialog with a comment field and approver name. Once approved, shows a green banner with "✅ Approved by [Name]" and timestamp.\n`;
    out += `- **Status banner**: Shows the current state — "🔄 In Progress", "🔒 Aligned (Locked)", or "✅ Approved"\n`;
    out += `- Once approved, all edit actions on previous screens become read-only with a lock icon.\n\n`;
  }

  // Generate/Export section — show on the screen whose steps mention generate/copy/export/prompt
  const stepsReferenceGenerate = allStepsText.match(/generat|copy\s*to\s*clipboard|figma|prompt\s*text|export|load\s*button/i);
  if (stepsReferenceGenerate && !stepsReferenceApproval) {
    out += `**Generation & Export Section:**\n`;
    out += `Display a section for generating and exporting prototype outputs:\n`;
    out += `- **Summary card** at top showing the problem statement, primary outcome, and a count of jobs and flows\n`;
    out += `- **"Generate Prompt"** button (primary, prominent) — triggers the system to generate all outputs. Shows progress with status chips/checkmarks for each output type.\n`;
    out += `- **Output area**: A large text area showing the generated Figma Make prompt, with a "**Load**" button to populate it and a "**Copy to Clipboard**" button (shows "✅ Copied!" confirmation)\n`;
    out += `- The prompt text should be visible and editable before copying\n\n`;
  }

  // ─── Step-by-Step Interactions ───
  if (steps.length > 0) {
    out += `### Complete Interaction Flow\n\n`;
    out += `When the user arrives at this screen, the following interactions happen in sequence:\n\n`;

    for (let i = 0; i < steps.length; i++) {
      const s = steps[i]!;
      const actor = cleanActorName(s.step?.actor_id ?? '');
      const action = s.step?.action ?? 'Performs action';
      const result = s.step?.result ?? 'Action completed';
      const isSystem = actor.toLowerCase() === 'system';

      out += `**Step ${i + 1}.** `;
      if (isSystem) {
        out += `**System** automatically: ${action}\n`;
        out += `→ *Result:* ${result}\n`;
        out += `→ *Visual:* Show a loading indicator or progress animation while processing, then display the result with a smooth transition.\n`;
      } else {
        out += `**${actor}** performs: ${action}\n`;
        out += `→ *Result:* ${result}\n`;
        out += `→ *Visual:* The UI updates to reflect this action — relevant components highlight, data refreshes, or a new section appears. Provide clear visual feedback that the action was successful.\n`;
      }
      out += '\n';
    }
  }

  // ─── Navigation Footer ───
  out += `### Navigation\n\n`;

  if (navType === 'wizard') {
    out += `**Footer Action Bar** (fixed at bottom, ${theme.surface} background with top border):\n\n`;
    if (prevView) {
      out += `- **← Back** button (left side, outlined/ghost style) → navigates to "${prevView}"\n`;
    }
    if (nextView) {
      out += `- **Continue →** button (right side, ${theme.primary} background, white text, prominent) → navigates to "${nextView}"\n`;
      out += `- The Continue button starts **disabled** (50% opacity) and becomes active once the user has completed the key interactions on this screen\n`;
    } else {
      out += `- **Complete ✓** button (right side, ${theme.primary} background, white text) → finalizes the workflow\n`;
    }
    if (!prevView && !nextView) {
      out += `- **Done** button → closes the flow\n`;
    }
    out += '\n';
  } else {
    out += `Navigation is handled through the ${navType === 'tabs' ? 'tab bar' : 'sidebar'}. `;
    out += `The user can switch to any other screen at any time.\n\n`;
  }

  // ─── Screen States ───
  out += `### Screen States\n\n`;
  out += `- **Loading:** Show skeleton placeholder cards matching the layout described above. Use a subtle pulse animation.\n`;
  out += `- **Empty:** Show a centered illustration with a message like "No data yet" and a call-to-action button.\n`;
  out += `- **Active:** All components populated with data as described above.\n`;
  out += `- **Error:** Red error banner at top with "Something went wrong" message and a "Retry" button. Preserve any user input.\n`;
  if (navType === 'wizard') {
    out += `- **Complete:** Green checkmark appears on this step in the wizard progress bar. Continue button becomes active.\n`;
  }
  out += '\n';

  out += `---\n\n`;

  return out;
}

// ─── Re-export helper functions (same logic, different names to avoid conflicts) ───
function inferViewIconV2(name: string, stepsText: string): string {
  const t = `${name} ${stepsText}`.toLowerCase();
  if (/performance|analytics|metric|stat|dashboard|monitor/i.test(t)) return '📊';
  if (/recommend|suggest|action|tip|improvement|what.*to.*do/i.test(t)) return '💡';
  if (/learn|grow|motiv|progress|encourage|achievement|confidence/i.test(t)) return '🌱';
  if (/analyz|driver|factor|breakdown|insight|retention|why/i.test(t)) return '🔍';
  if (/upload|import|create|new|post|publish/i.test(t)) return '📤';
  if (/review|check|verify|confirm|approve/i.test(t)) return '✅';
  if (/setting|config|preference|profile/i.test(t)) return '⚙️';
  if (/search|find|discover|explore|browse/i.test(t)) return '🔎';
  if (/notif|alert|message|chat|communicate/i.test(t)) return '🔔';
  if (/video|media|content|play|watch|stream/i.test(t)) return '🎬';
  if (/user|profile|account|avatar/i.test(t)) return '👤';
  if (/home|overview|summary|feed/i.test(t)) return '🏠';
  if (/schedule|calendar|plan|time/i.test(t)) return '📅';
  if (/payment|billing|purchase|price/i.test(t)) return '💳';
  if (/job|requirement|goal|need/i.test(t)) return '🎯';
  if (/flow|step|sequence|path/i.test(t)) return '🔄';
  if (/generat|export|output|prompt/i.test(t)) return '🚀';
  return '📋';
}

function calculateWordOverlapV2(text1: string, text2: string): number {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'and',
    'or', 'but', 'not', 'no', 'so', 'if', 'as', 'it', 'its', 'i', 'my',
    'me', 'we', 'us', 'our', 'you', 'your', 'they', 'them', 'their',
    'this', 'that', 'do', 'does', 'did', 'have', 'has', 'had', 'can',
    'will', 'shall', 'may', 'could', 'would', 'should', 'need', 'user',
    'system', 'creator', 'actor', 'step', 'result', 'action',
  ]);
  const words1 = text1.split(/\W+/).filter((w) => w.length > 2 && !stopWords.has(w));
  const words2Set = new Set(
    text2.split(/\W+/).filter((w) => w.length > 2 && !stopWords.has(w)),
  );
  let overlap = 0;
  for (const word of words1) {
    if (words2Set.has(word)) overlap++;
  }
  return overlap;
}

function inferStepComponentTypeV2(
  action: string,
  result: string,
): { type: string; label: string } {
  const combined = `${action} ${result}`.toLowerCase();

  if (/metric|views?\b|watch\s*time|engagement|impression|reach|rate|analytics|kpi|stat(?:istic)?/i.test(combined)) {
    return { type: 'metrics', label: 'Key Metrics' };
  }
  if (/chart|graph|trend|retention|breakdown|distribut|over.*time|timeline|curve|hook\s*strength|audience/i.test(combined)) {
    return { type: 'chart', label: 'Analysis Chart' };
  }
  if (/recommend|suggest|tip|improvement|action.*item|what.*to.*do|next.*step/i.test(combined)) {
    return { type: 'list', label: 'Recommendations' };
  }
  if (/encourage|motivat|progress|growth|achievement|streak|milestone|celebrat|confident|reassur/i.test(combined)) {
    return { type: 'notification', label: 'Progress & Motivation' };
  }
  if (/select|choose|filter|switch|toggle|category|tab|option|dropdown|from\s+four/i.test(combined)) {
    return { type: 'selection', label: 'Selection Control' };
  }
  if (/save|apply|confirm|submit|approve|mark|accept|button\b/i.test(combined)) {
    return { type: 'action_button', label: 'Action' };
  }
  if (/upload|import|attach|drag.*drop|file.*pick|prd\s+file|document/i.test(combined)) {
    return { type: 'upload', label: 'File Upload' };
  }
  if (/video|image|photo|media|thumbnail|player|play|watch/i.test(combined)) {
    return { type: 'media', label: 'Media Display' };
  }
  if (/status|state|indicator|momentum|gaining|stalling|badge|chip|checkmark/i.test(combined)) {
    return { type: 'status', label: 'Status Indicator' };
  }
  if (/table|row|column|sort|list.*detail|comparison|reorder|arrow|up\s+arrow|down\s+arrow/i.test(combined)) {
    return { type: 'table', label: 'Data Table' };
  }
  if (/enter|type|write|edit|fill|input|compose|update|set|text\s*area|field/i.test(combined)) {
    return { type: 'form', label: 'Form Input' };
  }
  if (/open|review|display|show|check|understand|see|look|read|summar|card|list|appear|extract/i.test(combined)) {
    return { type: 'card', label: 'Content Display' };
  }
  return { type: 'generic', label: 'Interactive Element' };
}

// Export marker for splicing
// ============ END DYNAMIC VIEWS GENERATOR v2 ============



function generateClickableUiPrompt(cpm: any): string {
  const outcome = cpm?.intent?.goal?.primary_outcome ?? '';
  const problem = cpm?.intent?.problem?.statement ?? '';
  const jobs = cpm?.jobs ?? [];
  const appName = extractAppName(cpm);
  const features = detectStructuralFeatures(cpm);
  const theme = features.theme;

  // Build prompt header with detected theme
  let prompt = `# ${appName} - Interactive Prototype
Subtitle: ${outcome.slice(0, 100) || 'Application prototype based on PRD'}

## ABOUT THIS PROTOTYPE
This prototype visualizes the user experience defined in the PRD. Each screen represents a key user flow.

**Problem Being Solved:**
${problem.slice(0, 200) || 'See PRD for details'}

**Primary Outcome:**
${outcome.slice(0, 200) || 'See PRD for details'}

**App Type:** ${features.appType}
**Theme:** ${theme.name} - ${theme.description}
**Content Type:** ${features.contentType}
**Key Entities:** ${features.primaryEntities.slice(0, 5).join(', ') || 'Items'}
**Key Actions:** ${features.primaryActions.slice(0, 5).join(', ') || 'Create, Edit, View'}

---

## DESIGN SYSTEM (${theme.name.toUpperCase()} THEME)
- **Background**: ${theme.background} ${theme.isDark ? '(dark)' : '(light)'}
- **Surface/Cards**: ${theme.surface}
- **Primary Action**: ${theme.primary}
- **Secondary**: ${theme.secondary}
- **Text Primary**: ${theme.text}
- **Text Secondary**: ${theme.textSecondary}
- **Font**: Inter, system font
- **Corners**: 8px rounded
- **Icons**: Lucide icons, 20-24px
${theme.isDark ? '- **Style**: Dark mode with high contrast elements' : '- **Style**: Clean, light mode with subtle shadows'}

### Typography Scale (strict - do not exceed)
- **Page title**: 24px semibold, never larger. Do not use oversized decorative or overlay text.
- **Section heading**: 18px semibold
- **Subsection**: 14px semibold
- **Body**: 14px regular, line-height 1.5
- **Label/caption**: 12px, muted color
- **Metric value**: 28px bold maximum, in its own container. One value per card.
- **Metric label**: 12px below value
- **Rule**: All text must fit within its container. No text overflow or concatenation.
- **UI Copy**: Never show "As a X, I can Y" (Jobs to be Done) in the UI. All on-screen text must be conversational, second-person copy that feels like a real app (e.g., "Play your workouts at your pace" instead of "As a user I can play workout videos at my own speed").

### METRICS LAYOUT (critical)
- **CRITICAL**: Each metric must be displayed in a SEPARATE card/container. Never concatenate multiple metric values into a single text block.
- **Metric layout**: One number per card. Value on top (28px bold), label below (12px).
- **Example**: Card 1 shows "1,248" with "Total Views" below; Card 2 shows "67%" with "Engagement" below; Card 3 shows "89%" with "Completion" below.
- Display in separate cards. Value 28px. Label 12px. Do not merge values.

---

`;

  // For finance/enterprise apps use specialized UI generators
  if (features.isFinanceApp) {
    prompt += generateEnterpriseScreen(cpm, features, theme, appName);
    // Add JTBD reference for enterprise
    if (jobs.length > 0) {
      prompt += `## REFERENCE: JOBS TO BE DONE

${jobs.map((job: any, idx: number) => `**Job ${idx + 1}: ${job?.job_id || 'Job'}** (${job?.priority || 'should'})
- ${job?.description?.slice(0, 120) || 'No description'}
- Trigger: ${job?.trigger?.slice(0, 80) || 'User action'}
- Success: ${job?.success_outcome?.slice(0, 80) || 'Task completed'}
`).join('\n')}
---

`;
    }
  } else if (!features.isFinanceApp && (features.hasAppStyleSteps || features.isStrategyDoc || features.hasMusic)) {
    // Consumer/app-style documents get the mobile app UI (Home, Search, Library, flow-based screens)
    prompt += generateMobileAppUI(cpm, features, theme, appName);
  } else {
    // For all other apps: build dynamic views from actual PRD flows and jobs
    // Views are derived from flow names, components from step content, jobs mapped semantically
    // Nothing is hardcoded — the output reflects the PRODUCT described in the PRD
    prompt += buildDynamicViewsV2(cpm, appName, features, theme);
  }

  // Comprehensive interactivity and design specifications
  prompt += `## INTERACTIVITY SPECIFICATIONS

### Button States
| Button Type | Default | Hover | Active | Loading | Disabled |
|-------------|---------|-------|--------|---------|----------|
| Primary | ${theme.primary} fill, white text | 10% darker | Scale 98% | Spinner + text | 50% opacity |
| Secondary | White, ${theme.primary} border | Light tint | Scale 98% | Spinner + text | 50% opacity |
| Danger | Red (#EF4444) fill | Darker red | Scale 98% | Spinner | 50% opacity |
| Ghost | Transparent | Light gray bg | - | - | 50% opacity |

### Form Input States
| State | Border | Background | Indicator |
|-------|--------|------------|-----------|
| Default | #D1D5DB | White | None |
| Focus | ${theme.primary} 2px | White | None |
| Valid | #10B981 | White | ✓ checkmark |
| Error | #EF4444 | #FEF2F2 | ✕ + message |
| Disabled | #E5E7EB | #F9FAFB | None |

### Animations & Transitions
- **Screen transitions**: Fade + slide (200ms ease-out)
- **Modal open/close**: Fade overlay + scale modal (150ms)
- **Card add**: Slide down + fade in (200ms)
- **Card remove**: Fade out + collapse (200ms)
- **Loading states**: Pulse animation or spinner
- **Success feedback**: Brief scale up + checkmark (300ms)
- **Error shake**: Horizontal shake (200ms)
- **Auto-save**: Subtle "Saved" text fade in/out

### Toast Notifications
- **Position**: Top-right corner, 16px from edges
- **Duration**: Success (3s), Error (5s or manual dismiss)
- **Variants**: Success (green), Error (red), Warning (amber), Info (blue)
- **Animation**: Slide in from right, slide out on dismiss

### Keyboard Navigation
- **Tab**: Move between interactive elements
- **Enter**: Activate focused button / submit form
- **Escape**: Close modal/dialog, cancel action
- **Arrow keys**: Navigate dropdowns, reorder items
- **Ctrl/Cmd + S**: Save current form

## RESPONSIVE BREAKPOINTS
| Breakpoint | Layout |
|------------|--------|
| **Desktop (≥1280px)** | Full sidebar (240px) + main content |
| **Laptop (1024-1279px)** | Narrower sidebar (200px) |
| **Tablet (768-1023px)** | Collapsible sidebar, stacked forms |
| **Mobile (<768px)** | Bottom nav bar, single column, full-width cards |

### Mobile Patterns
- Touch targets: Minimum 44x44px
- Bottom action bar for primary actions
- Swipe gestures for card actions
- Pull-to-refresh on list views

## COMPONENT LIBRARY
| Component | Variants | Key Behavior |
|-----------|----------|--------------|
| **Button** | Primary, Secondary, Danger, Ghost | Hover, active, loading, disabled states |
| **Text Input** | Single line, with icon, with counter | Focus ring, validation, auto-save |
| **Textarea** | Resizable, with counter | Auto-save, character limit |
| **Dropdown** | Single select, with search | Arrow key navigation, type-to-filter |
| **File Upload** | Drag-drop zone, button | Progress bar, success/error states |
| **Card** | Standard, Editable, Expandable | Hover shadow, inline edit, reorder |
| **Table** | Sortable, with row actions | Column sort, row hover, ↑↓✕ controls |
| **Dialog/Modal** | Confirmation, Form, Alert | Overlay, scale animation, ESC to close |
| **Status Chip** | Colored badge | Green/amber/red/gray variants |
| **Progress Bar** | Step indicator, percentage | Animated fill, step clickable |
| **Toast** | Success, Error, Warning, Info | Auto-dismiss, manual dismiss |
`;

  return prompt;
}

function generateDataFlowPrompt(cpm: any): string {
  const outcome = cpm?.intent?.goal?.primary_outcome ?? '';
  const flows = cpm?.flows ?? [];
  const appName = extractAppName(cpm);
  const features = detectStructuralFeatures(cpm);

  // Extract data entities intelligently from flows
  const inputSources: string[] = [];
  const processingSteps: string[] = [];
  const storageComponents: string[] = [];
  const outputTargets: string[] = [];

  flows.forEach((flow: any) => {
    (flow.steps ?? []).forEach((step: any) => {
      const action = (step.action ?? '').toLowerCase();
      const result = (step.result ?? step.action ?? '').slice(0, 30);
      
      if (action.match(/upload|import|receive|input|fetch|ingest|connect|source|select.*file/) && inputSources.length < 4) {
        inputSources.push(result);
      }
      if (action.match(/process|transform|validate|calculate|match|reconcile|analyze|extract|parse|review/) && processingSteps.length < 4) {
        processingSteps.push(result);
      }
      if (action.match(/store|save|cache|database|persist|record|create.*run/) && storageComponents.length < 4) {
        storageComponents.push(result);
      }
      if (action.match(/export|send|display|report|output|deliver|notify|generate|copy|download/) && outputTargets.length < 4) {
        outputTargets.push(result);
      }
    });
  });

  // Smart defaults based on detected features (not hardcoded domains)
  if (inputSources.length === 0) {
    inputSources.push('User Input');
    if (features.hasFileUpload) inputSources.push('File Upload');
    if (features.hasForm) inputSources.push('Form Data');
    inputSources.push('API Request');
  }
  if (processingSteps.length === 0) {
    processingSteps.push('Validation');
    if (features.hasReview) processingSteps.push('Content Extraction');
    processingSteps.push('Business Logic');
    if (features.hasGeneration) processingSteps.push('Generation');
  }
  if (storageComponents.length === 0) {
    storageComponents.push('Database');
    storageComponents.push('File Storage');
    storageComponents.push('Cache');
  }
  if (outputTargets.length === 0) {
    outputTargets.push('UI Display');
    if (features.hasGeneration) outputTargets.push('Generated Output');
    outputTargets.push('Notifications');
    outputTargets.push('Export');
  }

  // Pad arrays to same length
  const maxLen = Math.max(inputSources.length, processingSteps.length, storageComponents.length, outputTargets.length, 4);
  while (inputSources.length < maxLen) inputSources.push('');
  while (processingSteps.length < maxLen) processingSteps.push('');
  while (storageComponents.length < maxLen) storageComponents.push('');
  while (outputTargets.length < maxLen) outputTargets.push('');

  return `# ${appName} - Data Flow Diagram

## Context
${outcome.slice(0, 200) || 'System data flow showing how information moves through the platform'}

---

## DIAGRAM LAYOUT: 4 Columns (LEFT → RIGHT)
Create a horizontal flow diagram with 4 distinct columns, connected by arrows.

### Column 1: INPUT SOURCES (Blue #3B82F6)
Shape: Rounded rectangles with blue fill
${inputSources.filter(Boolean).map((s, i) => `${i + 1}. ${s}`).join('\n')}

### Column 2: PROCESSING (Amber #F59E0B)
Shape: Hexagons or rounded rectangles with amber fill
${processingSteps.filter(Boolean).map((s, i) => `${i + 1}. ${s}`).join('\n')}

### Column 3: STORAGE (Green #10B981)
Shape: Cylinders (database symbols) with green fill
${storageComponents.filter(Boolean).map((s, i) => `${i + 1}. ${s}`).join('\n')}

### Column 4: OUTPUT (Purple #8B5CF6)
Shape: Rounded rectangles with purple fill
${outputTargets.filter(Boolean).map((s, i) => `${i + 1}. ${s}`).join('\n')}

---

## CONNECTIONS (Arrows)
- Color: Gray #6B7280
- Solid lines: Synchronous data flow
- Dashed lines: Asynchronous/event-driven flow
- Arrow direction: Always LEFT → RIGHT

### Primary Flows
${flows.slice(0, 4).map((f: any, idx: number) => `${idx + 1}. **${f.name || `Flow ${idx + 1}`}**: ${inputSources[idx] || 'Input'} → ${processingSteps[idx] || 'Process'} → ${storageComponents[idx] || 'Store'} → ${outputTargets[idx] || 'Output'}`).join('\n')}

---

## DATA ENTITIES
${features.primaryEntities.length > 0 ? features.primaryEntities.map((e, i) => `${i + 1}. ${e}`).join('\n') : 'Data entities as defined in PRD'}

## VISUAL STYLE
- Background: White or very light gray (#F9FAFB)
- Column headers: Bold labels above each column
- Component labels: Inside shapes, white text on dark backgrounds
- Arrows: Include small labels for data type (e.g., "JSON", "Events", "Queries")
- Legend: Bottom right showing shape meanings
`;
}

function generateArchitecturePrompt(cpm: any): string {
  const outcome = cpm?.intent?.goal?.primary_outcome ?? '';
  const flows = cpm?.flows ?? [];
  const appName = extractAppName(cpm);
  const features = detectStructuralFeatures(cpm);

  // Build components from flows
  const presentationComponents: string[] = [];
  const applicationComponents: string[] = [];
  const dataComponents: string[] = [];

  flows.slice(0, 4).forEach((flow: any) => {
    const flowName = flow.name?.slice(0, 20) || 'Workflow';
    if (presentationComponents.length < 4) presentationComponents.push(`${flowName} View`);
    if (applicationComponents.length < 4) applicationComponents.push(`${flowName} Service`);
  });

  // Smart defaults based on detected features
  if (presentationComponents.length < 2) {
    if (features.hasWizard) presentationComponents.push('Wizard UI', 'Progress View');
    if (features.hasForm) presentationComponents.push('Form Editor');
    if (features.hasList) presentationComponents.push('List View');
    presentationComponents.push('Main UI');
  }
  if (applicationComponents.length < 2) {
    applicationComponents.push('API Gateway');
    if (features.hasFileUpload) applicationComponents.push('Upload Service');
    if (features.hasGeneration) applicationComponents.push('Generation Service');
    applicationComponents.push('Core Service');
  }
  if (dataComponents.length === 0) {
    dataComponents.push('Database');
    if (features.hasFileUpload) dataComponents.push('File Storage');
    dataComponents.push('Cache');
    dataComponents.push('Event Store');
  }

  return `# ${appName} - System Architecture

## Context
${outcome.slice(0, 200) || 'Layered system architecture showing component organization'}

---

## DIAGRAM LAYOUT: 4 Horizontal Layers (TOP → BOTTOM)
Create a layered architecture diagram with clear separation between tiers.

### LAYER 1: PRESENTATION TIER (Blue #3B82F6)
Position: TOP
Shape: Browser/window frames
Components:
${[...new Set(presentationComponents)].slice(0, 4).map((c, i) => `${i + 1}. ${c}`).join('\n')}

### LAYER 2: APPLICATION TIER (Green #10B981)
Position: MIDDLE-TOP
Shape: Rounded rectangles (services)
Components:
${[...new Set(applicationComponents)].slice(0, 4).map((c, i) => `${i + 1}. ${c}`).join('\n')}
Additional: API Gateway, Auth Service, Event Bus

### LAYER 3: DATA TIER (Amber #F59E0B)
Position: MIDDLE-BOTTOM
Shape: Cylinders (databases), rectangles (other storage)
Components:
${[...new Set(dataComponents)].slice(0, 4).map((c, i) => `${i + 1}. ${c}`).join('\n')}

### LAYER 4: EXTERNAL INTEGRATIONS (Purple #8B5CF6)
Position: BOTTOM
Shape: Cloud icons or hexagons
Components:
${features.externalSystems.slice(0, 4).map((s, i) => `${i + 1}. ${s}`).join('\n')}
${features.externalSystems.length < 3 ? '3. SSO Provider\n4. Notification Service' : ''}

---

## CONNECTIONS

### Vertical Flows (between layers)
- Solid arrows: Synchronous API calls (REST/gRPC)
- Dashed arrows: Asynchronous events/messages
- Direction: Primarily TOP → BOTTOM, with callbacks going up

### Horizontal Flows (within layers)
- Thin lines: Internal communication
- Show event bus connections in Application tier

---

## VISUAL STYLE
- Background: White or very light gray (#F9FAFB)
- Layer backgrounds: Very light tint of layer color
- Labels: Inside shapes, clear readable font
- Layer headers: Bold labels on left side
- Spacing: Clear separation between layers (40-60px)
- Legend: Bottom showing shape meanings
`;
}

function generateHybridBundlePrompt(cpm: any): string {
  const outcome = cpm?.intent?.goal?.primary_outcome ?? '';
  const problem = cpm?.intent?.problem?.statement ?? '';
  const flows = cpm?.flows ?? [];
  const appName = extractAppName(cpm);
  const features = detectStructuralFeatures(cpm);

  // Build data flow components from actual flows
  const inputSources: string[] = [];
  const processingSteps: string[] = [];
  const storageComponents: string[] = [];
  const outputTargets: string[] = [];

  flows.forEach((flow: any) => {
    (flow.steps ?? []).forEach((step: any) => {
      const action = (step.action ?? '').toLowerCase();
      const result = (step.result ?? step.action ?? '').slice(0, 25);
      
      if (action.match(/upload|import|receive|input|fetch|select.*file/) && inputSources.length < 4) {
        inputSources.push(result);
      }
      if (action.match(/process|transform|validate|extract|parse|review/) && processingSteps.length < 4) {
        processingSteps.push(result);
      }
      if (action.match(/store|save|cache|persist|create.*run/) && storageComponents.length < 4) {
        storageComponents.push(result);
      }
      if (action.match(/export|display|generate|copy|output/) && outputTargets.length < 4) {
        outputTargets.push(result);
      }
    });
  });

  // Defaults based on features
  if (inputSources.length === 0) inputSources.push('User Input', 'File Upload', 'API Request', 'Form Data');
  if (processingSteps.length === 0) processingSteps.push('Validation', 'Processing', 'Business Logic', 'Generation');
  if (storageComponents.length === 0) storageComponents.push('Database', 'File Storage', 'Cache', 'Event Log');
  if (outputTargets.length === 0) outputTargets.push('UI Display', 'Generated Output', 'Export', 'Notifications');

  let prompt = `# ${appName} - Comprehensive Prototype Bundle
Subtitle: ${outcome.slice(0, 100) || 'Application prototype based on PRD'}

This prototype includes THREE tabs:
1. **UI Prototype** - Interactive screens based on user flows from PRD
2. **Data Flow Diagram** - How data moves through the system
3. **Architecture Diagram** - System component organization

---

# TAB 1: UI PROTOTYPE

## ABOUT
**Problem:** ${problem.slice(0, 150) || 'See PRD'}
**Outcome:** ${outcome.slice(0, 150) || 'See PRD'}
**App Type:** ${features.appType}

## DESIGN TOKENS
- Background: #FFFFFF or #F9FAFB
- Cards: White with shadow
- Primary: #3B82F6 (blue)
- Success: #10B981 (green)
- Text: #111827, #6B7280

---

${features.isFinanceApp ? generateEnterpriseScreen(cpm, features, features.theme, appName) : (!features.isFinanceApp && (features.hasAppStyleSteps || features.isStrategyDoc || features.hasMusic)) ? generateMobileAppUI(cpm, features, features.theme, appName) : buildDynamicViewsV2(cpm, appName, features, features.theme)}

# TAB 2: DATA FLOW DIAGRAM

## Layout: 4 Columns (LEFT → RIGHT)

### Column 1: INPUT (Blue #3B82F6)
${inputSources.slice(0, 4).map((s, i) => `${i + 1}. ${s}`).join('\n')}

### Column 2: PROCESSING (Amber #F59E0B)
${processingSteps.slice(0, 4).map((s, i) => `${i + 1}. ${s}`).join('\n')}

### Column 3: STORAGE (Green #10B981)
${storageComponents.slice(0, 4).map((s, i) => `${i + 1}. ${s}`).join('\n')}

### Column 4: OUTPUT (Purple #8B5CF6)
${outputTargets.slice(0, 4).map((s, i) => `${i + 1}. ${s}`).join('\n')}

### Arrows
- Gray lines connecting columns left to right
- Solid = synchronous, Dashed = async

---

# TAB 3: ARCHITECTURE DIAGRAM

## Layout: 4 Layers (TOP → BOTTOM)

### Layer 1: PRESENTATION (Blue)
${flows.slice(0, 3).map((f: any) => `${f?.name || 'View'} UI`).join(', ')}, Admin

### Layer 2: APPLICATION (Green)
API Gateway, ${features.primaryActions.slice(0, 2).map(a => `${a} Service`).join(', ')}, Event Bus

### Layer 3: DATA (Amber)
${storageComponents.slice(0, 3).join(', ')}

### Layer 4: EXTERNAL (Purple)
${features.externalSystems.slice(0, 3).join(', ')}

### Connections
- Solid: Sync (REST/gRPC)
- Dashed: Async (events)

---

# DESIGN SYSTEM

## Colors
- Primary: #3B82F6 (Blue)
- Success: #10B981 (Green)
- Warning: #F59E0B (Amber)
- Error: #EF4444 (Red)
- Background: #FFFFFF, #F9FAFB
- Text: #111827, #6B7280

## Typography (strict - do not exceed)
- Font: Inter, system font
- Page title: 24px semibold, never larger. Do not use oversized decorative or overlay text.
- Section heading: 18px semibold
- Subsection: 14px semibold
- Body: 14px regular
- Label/caption: 12px, muted color
- Metric value: 28px bold maximum, in its own container
- Metric label: 12px below value
- Rule: All text must fit within its container. No text overflow or concatenation.

## METRICS LAYOUT (critical)
- CRITICAL: Each metric must be displayed in a SEPARATE card/container. Never concatenate multiple metric values into a single text block.
- Metric layout: One number per card. Value on top (28px bold), label below (12px).
- Example: Card 1 shows "1,248" with "Total Views" below; Card 2 shows "67%" with "Engagement" below; Card 3 shows "89%" with "Completion" below.

## Components
- Cards: 8px rounded, shadow on hover
- Buttons: Primary (filled), Secondary (outline)
- Inputs: Border, focus state with blue outline
- Progress: Step indicators, progress bars
`;

  return prompt;
}

/**
 * Generate an output document that mirrors the original PRD structure,
 * incorporating all changes, resolved comments, and the full decision trail.
 * Compares the final reviewed CPM against the raw extracted CPM to highlight changes.
 */
function generateOutputDocument(
  cpm: any,
  cpmRaw: any | null,
  sectionMap: any | null,
  runId: string
): string {
  const now = new Date().toISOString();
  const documentName = cpm?.meta?.source?.document_name ?? 'PRD';
  const decisionLog: Array<{ question: string; answer: string; resolved_at: string; resolved_by: string }> = cpm?.review?.decision_log ?? [];
  const openQuestions: string[] = cpm?.review?.open_questions ?? [];
  const jobs = cpm?.jobs ?? [];
  const flows = cpm?.flows ?? [];
  const rawJobs = cpmRaw?.jobs ?? [];
  const rawFlows = cpmRaw?.flows ?? [];
  const isAligned = cpm?.review?.review_required === false;
  const prototypApproval = decisionLog.find((e: any) => e.question === '✅ PROTOTYPE APPROVED');

  let doc = '';

  // ===== HEADER =====
  doc += `${'='.repeat(80)}\n`;
  doc += `REVIEWED OUTPUT DOCUMENT\n`;
  doc += `${'='.repeat(80)}\n\n`;
  doc += `Source Document:   ${documentName}\n`;
  doc += `Run ID:            ${runId}\n`;
  doc += `Generated:         ${formatTimestamp(now)}\n`;
  doc += `Status:            ${isAligned ? '✅ ALIGNED' : '⚠️  IN REVIEW'}`;
  if (prototypApproval) {
    doc += ` | PROTOTYPE APPROVED by ${prototypApproval.resolved_by} on ${formatTimestamp(prototypApproval.resolved_at)}`;
  }
  doc += `\n`;
  doc += `Classification:    ${cpm?.classification?.initiative_type ?? 'unknown'} (${cpm?.classification?.confidence ?? 'unknown'} confidence)\n`;
  doc += `Prototype Type:    ${(cpm?.prototype?.strategy?.recommended_type ?? 'clickable_ui').replace(/_/g, ' ')}\n`;
  doc += `\n${'─'.repeat(80)}\n\n`;

  // ===== EXECUTIVE SUMMARY OF CHANGES =====
  doc += `## CHANGE SUMMARY\n\n`;

  const jobsAdded = jobs.filter((j: any) => !rawJobs.some((rj: any) => rj.job_id === j.job_id));
  const jobsRemoved = rawJobs.filter((rj: any) => !jobs.some((j: any) => j.job_id === rj.job_id));
  const jobsModified = jobs.filter((j: any) => {
    const original = rawJobs.find((rj: any) => rj.job_id === j.job_id);
    return original && (original.description !== j.description || original.trigger !== j.trigger || original.success_outcome !== j.success_outcome || original.priority !== j.priority);
  });

  const flowsAdded = flows.filter((f: any) => !rawFlows.some((rf: any) => rf.flow_id === f.flow_id));
  const flowsRemoved = rawFlows.filter((rf: any) => !flows.some((f: any) => f.flow_id === rf.flow_id));
  const flowsModified = flows.filter((f: any) => {
    const original = rawFlows.find((rf: any) => rf.flow_id === f.flow_id);
    if (!original) return false;
    return original.name !== f.name || 
      JSON.stringify(original.steps) !== JSON.stringify(f.steps) ||
      JSON.stringify(original.actors) !== JSON.stringify(f.actors);
  });

  // Problem/outcome changes
  const problemChanged = cpmRaw && (cpmRaw?.intent?.problem?.statement !== cpm?.intent?.problem?.statement);
  const outcomeChanged = cpmRaw && (cpmRaw?.intent?.goal?.primary_outcome !== cpm?.intent?.goal?.primary_outcome);

  const totalChanges = (problemChanged ? 1 : 0) + (outcomeChanged ? 1 : 0) + 
    jobsAdded.length + jobsRemoved.length + jobsModified.length + 
    flowsAdded.length + flowsRemoved.length + flowsModified.length;

  if (totalChanges === 0 && decisionLog.length === 0) {
    doc += `No changes made during review.\n\n`;
  } else {
    if (problemChanged) doc += `  • Problem statement was updated during review\n`;
    if (outcomeChanged) doc += `  • Primary outcome was updated during review\n`;
    if (jobsAdded.length > 0) doc += `  • ${jobsAdded.length} job(s) added\n`;
    if (jobsRemoved.length > 0) doc += `  • ${jobsRemoved.length} job(s) removed\n`;
    if (jobsModified.length > 0) doc += `  • ${jobsModified.length} job(s) modified\n`;
    if (flowsAdded.length > 0) doc += `  • ${flowsAdded.length} flow(s) added\n`;
    if (flowsRemoved.length > 0) doc += `  • ${flowsRemoved.length} flow(s) removed\n`;
    if (flowsModified.length > 0) doc += `  • ${flowsModified.length} flow(s) modified\n`;
    if (decisionLog.length > 0) doc += `  • ${decisionLog.length} decision(s) recorded\n`;
    doc += `\n`;
  }

  doc += `${'─'.repeat(80)}\n\n`;

  // ===== SECTION 1: INTENT & CLASSIFICATION =====
  doc += `## 1. INTENT & CLASSIFICATION\n\n`;

  doc += `### Problem Statement\n`;
  if (problemChanged) {
    doc += `  [CHANGED] Original:\n`;
    doc += `    ${(cpmRaw?.intent?.problem?.statement ?? '').slice(0, 300)}\n`;
    doc += `  [UPDATED TO]:\n`;
  }
  doc += `    ${(cpm?.intent?.problem?.statement ?? 'Not defined').slice(0, 500)}\n\n`;

  doc += `### Primary Outcome\n`;
  if (outcomeChanged) {
    doc += `  [CHANGED] Original:\n`;
    doc += `    ${(cpmRaw?.intent?.goal?.primary_outcome ?? '').slice(0, 300)}\n`;
    doc += `  [UPDATED TO]:\n`;
  }
  doc += `    ${(cpm?.intent?.goal?.primary_outcome ?? 'Not defined').slice(0, 500)}\n\n`;

  doc += `### Scope\n`;
  doc += `  In Scope:\n`;
  for (const item of cpm?.intent?.scope?.in_scope ?? []) {
    doc += `    • ${item}\n`;
  }
  doc += `  Out of Scope:\n`;
  for (const item of cpm?.intent?.scope?.out_of_scope ?? []) {
    doc += `    • ${item}\n`;
  }
  doc += `\n`;

  doc += `${'─'.repeat(80)}\n\n`;

  // ===== SECTION 2: JOBS TO BE DONE =====
  doc += `## 2. JOBS TO BE DONE (${jobs.length} total)\n\n`;

  for (const job of jobs) {
    const isNew = jobsAdded.some((j: any) => j.job_id === job.job_id);
    const isModified = jobsModified.some((j: any) => j.job_id === job.job_id);
    const changeTag = isNew ? ' [NEW]' : isModified ? ' [MODIFIED]' : '';
    const priorityTag = `[${(job.priority ?? 'should').toUpperCase()}]`;

    doc += `  ${priorityTag} ${job.job_id}${changeTag}\n`;
    doc += `    Description: ${job.description}\n`;
    doc += `    Trigger:     ${job.trigger}\n`;
    doc += `    Outcome:     ${job.success_outcome}\n`;

    if (isModified) {
      const original = rawJobs.find((rj: any) => rj.job_id === job.job_id);
      if (original) {
        doc += `    --- Original ---\n`;
        if (original.description !== job.description) doc += `    Description: ${original.description}\n`;
        if (original.trigger !== job.trigger) doc += `    Trigger:     ${original.trigger}\n`;
        if (original.success_outcome !== job.success_outcome) doc += `    Outcome:     ${original.success_outcome}\n`;
      }
    }
    doc += `\n`;
  }

  // Show removed jobs
  if (jobsRemoved.length > 0) {
    doc += `  --- REMOVED JOBS ---\n`;
    for (const job of jobsRemoved) {
      doc += `  [REMOVED] ${job.job_id}: ${job.description}\n`;
    }
    doc += `\n`;
  }

  doc += `${'─'.repeat(80)}\n\n`;

  // ===== SECTION 3: USER FLOWS =====
  doc += `## 3. USER FLOWS (${flows.length} total)\n\n`;

  for (const flow of flows) {
    const isNew = flowsAdded.some((f: any) => f.flow_id === flow.flow_id);
    const isModified = flowsModified.some((f: any) => f.flow_id === flow.flow_id);
    const changeTag = isNew ? ' [NEW]' : isModified ? ' [MODIFIED]' : '';

    doc += `  Flow: ${flow.name}${changeTag}\n`;
    doc += `    ID: ${flow.flow_id} | Type: ${flow.type} | Actors: ${(flow.actors ?? []).join(', ')}\n`;
    doc += `    Linked Jobs: ${(flow.linked_jobs ?? []).join(', ') || 'none'}\n`;
    doc += `    Steps:\n`;

    for (const step of flow.steps ?? []) {
      doc += `      ${step.step_id}: [${step.actor_id}] ${step.action}\n`;
      doc += `        → ${step.result}\n`;
    }

    if (isModified) {
      const original = rawFlows.find((rf: any) => rf.flow_id === flow.flow_id);
      if (original) {
        doc += `    --- Changes from original ---\n`;
        if (original.name !== flow.name) {
          doc += `    Name: "${original.name}" → "${flow.name}"\n`;
        }
        const origStepCount = (original.steps ?? []).length;
        const newStepCount = (flow.steps ?? []).length;
        if (origStepCount !== newStepCount) {
          doc += `    Steps: ${origStepCount} → ${newStepCount}\n`;
        }
      }
    }

    doc += `\n`;
  }

  // Show removed flows
  if (flowsRemoved.length > 0) {
    doc += `  --- REMOVED FLOWS ---\n`;
    for (const flow of flowsRemoved) {
      doc += `  [REMOVED] ${flow.flow_id}: ${flow.name}\n`;
    }
    doc += `\n`;
  }

  doc += `${'─'.repeat(80)}\n\n`;

  // ===== SECTION 4: ORIGINAL DOCUMENT SECTIONS =====
  if (sectionMap?.sections?.length > 0) {
    doc += `## 4. ORIGINAL DOCUMENT SECTIONS\n\n`;
    doc += `  The following sections were extracted from the source document.\n`;
    doc += `  Open questions raised during extraction have been resolved and are recorded in the Decision Log below.\n\n`;

    for (const section of sectionMap.sections) {
      if (!section.raw_text || section.raw_text.length === 0) continue;
      doc += `  ### ${section.section_title}\n`;
      // Indent and truncate long sections
      const lines = section.raw_text.split('\n');
      const displayLines = lines.slice(0, 30);
      for (const line of displayLines) {
        doc += `    ${line}\n`;
      }
      if (lines.length > 30) {
        doc += `    ... (${lines.length - 30} more lines)\n`;
      }
      doc += `\n`;
    }
    doc += `${'─'.repeat(80)}\n\n`;
  }

  // ===== SECTION 5: DECISION LOG (FULL AUDIT TRAIL) =====
  doc += `## ${sectionMap?.sections?.length > 0 ? '5' : '4'}. DECISION LOG & AUDIT TRAIL\n\n`;

  if (decisionLog.length === 0 && openQuestions.length === 0) {
    doc += `  No decisions recorded and no open questions.\n\n`;
  } else {
    if (decisionLog.length > 0) {
      doc += `  ### Resolved Decisions (${decisionLog.length})\n\n`;
      for (let i = 0; i < decisionLog.length; i++) {
        const entry = decisionLog[i]!;
        const isApproval = entry.question === '✅ PROTOTYPE APPROVED';
        doc += `  ${i + 1}. ${isApproval ? '🏁 ' : '✅ '}${entry.question}\n`;
        doc += `     Answer:      ${entry.answer}\n`;
        doc += `     Resolved by: ${entry.resolved_by}\n`;
        doc += `     Resolved at: ${formatTimestamp(entry.resolved_at)}\n`;
        doc += `\n`;
      }
    }

    if (openQuestions.length > 0) {
      doc += `  ### Unresolved Questions (${openQuestions.length})\n\n`;
      for (let i = 0; i < openQuestions.length; i++) {
        doc += `  ⚠️  ${i + 1}. ${openQuestions[i]}\n`;
      }
      doc += `\n`;
    }
  }

  doc += `${'─'.repeat(80)}\n\n`;

  // ===== SECTION 6: APPROVAL STATUS =====
  const sectionNum = sectionMap?.sections?.length > 0 ? '6' : '5';
  doc += `## ${sectionNum}. APPROVAL STATUS\n\n`;
  doc += `  Aligned:            ${isAligned ? 'Yes ✅' : 'No ⚠️'}\n`;
  doc += `  Open Questions:     ${openQuestions.length === 0 ? 'All resolved ✅' : `${openQuestions.length} remaining ⚠️`}\n`;
  doc += `  Decisions Recorded: ${decisionLog.length}\n`;
  if (prototypApproval) {
    doc += `  Prototype Approved: Yes ✅\n`;
    doc += `    Approved by:      ${prototypApproval.resolved_by}\n`;
    doc += `    Approved at:      ${formatTimestamp(prototypApproval.resolved_at)}\n`;
    doc += `    Comment:          ${prototypApproval.answer}\n`;
  } else {
    doc += `  Prototype Approved: Not yet\n`;
  }
  doc += `\n`;

  doc += `${'='.repeat(80)}\n`;
  doc += `END OF REVIEWED OUTPUT DOCUMENT\n`;
  doc += `${'='.repeat(80)}\n`;

  return doc;
}

function formatTimestamp(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    return isoString;
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
  const runDir = path.join(RUNS_DIR, runId);

  const cpmReviewedPath = path.join(runDir, 'cpmReviewed.json');
  const cpmRawPath = path.join(runDir, 'cpmRaw.json');
  const cpmFinalPath = path.join(runDir, 'cpmFinal.json');
  const sectionMapPath = path.join(runDir, 'sectionMap.json');

  // Try reviewed first, then raw
  let cpmPath = cpmReviewedPath;
  if (!(await fileExists(cpmReviewedPath))) {
    if (!(await fileExists(cpmRawPath))) {
      return NextResponse.json({ ok: false, message: 'No CPM file found, save first' }, { status: 400 });
    }
    cpmPath = cpmRawPath;
  }
  // If final exists, prefer it for the output document (has decision log + alignment status)
  if (await fileExists(cpmFinalPath)) {
    cpmPath = cpmFinalPath;
  }

  try {
    // Read the CPM
    const cpmText = await readFile(cpmPath, 'utf8');
    const cpm = JSON.parse(cpmText);

    // Read raw CPM for diff comparison
    let cpmRaw = null;
    if (await fileExists(cpmRawPath)) {
      try {
        cpmRaw = JSON.parse(await readFile(cpmRawPath, 'utf8'));
      } catch { /* ignore parse errors */ }
    }

    // Read section map for original document sections
    let sectionMap = null;
    if (await fileExists(sectionMapPath)) {
      try {
        sectionMap = JSON.parse(await readFile(sectionMapPath, 'utf8'));
      } catch { /* ignore parse errors */ }
    }

    const prototypeType = cpm?.prototype?.strategy?.recommended_type ?? 'clickable_ui';

    // Generate prototype plan
    const prototypePlan = {
      run_id: runId,
      generated_at: new Date().toISOString(),
      prototype_type: prototypeType,
      screens: cpm?.flows?.flatMap((flow: any) => 
        (flow.steps ?? []).map((step: any, idx: number) => ({
          screen_id: `screen_${flow.flow_id}_${idx + 1}`,
          name: step.result || `Step ${idx + 1}`,
          flow_id: flow.flow_id,
          step_index: idx,
        }))
      ) ?? [],
      jobs: cpm?.jobs ?? [],
    };

    const planPath = path.join(runDir, 'prototypePlan.json');
    await writeFile(planPath, JSON.stringify(prototypePlan, null, 2), 'utf8');

    // Generate appropriate Figma prompt based on prototype type
    let prompt: string;
    
    switch (prototypeType) {
      case 'data_flow_diagram':
        prompt = generateDataFlowPrompt(cpm);
        break;
      case 'architecture_diagram':
        prompt = generateArchitecturePrompt(cpm);
        break;
      case 'hybrid_bundle':
        prompt = generateHybridBundlePrompt(cpm);
        break;
      case 'clickable_ui':
      default:
        prompt = generateClickableUiPrompt(cpm);
        break;
    }

    const promptPath = path.join(runDir, 'figma_make_prompt.txt');
    await writeFile(promptPath, prompt, 'utf8');

    // Generate the output document (reviewed PRD with changes, decisions, and audit trail)
    const outputDoc = generateOutputDocument(cpm, cpmRaw, sectionMap, runId);
    const outputDocPath = path.join(runDir, 'reviewed_output.txt');
    await writeFile(outputDocPath, outputDoc, 'utf8');

    // Generate clickable HTML prototype — same fidelity as prompt, uses Design Components
    const features = detectStructuralFeatures(cpm);
    const protoTheme = features.theme;
    const url = new URL(req.url);
    const enrich = url.searchParams.get('enrich') === 'true' || process.env.RAPIDLY_PROTOTYPE_ENRICH === 'true';
    const designSystem = url.searchParams.get('designSystem') || undefined;
    let mockData = null;
    if (enrich) {
      try {
        mockData = await generatePrototypeMockData(cpm, true);
      } catch (e) {
        console.warn('[Rapidly] Prototype LLM enrichment failed, using deterministic fallback:', e);
      }
    }
    const prototypeHtml = generatePrototypeHtml(cpm, protoTheme, features, mockData, designSystem, { screenId: 0, viewport: 'web' });
    const prototypePath = path.join(runDir, 'prototype.html');
    await writeFile(prototypePath, prototypeHtml, 'utf8');

    console.log(`[Rapidly] Generated ${prototypeType} prompt, output document, and HTML prototype for run ${runId}`);

    return NextResponse.json({
      ok: true,
      prototypeType,
      outputs: ['prototypePlan.json', 'figma_make_prompt.txt', 'reviewed_output.txt', 'prototype.html'],
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e.message }, { status: 500 });
  }
}
