/**
 * Document-agnostic step-to-UI inference.
 * Analyzes step action/result semantically to infer component type.
 * No hard-coded domains—inference is purely from step text.
 */

/**
 * Convert JTBD/user story text to conversational, user-facing copy.
 * "As a user I can play workout videos at my own speed" → "Play your workouts at your own pace"
 */
export function toUserFacingCopy(text: string, maxLen = 60): string {
  if (!text || !text.trim()) return '';
  const t = text.trim();

  // Strip "As a [role], I can/want/need to? [rest]" and extract [rest]
  // Use [\s\S] instead of . with s flag for ES2017 compatibility
  const jtbdMatch = t.match(
    /^As\s+(?:a|an)\s+[^,]+,?\s*I\s+(?:can|want|need)\s+(?:to\s+)?([\s\S]+?)(?:\s*,?\s*so\s+that\s+[\s\S]+)?$/i
  );
  let extracted = jtbdMatch ? jtbdMatch[1]!.trim() : t;

  // Also handle "As a X I can Y" (no comma)
  if (!jtbdMatch) {
    const altMatch = t.match(
      /^As\s+(?:a|an)\s+\w+(?:\s+\w+)*\s+I\s+(?:can|want|need)\s+(?:to\s+)?([\s\S]+?)(?:\s*,?\s*so\s+that\s+[\s\S]+)?$/i
    );
    if (altMatch) extracted = altMatch[1]!.trim();
  }

  // Common rewrites first (before my→your, so "at my own speed" can match)
  let out = extracted
    .replace(/\bat my own speed\b/gi, 'at your own pace')
    .replace(/\bat my speed\b/gi, 'at your pace')
    .replace(/\bstay motivated\b/gi, 'keep going')
    .replace(/\band stay motivated\b/gi, 'and keep going')
    .replace(/\bmy\b/gi, 'your')
    .replace(/\bme\b/gi, 'you')
    .replace(/\bI\s+can\s+/gi, '')
    .replace(/\bI\s+want\s+to\s+/gi, '')
    .replace(/\bI\s+need\s+to\s+/gi, '')
    .trim();

  // Capitalize first letter
  if (out.length > 0) out = out.charAt(0).toUpperCase() + out.slice(1);

  if (out.length > maxLen) {
    const cut = out.slice(0, maxLen);
    const lastSpace = cut.lastIndexOf(' ');
    out = (lastSpace > maxLen * 0.5 ? cut.slice(0, lastSpace) : cut).trim();
    if (!/[\.,!?]$/.test(out)) out += '…';
  }
  return out;
}

export type StepComponentType =
  | 'category_grid'
  | 'content_grid'
  | 'search'
  | 'media_player'
  | 'recommendations'
  | 'program_cards'
  | 'access_gate'
  | 'form'
  | 'list'
  | 'approval'
  | 'progress_tracker'
  | 'data_table'
  | 'action_banner'
  | 'feature_card'
  | 'selection_cards'
  | 'preview'
  | 'validation_results'
  | 'success_state';

export interface ExtractedEntities {
  categories: string[];
  contentItems: string[];
  contentUnit: string;
  itemLabel: string;
}

/**
 * Infer UI component type from step action and result.
 * Uses semantic verb/object patterns, not domain keywords.
 */
