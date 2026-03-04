/**
 * PRD Sectionizer - Parses a PRD document into structured sections
 */

export type SectionizedPrd = {
  document_name: string;
  document_type: 'prd';
  sections: Array<{
    section_id: string;
    section_title: string;
    raw_text: string;
    subsections: Array<{
      subsection_id: string;
      subsection_title: string;
      raw_text: string;
    }>;
  }>;
};

function normalizeTitleToId(title: string): string {
  const lowered = title.trim().toLowerCase();
  const cleaned = lowered
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const underscored = cleaned.replace(/\s/g, '_');
  return underscored.length > 0 ? underscored : 'untitled';
}

function normalizeLineForMatch(line: string): string {
  return line
    .trim()
    .toLowerCase()
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/\([^)]*\)/g, '') // Remove parenthetical content like "(JTBD)"
    .replace(/\[[^\]]*\]/g, '') // Remove bracketed content like "[template]"
    .replace(/[:.]\s*$/g, '')
    .replace(/\s*-\s*(?:wip|draft|todo|placeholder|tbd)\s*$/, '') // Remove status suffixes
    .replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]+\s*/u, '') // Strip leading emojis
    .replace(/\s*\[\d+\]$/, '') // Remove footnote references like [2] [3]
    .replace(/\s+/g, ' ')
    .trim();
}

const KNOWN_HEADINGS: string[] = [
  // Standard PRD sections
  'understand it',
  'think it',
  'problem opportunity',
  'problem/opportunity',
  'problem',
  'opportunity',
  'user problem',
  'business problem',
  'business/compliance problem',
  'financial impact',
  'current state',
  'goals',
  'benefits',
  'goals/benefits',
  'goals benefits',
  'objective',
  'key result',
  'key results',
  'metrics evaluation',
  'metrics',
  'success metrics',
  'key risks',
  'risks',
  'effort estimates',
  'effort estimate',
  'requirements',
  'high level design',
  'hld',
  'workflow',
  'workflows',
  // Product brief format sections
  'overview',
  'summary',
  'tl;dr',
  'tldr',
  'background',
  'proposed solution',
  'solution',
  'solution / user experience',
  'user experience',
  'phases',
  'cohorts',
  'migration strategy',
  'key decisions',
  'open questions',
  'risks & assumptions',
  'risks and assumptions',
  'out of scope',
  'in scope',
  'scope',
  'designs',
  'insights',
  'north star',
  'guardrail',
  'experience',
  'operational',
  'business',
  'why now',
  // Problem subsections that may appear as top-level
  'creators',
  'user problem',
  'business problem',
  // Solution sections
  'we will',
  'what we will do',
  'implementation',
  'delivery plan',
  // Outcome-focused sections
  'outcome',
  'outcomes',
  'why this matters',
  'why it matters',
  'impact',
  'value proposition',
  'value',
  'key benefits',
  // Jobs to be Done sections
  'jobs to be done',
  'jtbd',
  'jobs',
  'user jobs',
  'job stories',
  // User Flows sections
  'user flows',
  'user flow',
  'flows',
  'flow',
  'steps',
  'user journey',
  'user journeys',
  'happy path',
  'error path',
  'alternate path',
  // FinE lifecycle / process sections
  'summarize it',
  'understand it',
  'think it',
  'build it',
  'ship it',
  'tweak it',
  'stakeholders',
  'gate check',
  'effort estimate',
  'effort estimates',
  'high level design',
  'high level timeline',
  'execution plan',
  'delivery breakdown',
  'test plan',
  'launch checklist',
  'launch & support plan',
  'monitoring/support',
  'feedback collection',
  'post-launch evaluation',
  'improvement requests',
  'roi & tco',
  'resourcing & priority',
  'stakeholder signoff',
  'identification requirements',
  // Financial/ERP domain sections
  'terms & conditions',
  'terms and conditions',
  'onboarding',
  'data calculation',
  'data calculations',
  'tax management',
  'booking',
  'performance reporting',
  'payouts',
  'payout notes',
  'financial reporting',
  'data reports',
  'customer support',
  'customer support readiness',
  'sox compliance',
  'payout eligibility',
  'payment fraud',
  'reconciliation',
  // FR3 / Payouts requirement format
  'fr3',
  'bucket 1',
  'bucket 2',
  'bucket 3',
  'three lifecycle buckets',
  'before monetization',
  'before tax certification',
  'after first payout',
];