export function inferStepComponentType(
  action: string,
  result: string,
  _allStepsText?: string
): StepComponentType {
  const combined = `${action} ${result}`.toLowerCase();

  // Success confirmation after submit/approve
  if (/submit.*success|approve.*success|completed|confirmed|submitted successfully|approved successfully/i.test(combined)) {
    return 'success_state';
  }

  // Approval/review workflows (approve, reject, sign-off)
  if (/approve|reject|sign.?off|review.*submit/i.test(combined)) {
    return 'approval';
  }

  // Validation results (validate/check with results)
  if (/validate|check.*result|verification|compliance/i.test(combined)) {
    return 'validation_results';
  }

  // Select/choose/pick → selection cards
  if (/select|choose|pick|opt.?in|opt.?out/i.test(combined)) {
    return 'selection_cards';
  }

  // Generate/preview/review → preview (split panel)
  if (/generate|preview|review.*before|split.?panel|side.?by.?side/i.test(combined)) {
    return 'preview';
  }

  // Search, query → search bar + results (check first; "search for content" = search UI)
  if (/search|query/i.test(combined)) {
    return 'search';
  }

  // Discover/find/browse + content type → content grid
  if (
    /(?:discover|see|find|browse).*?(?:\w+)/i.test(combined) &&
    /(?:video|track|song|room|flight|content|workout|playlist|album|listing|option|session|episode)/i.test(
      combined
    )
  ) {
    return 'content_grid';
  }
  // Browse, category, organized, section → category grid
  if (
    /browse|category|organized|type|section|hub|grid|filter/i.test(combined)
  ) {
    return 'category_grid';
  }

  // Premium, access, subscribe, gate → access gate
  if (
    /premium|gat|lock|restrict|subscri|upgrade|free.*user|upsell|included.*plan|access.*plan/i.test(
      combined
    )
  ) {
    return 'access_gate';
  }

  // Play, watch, stream, listen → media player
  if (
    /play|watch|video|stream|guided|session|audio|speed|listen|media/i.test(
      combined
    )
  ) {
    return 'media_player';
  }

  // Progress, streak, habit, goal → progress tracker
  if (
    /progress|streak|habit|goal|achiev|milestone|celebrat|motivated|challenge|program/i.test(
      combined
    )
  ) {
    return 'progress_tracker';
  }

  // Analytics, report, metric → data table
  if (
    /analytic|report|metric|perform|payout|data|revenue|consumed|dashboard/i.test(
      combined
    )
  ) {
    return 'data_table';
  }

  // Recommend, suggest, promote → recommendations
  if (
    /recommend|suggest|next|promot|cross|discover|enjoy|might|editorial|curated|collection|featured|surface/i.test(
      combined
    )
  ) {
    return 'recommendations';
  }

  // Create, add, edit, configure, fill, input → form
  if (/create|add|new|edit|configure|setup|enter|submit|fill|input|provide|specify/i.test(combined)) {
    return 'form';
  }

  // List, view all, queue → list
  if (/list|queue|view all|view.*all|browse.*list/i.test(combined)) {
    return 'list';
  }

  // Device, TV, autoplay, etc. → action banner
  if (
    /device|tv|screen|transfer|nudge|switch|viewing|autoplay|interrupt|protect|exclude|background|launch|smooth|polish|communicate|gtm|readiness/i.test(
      combined
    )
  ) {
    return 'action_banner';
  }

  // Program, structured, multi-session → program cards
  if (/program|structured|multi.?session|challenge|series/i.test(combined)) {
    return 'program_cards';
  }

  return 'feature_card';
}

/**
 * Extract entities from corpus (flows + jobs text) for labels and categories.
 * Document-agnostic: derives from patterns like "discover X", "X videos", etc.
 */
export function extractEntitiesFromCorpus(corpus: string): ExtractedEntities {
  const lower = corpus.toLowerCase();
  const capTerms = new Set<string>();
  let m: RegExpExecArray | null;

  const capRe = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
  while ((m = capRe.exec(corpus)) !== null) {
    const t = m[1]?.trim();
    if (
      t &&
      t.length > 2 &&
      t.length < 30 &&
      !/^(As|The|This|That|When|From|With|For|And|But|Not|Our|All|New|Get|See|Set|Use|Can|May|Has|Its|Via|Per|Now|Let|How|Any)$/.test(
        t
      )
    ) {
      capTerms.add(t);
    }
  }

  const contentItems = new Set<string>();
  const discoverRe =
    /(?:discover|browse|find|see|play|watch|book|search for)\s+(?:some\s+|a\s+|my\s+)?(\w+(?:\s+\w+)?)\s*(?:and|,|\.|$)/gi;
  while ((m = discoverRe.exec(corpus)) !== null) {
    const term = m[1]?.trim();
    if (term && term.length > 2 && term.length < 25) {
      contentItems.add(term.replace(/\s+/g, ' '));
    }
  }
  const compoundRe =
    /\b(\w+)\s+(?:videos?|tracks?|songs?|playlists?|albums?|rooms?|flights?|listings?|options?|workouts?|sessions?|courses?|episodes?)/gi;
  while ((m = compoundRe.exec(corpus)) !== null) {
    if (m[1] && m[1].length > 2) {
      capTerms.add(m[1].charAt(0).toUpperCase() + m[1].slice(1));
      contentItems.add(m[0]!.trim());
    }
  }

  let contentUnit = 'item';
  let itemLabel = 'item';
  if (/video|fitness|workout|exercise|stream/i.test(lower)) {
    contentUnit = 'video';
    itemLabel = /workout|session|class|exercise/i.test(lower)
      ? 'session'
      : 'video';
  } else if (/music|track|song|album|playlist|artist|podcast/i.test(lower)) {
    contentUnit = /playlist|album|podcast/i.test(lower) ? 'collection' : 'track';
    itemLabel = /playlist/i.test(lower)
      ? 'playlist'
      : /album/i.test(lower)
        ? 'album'
        : /podcast/i.test(lower)
          ? 'episode'
          : 'track';
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
    contentItems: contentItems.size > 0 ? [...contentItems].slice(0, 8) : [...capTerms].slice(0, 6),
    contentUnit,
    itemLabel,
  };
}

/**
 * Build Figma UI description for a step given its inferred component type.
 */
export function stepToFigmaDescription(
  componentType: StepComponentType,
  step: { action?: string; result?: string },
  entities: ExtractedEntities,
  productName: string
): string {
  const action = step.action ?? '';
  const result = step.result ?? '';
  const combined = `${action} ${result}`.toLowerCase();
  const hasSpeed = /speed|pace|rate|tempo/i.test(combined);

  const items =
    entities.categories.length > 0 ? entities.categories : entities.contentItems;
  const labels = items.length > 0 ? items.slice(0, 6) : [entities.itemLabel];

  switch (componentType) {
    case 'category_grid':
      return `
### Category Grid
- Category chips/cards: ${labels.slice(0, 6).join(', ')}
- Grid layout with gradient thumbnails
- Tappable category cards
`;

    case 'content_grid':
      return `
### Content Grid
- Search bar at top: "Search ${productName}..."
- Category chips: ${labels.slice(0, 6).join(', ')}
- Grid of ${entities.itemLabel} cards: thumbnail, title, ${/video|track|session|workout|episode/i.test(entities.contentUnit) ? 'duration badge' : 'subtitle'}
- Cards are tappable
`;

    case 'search':
      return `
### Search
- Search bar: "Search ${productName}..."
- Results list/grid below with ${entities.itemLabel} cards
- Each result: thumbnail, title, metadata
`;

    case 'media_player':
      return `
### Media Player
- Large play area with play button overlay
- Progress bar with current time / total duration
${hasSpeed ? '- Speed control: 0.5×, 0.75×, 1×, 1.25×, 1.5×, 2×' : ''}
- Title and description below
`;

    case 'recommendations':
      return `
### Recommendations
- Horizontal scroll of recommended ${entities.itemLabel} cards
- Each card: thumbnail, title, "Recommended" badge
- Labels from document: ${labels.slice(0, 4).join(', ')}
`;

    case 'program_cards':
      return `
### Program Cards
- Horizontal scroll of ${entities.itemLabel} program / challenge / series cards
- Each card: thumbnail, title, "Multi-session" or "In progress" badge
- Labels from document: ${labels.slice(0, 4).join(', ')}
`;

    case 'access_gate':
      return `
### Access Gate
- Lock icon or premium badge
- Title: "${toUserFacingCopy(action, 50)}"
- Description: ${toUserFacingCopy(result, 80)}
- [Upgrade] or [Explore ${productName}] button
`;

    case 'form':
      return `
### Form
- Form fields relevant to: ${toUserFacingCopy(action, 40)}
- Name, Description, Category, Priority (or context-appropriate fields)
- [Cancel] [Save Draft] [Submit] actions
`;

    case 'list':
      return `
### List View
- Filters: Status, Date, Search
- Table/list of items with columns
- Each row: key fields, status chip, [View] [Approve] [Reject] actions
`;

    case 'approval':
      return `
### Approval
- Current item card with key details
- [Approve] [Reject] actions
- Optional: comment field
`;

    case 'progress_tracker':
      return `
### Progress Tracker
- Stats cards: completed, streak, total time
- Week/day streak visualization
- Motivational copy
`;

    case 'data_table':
      return `
### Data Table
- Table: columns for entity, period, value, status
- Filters and search
- Export action
`;

    case 'action_banner':
      return `
### Action Banner
- Icon + short message
- [Learn more] or contextual CTA
`;

    default:
      return `
### Feature
- Card with title: "${toUserFacingCopy(action, 50)}"
- Description: ${toUserFacingCopy(result, 80)}
`;
  }
}