const SUBHEADINGS_BY_PARENT: Record<string, string[]> = {
  understand_it: [
    'problem opportunity',
    'problem/opportunity',
    'problem and opportunity',
    'problem',
    'opportunity',
    'user problem',
    'business problem',
    'business/compliance problem',
    'financial impact',
    'current state',
    'goals',
    'benefits',
    'goals/benefits',
    'goals benefits',
    'objective',
    'key result',
    'key results',
    'metrics evaluation',
    'metrics',
    'success metrics',
    'evaluation',
    'key risks',
    'risks',
    'effort estimates',
    'effort estimate',
    'open questions',
  ],
  think_it: [
    'requirements',
    'high level design',
    'hld',
    'workflow',
    'workflows',
    'timing',
    'high level timeline',
    'identification requirements',
    'stakeholder signoff',
    'open questions',
  ],
  // Product brief format - Overview section contains Problem
  overview: [
    'problem',
    'problem/opportunity',
    'creators',
    'business',
    'background',
    'why now',
  ],
  // Success Metrics section
  success_metrics: [
    'north star',
    'experience',
    'operational',
    'business',
    'cost',
    'guardrail',
  ],
  // Proposed Solution section
  proposed_solution: [
    'we will',
    'out of scope',
    'in scope',
  ],
  solution: [
    'we will',
    'out of scope',
    'in scope',
  ],
  // FinE lifecycle subheadings
  summarize_it: [
    'summary',
    'stakeholders',
  ],
  build_it: [
    'execution plan',
    'delivery breakdown',
    'test plan',
    'launch & support plan',
  ],
  ship_it: [
    'launch checklist',
    'monitoring/support',
    'feedback collection',
    'post-launch evaluation',
  ],
  // Financial/ERP domain subheadings
  performance_reporting: [
    'data reports',
    'payout notes',
    'financial reporting',
  ],
  payouts: [
    'payment batch creation',
    'payment operations',
    'payout threshold',
    'payout eligibility',
    'payment fraud',
    'hyperwallet',
  ],
};

function matchesKnownHeading(line: string): boolean {
  const n = normalizeLineForMatch(line);
  if (n.length === 0) return false;
  if (n.length > 80) return false;
  // Exact match
  if (KNOWN_HEADINGS.includes(n)) return true;
  // Prefix match for multi-word domain headings (e.g., "Payout Eligibility Checks in PSL" matches "payout eligibility")
  // Only match if: line is short, heading is multi-word (at least 10 chars), and line doesn't start with common words
  if (n.length <= 60 && !/^(?:the|all|a|an|self|each|every|this|that|when|if|for|it|we|they|our|my|metrics|results|data|status)\s/.test(n)) {
    return KNOWN_HEADINGS.some(h => h.length >= 10 && h.includes(' ') && n.startsWith(h + ' '));
  }
  return false;
}

function looksLikeFormattedHeading(line: string): boolean {
  const t = line.trim();
  if (t.length < 2) return false;
  if (t.length > 80) return false;

  const looksLikeMarkdown = t.startsWith('#') || t.startsWith('##') || t.startsWith('###');
  const looksLikeColonHeading = t.endsWith(':') && t.length <= 60 &&
    // Exclude known field labels that are NOT section headings
    !/^(?:Job\s*Description|Trigger|Success\s*Outcome|Success|Actor|Action|Result|Outcome|When|Who|What|Then|Expected|Responsible|Accountable|Consulted|Informed|Owner|Raiser|Notes?|Status|Description|Details|Created|Last\s*edited|Link\s*to)\s*:/i.test(t);
  // All-caps headings need to be at least 4 characters and look like words, not table identifiers
  // Exclude patterns like "A1", "B2", "PM", "C3" which are likely table row identifiers
  const looksLikeAllCaps = t.length >= 4 && t.length <= 60 && 
    /^[A-Z][A-Z0-9\s]+$/.test(t) && 
    /[A-Z]/.test(t) &&
    !/^[A-Z]\d+$/.test(t) && // Not like "A1", "B2"
    !/^[A-Z]{2}$/.test(t); // Not like "PM", "QA"
  const looksLikeNumbered = /^\d+(\.\d+)*\s+.+$/.test(t);
  const notJustBullet = !/^[-*•]\s+/.test(t);

  return (looksLikeMarkdown || looksLikeColonHeading || looksLikeAllCaps || looksLikeNumbered) && notJustBullet;
}

function isLikelyHeading(line: string): boolean {
  return looksLikeFormattedHeading(line) || matchesKnownHeading(line);
}

function stripHeadingMarkers(line: string): string {
  let t = line.trim();
  t = t.replace(/^#{1,6}\s+/, '');
  if (t.endsWith(':')) t = t.slice(0, -1).trim();
  return t.trim();
}

function splitIntoSubsections(
  parentSectionId: string,
  rawText: string
): Array<{
  subsection_id: string;
  subsection_title: string;
  raw_text: string;
}> {
  const maybeKeys = SUBHEADINGS_BY_PARENT[parentSectionId];
  if (!maybeKeys || maybeKeys.length === 0) return [];
  const keys: string[] = maybeKeys;

  const lines = rawText.replace(/\r\n/g, '\n').split('\n');

  type WorkingSub = { title: string; id: string; lines: string[] };
  const subs: WorkingSub[] = [];

  function isSubheadingLine(line: string): string | null {
    const n = normalizeLineForMatch(line);
    for (const k of keys) {
      if (n === k) return k;
    }
    return null;
  }

  function startSub(titleLine: string): void {
    const title = stripHeadingMarkers(titleLine);
    const idBase = normalizeTitleToId(title);
    let id = idBase;
    let counter = 2;
    while (subs.some(s => s.id === id)) {
      id = `${idBase}_${counter}`;
      counter += 1;
    }
    subs.push({ title, id, lines: [] });
  }

  for (const line of lines) {
    const match = isSubheadingLine(line);
    if (match) {
      startSub(line);
      continue;
    }
    if (subs.length === 0) {
      continue;
    }
    const lastSub = subs[subs.length - 1];
    if (lastSub) {
      lastSub.lines.push(line);
    }
  }

  return subs
    .map(s => ({
      subsection_id: s.id,
      subsection_title: s.title,
      raw_text: s.lines.join('\n').trim(),
    }))
    .filter(s => s.raw_text.length > 0);
}

export function sectionizePrd(prdContent: string, documentName: string): SectionizedPrd {
  const lines = prdContent.replace(/\r\n/g, '\n').split('\n');

  type WorkingSection = {
    title: string;
    id: string;
    lines: string[];
  };

  const sections: WorkingSection[] = [];
  let current: WorkingSection | null = null;

  function startSection(titleLine: string): void {
    const title = stripHeadingMarkers(titleLine);
    const idBase = normalizeTitleToId(title);

    let id = idBase;
    let counter = 2;
    while (sections.some(s => s.id === id) || (current && current.id === id)) {
      id = `${idBase}_${counter}`;
      counter += 1;
    }

    current = { title, id, lines: [] };
    sections.push(current);
  }

  function ensurePreambleSection(): void {
    if (sections.length === 0) {
      current = { title: 'Preamble', id: 'preamble', lines: [] };
      sections.push(current);
    }
  }

  for (const line of lines) {
    if (isLikelyHeading(line)) {
      startSection(line);
      continue;
    }

    ensurePreambleSection();
    current!.lines.push(line);
  }

  const out: SectionizedPrd = {
    document_name: documentName,
    document_type: 'prd',
    sections: sections.map(s => {
      const rawText = s.lines.join('\n').trim();

      const normalizedParentId = (() => {
        const n = normalizeTitleToId(s.title);
        if (n.startsWith('understand_it')) return 'understand_it';
        if (n.startsWith('think_it')) return 'think_it';
        return n;
      })();

      const subsections = splitIntoSubsections(normalizedParentId, rawText);

      return {
        section_id: s.id,
        section_title: s.title,
        raw_text: rawText,
        subsections,
      };
    }),
  };

  return out;
}

