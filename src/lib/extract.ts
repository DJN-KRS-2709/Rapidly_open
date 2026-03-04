/**
 * CPM Extractor - Extracts a Canonical Prototype Model from a sectionized PRD
 */

import { type SectionizedPrd } from './sectionize';

type SectionMap = SectionizedPrd;
type Cpm = any;

function norm(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickSection(map: SectionMap, titleIncludes: string): SectionMap['sections'][number] | undefined {
  const key = norm(titleIncludes);
  return map.sections.find(s => norm(s.section_title).includes(key));
}

function pickSubsection(
  section: SectionMap['sections'][number] | undefined,
  titleIncludes: string
): { id: string; title: string; text: string } | undefined {
  if (!section?.subsections) return;
  const key = norm(titleIncludes);
  const sub = section.subsections.find(ss => norm(ss.subsection_title).includes(key));
  if (!sub) return;
  return { id: sub.subsection_id, title: sub.subsection_title, text: sub.raw_text ?? '' };
}

function pickSubsectionAny(
  section: SectionMap['sections'][number] | undefined,
  titleIncludesList: string[]
): { id: string; title: string; text: string } | undefined {
  for (const t of titleIncludesList) {
    const hit = pickSubsection(section, t);
    if (hit && hit.text.trim().length > 0) return hit;
  }
  return undefined;
}

function firstText(...candidates: Array<{ text: string } | undefined>): string {
  for (const c of candidates) {
    const t = c?.text?.trim();
    if (t) return t;
  }
  return '';
}

function sectionRawText(section: SectionMap['sections'][number] | undefined): string {
  return (section?.raw_text ?? '').trim();
}

function extractContentAfterHeading(rawText: string, headingPatterns: string[]): string {
  const lines = rawText.split('\n');

  for (const pattern of headingPatterns) {
    const patternLower = pattern.toLowerCase();

    for (let i = 0; i < lines.length; i++) {
      const currentLine = lines[i];
      if (!currentLine) continue;
      const lineLower = currentLine.toLowerCase().replace(/[*_#]/g, '').trim();

      if (lineLower.includes(patternLower) || lineLower === patternLower) {
        const contentLines: string[] = [];
        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j];
          if (nextLine === undefined) continue;
          const nextLineTrimmed = nextLine.trim();

          const isHeading =
            /^[A-Z][a-z]+(\s+[A-Z]?[a-z]*)*\s*$/.test(nextLineTrimmed) ||
            /^(Goals|Benefits|Current State|Strategic|Metrics|Success|Requirements|Effort|Risk)/i.test(nextLineTrimmed);

          if (isHeading && contentLines.length > 0) {
            break;
          }

          contentLines.push(nextLine);
        }

        const content = contentLines.join('\n').trim();
        if (content.length > 20) {
          return content;
        }
      }
    }
  }

  return '';
}

/**
 * Extract explicit problem content from a section by looking for known problem subsections
 * Prioritizes sections like "Problem", "Opportunity", "Current state", "Why now"
 */
function extractExplicitProblemContent(sectionMap: SectionMap): string {
  // Priority order for explicit problem sections
  const problemSectionPatterns = [
    /^problem$/i,
    /^problem\s*\/?\s*opportunity$/i,
    /^opportunity$/i,
    /^current\s*state$/i,
    /^why\s*now$/i,
    /^user\s*problem$/i,
    /^business\s*problem$/i,
    /^pain\s*points?$/i,
    /^challenges?$/i,
    /^background$/i,
    /^context$/i,
  ];
  
  // Look for sections matching these patterns
  // Strip numbered prefixes (e.g. "2. Challenge" → "Challenge") before testing
  for (const pattern of problemSectionPatterns) {
    const section = sectionMap.sections.find(s => {
      const stripped = s.section_title.replace(/^\d+(\.\d+)*\.?\s+/, '');
      return pattern.test(stripped) || pattern.test(s.section_title);
    });
    if (section?.raw_text && section.raw_text.trim().length > 30) {
      return section.raw_text.trim();
    }
  }
  
  // Also check subsections within Overview or Understand It
  const containerSections = ['overview', 'understand it', 'understand_it'];
  for (const containerName of containerSections) {
    const container = sectionMap.sections.find(s => 
      s.section_title.toLowerCase().replace(/\s+/g, ' ').includes(containerName.toLowerCase())
    );
    if (container?.subsections) {
      for (const pattern of problemSectionPatterns) {
        const sub = container.subsections.find(ss => pattern.test(ss.subsection_title));
        if (sub?.raw_text && sub.raw_text.trim().length > 30) {
          return sub.raw_text.trim();
        }
      }
    }
  }
  
  return '';
}

/**
 * Extract problem content from product brief format with Creators:/Business: subsections
 */
function extractProblemFromProductBrief(rawText: string): string {
  const lines = rawText.split('\n');
  const problems: string[] = [];
  
  let currentSection: 'creators' | 'business' | 'none' = 'none';
  let currentContent: string[] = [];
  
  for (const line of lines) {
    const lineLower = line.toLowerCase().trim();
    
    // Check for section markers
    if (lineLower.startsWith('creators:') || lineLower === 'creators') {
      if (currentSection !== 'none' && currentContent.length > 0) {
        problems.push(`${currentSection === 'creators' ? 'Creators' : 'Business'}: ${currentContent.join(' ').trim()}`);
      }
      currentSection = 'creators';
      currentContent = [];
      // Extract content after colon if on same line
      const afterColon = line.replace(/^creators:?\s*/i, '').trim();
      if (afterColon) currentContent.push(afterColon);
      continue;
    }
    
    if (lineLower.startsWith('business:') || lineLower === 'business') {
      if (currentSection !== 'none' && currentContent.length > 0) {
        problems.push(`${currentSection === 'creators' ? 'Creators' : 'Business'}: ${currentContent.join(' ').trim()}`);
      }
      currentSection = 'business';
      currentContent = [];
      // Extract content after colon if on same line
      const afterColon = line.replace(/^business:?\s*/i, '').trim();
      if (afterColon) currentContent.push(afterColon);
      continue;
    }
    
    // Check for section terminators (next major heading)
    if (/^(background|proposed solution|solution|why now|insights)/i.test(lineLower)) {
      break;
    }
    
    // Accumulate content for current section
    if (currentSection !== 'none' && line.trim()) {
      currentContent.push(line.trim());
    }
  }
  
  // Don't forget the last section
  if (currentSection !== 'none' && currentContent.length > 0) {
    problems.push(`${currentSection === 'creators' ? 'Creators' : 'Business'}: ${currentContent.join(' ').trim()}`);
  }
  
  return problems.join('\n\n');
}

/**
 * Patterns that indicate problem/pain language
 */
const PROBLEM_SIGNAL_PATTERNS = [
  /\bwe\s+lack\b/i,
  /\bthere\s+is\s+no\b/i,
  /\bteams?\s+can(?:'t|not)\b/i,
  /\bit(?:'s|\s+is)\s+hard\s+to\b/i,
  /\bthis\s+causes?\b/i,
  /\bno\s+single\b/i,
  /\bno\s+way\s+to\b/i,
  /\bcannot\b/i,
  /\bdon(?:'t|not)\s+have\b/i,
  /\bmissing\b/i,
  /\black(?:s|ing)?\b/i,
  /\bpain\s+point/i,
  /\bfrustrat/i,
  /\bconfus/i,
  /\binconsisten/i,
  /\bfragment/i,
  /\bsilos?\b/i,
  /\bmisalign/i,
  /\bduplica/i,
  /\bslow\s+decision/i,
  /\bstalled\b/i,
  /\bblocked\b/i,
  /\bdelays?\b/i,
  /\bwasted\s+time/i,
  /\binefficien/i,
  /\bmanual(?:ly)?\s+(?:process|track|maintain)/i,
  /\bno\s+visibility/i,
  /\bunclear\b/i,
  /\bunreliable\b/i,
  /\boutdated\b/i,
  /\bscattered\b/i,
  /\bdisconnected\b/i,
  /\bdifficult\s+to\b/i,
  /\bchallenging\s+to\b/i,
  /\bstrugg/i,
  /\brisk(?:s|y)?\b/i,
  /\berror(?:s|-prone)?\b/i,
];

/**
 * Patterns that indicate solution language (should be de-prioritized)
 */
const SOLUTION_SIGNAL_PATTERNS = [
  /\b\w+\s+allows?\b/i, // "Focus allows", "Tool allows"
  /\bthis\s+tool\s+will\b/i,
  /\bwe\s+will\s+build\b/i,
  /\bwe\s+(?:will|are\s+going\s+to)\s+(?:create|develop|implement)\b/i,
  /\bthe\s+(?:solution|feature|tool|system)\s+(?:will|provides?|enables?)\b/i,
  /\bby\s+(?:using|implementing|building)\b/i,
  /\busers?\s+can\s+now\b/i,
  /\benables?\s+(?:users?|teams?|you)\s+to\b/i,
  /\bclick(?:able)?\s+(?:ui|prototype|button)/i,
  /\bui\s+design/i,
  /\bscreen\s+(?:design|flow|mockup)/i,
  /\bfigma\b/i,
  /\bfeatures?\s+include/i,
  /\bkey\s+features?/i,
  /\bwith\s+this\s+(?:feature|tool|solution)/i,
];

/**
 * Score a sentence based on problem vs solution signals
 * Higher score = more problem-focused
 */
function scoreProblemSentence(sentence: string): number {
  let score = 0;
  
  for (const pattern of PROBLEM_SIGNAL_PATTERNS) {
    if (pattern.test(sentence)) {
      score += 2;
    }
  }
  
  for (const pattern of SOLUTION_SIGNAL_PATTERNS) {
    if (pattern.test(sentence)) {
      score -= 3; // Penalize solution language more heavily
    }
  }
  
  return score;
}

/**
 * Clean and normalize a problem statement
 */
function cleanProblemStatement(text: string): string {
  let cleaned = text;
  
  // Remove leading boilerplate phrases
  const boilerplatePrefixes = [
    /^key\s+challenges?\s+include:?\s*/i,
    /^the\s+(?:main|key|primary)\s+(?:problem|issue|challenge)s?\s+(?:is|are):?\s*/i,
    /^problem\s+statement:?\s*/i,
    /^current\s+challenges?:?\s*/i,
    /^challenges?:?\s*/i,
    /^issues?:?\s*/i,
  ];
  
  for (const pattern of boilerplatePrefixes) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // Remove solution-focused sentences
  const solutionSentencePatterns = [
    /[^.]*\b\w+\s+allows\s+[^.]+\./gi, // "Focus allows ..."
    /[^.]*\bthis\s+tool\s+will\b[^.]+\./gi,
    /[^.]*\bwe\s+will\s+build\b[^.]+\./gi,
    /[^.]*\bthe\s+(?:solution|feature|tool)\s+(?:will|provides?|enables?)\b[^.]+\./gi,
  ];
  
  for (const pattern of solutionSentencePatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // Remove duplicated consecutive words (like "Potential, Potential")
  cleaned = cleaned.replace(/\b(\w+)(?:,?\s+\1)+\b/gi, '$1');
  
  // Remove duplicated consecutive multi-word phrases (like "Data inconsistency, Data inconsistency")
  // This handles 2-3 word phrases that repeat
  cleaned = cleaned.replace(/\b((?:\w+\s+){1,2}\w+)(?:,?\s+\1)+\b/gi, '$1');
  
  // Remove duplicated phrases in comma-separated lists
  const parts = cleaned.split(/,\s*/);
  const seen = new Set<string>();
  const dedupedParts: string[] = [];
  for (const part of parts) {
    const normalized = part.toLowerCase().trim();
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      dedupedParts.push(part.trim());
    }
  }
  if (parts.length !== dedupedParts.length) {
    cleaned = dedupedParts.join(', ');
  }
  
  // Clean up whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // Remove trailing incomplete sentences or fragments
  cleaned = cleaned.replace(/[,;]\s*$/, '');
  
  return cleaned;
}

/**
 * Extract and format the best problem sentences from raw content
 */
function synthesizeProblemStatement(rawContent: string): string {
  // Split into sentences
  const sentences = rawContent
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);
  
  if (sentences.length === 0) {
    return cleanProblemStatement(rawContent);
  }
  
  // Score each sentence for problem-focus
  const scoredSentences = sentences.map(s => ({
    text: s,
    score: scoreProblemSentence(s),
  }));
  
  // Sort by score (highest first)
  scoredSentences.sort((a, b) => b.score - a.score);
  
  // Filter to only sentences with positive problem scores, or use top sentences
  const problemSentences = scoredSentences.filter(s => s.score > 0);
  
  // If we have good problem sentences, use them
  if (problemSentences.length > 0) {
    // Take the best problem sentence + optionally a consequence sentence
    const best = problemSentences.slice(0, 2).map(s => s.text);
    let result = best.join(' ');
    
    // Cap at 320 characters
    if (result.length > 320) {
      // Try to cut at a sentence boundary
      const firstSentenceEnd = result.indexOf('.', 50);
      if (firstSentenceEnd > 0 && firstSentenceEnd < 320) {
        result = result.slice(0, firstSentenceEnd + 1);
      } else {
        result = result.slice(0, 317) + '...';
      }
    }
    
    return cleanProblemStatement(result);
  }
  
  // Fallback: try to extract problem signals from bullet points
  const lines = rawContent
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  
  const bulletContents: string[] = [];
  for (const line of lines) {
    // Match bullet points and numbered items
    const match = line.match(/^(?:[*\-•]|\d+\.)\s*(.+)$/);
    if (match && match[1]) {
      const content = match[1].replace(/^\s*\w+:\s*/, '').trim(); // Remove "Title:" prefix
      if (content.length > 15 && scoreProblemSentence(content) >= 0) {
        bulletContents.push(content);
      }
    }
  }
  
  if (bulletContents.length > 0) {
    // Prefer bullet points that have problem signals
    const scoredBullets = bulletContents.map(b => ({
      text: b,
      score: scoreProblemSentence(b),
    }));
    scoredBullets.sort((a, b) => b.score - a.score);
    
    // Take top 2 most problem-focused bullets
    const topBullets = scoredBullets.slice(0, 2).map(b => b.text);
    let result = topBullets.join(' ');
    
    // Cap at 320 characters
    if (result.length > 320) {
      result = result.slice(0, 317) + '...';
    }
    
    return cleanProblemStatement(result);
  }
  
  // Ultimate fallback: use first paragraph, cleaned
  const firstParagraph = rawContent.split(/\n\n/)[0] ?? rawContent;
  let result = firstParagraph.replace(/\n/g, ' ').trim();
  
  // Cap at 320 characters
  if (result.length > 320) {
    const sentenceEnd = result.indexOf('.', 50);
    if (sentenceEnd > 0 && sentenceEnd < 320) {
      result = result.slice(0, sentenceEnd + 1);
    } else {
      result = result.slice(0, 317) + '...';
    }
  }
  
  return cleanProblemStatement(result);
}

/**
 * Patterns that indicate organizational outcome language
 * These describe future states, benefits, and system-level improvements
 */
const OUTCOME_SIGNAL_PATTERNS = [
  // Shared understanding and clarity
  /\bshared\s+(?:clarity|understanding|view|visibility)\b/i,
  /\bexplicit\s+(?:trade-?offs?|priorities|decisions?)\b/i,
  /\bclear\s+(?:trade-?offs?|priorities|alignment|view)\b/i,
  /\balign(?:ment|ed)?\b/i,
  /\bclarity\b/i,
  /\bvisibility\b/i,
  /\btransparenc(?:y|t)\b/i,
  // Organizational outcomes
  /\bacross\s+the\s+organization\b/i,
  /\borganization-?wide\b/i,
  /\bportfolio\s+(?:health|level|view)\b/i,
  /\bsustained\s+(?:focus|alignment|momentum)\b/i,
  /\bdurable\s+(?:decision|alignment|memory)\b/i,
  /\breal-?time\s+(?:visibility|insight|view)\b/i,
  // Velocity and efficiency
  /\breduced?\s+(?:coordination|friction|overhead|cost|time|effort)\b/i,
  /\bfaster\s+(?:decisions?|execution|delivery)\b/i,
  /\bimproved?\s+(?:velocity|speed|efficiency|throughput)\b/i,
  /\bstreamlined?\b/i,
  /\bsimplif(?:y|ied|ies)\b/i,
  // Impact and value
  /\bhigh(?:est)?-?(?:value|impact)\s+work\b/i,
  /\bfocus\s+on\s+(?:what\s+matters|priorities|highest)\b/i,
  /\bprincipled\s+(?:trade-?offs?|decisions?)\b/i,
  /\bgovernance\b/i,
  /\bdecision\s+memory\b/i,
  // State changes
  /\bbecomes?\s+(?:explicit|shared|clear|possible|easier)\b/i,
  /\benables?\s+(?:teams?|leaders?|organization)\s+to\b/i,
  /\b(?:teams?|leaders?|organization)\s+can\s+now\b/i,
  /\btransform(?:s|ed|ing)?\b/i,
  // Benefits
  /\bbenefit(?:s)?\b/i,
  /\bimpact\b/i,
  /\boutcome(?:s)?\b/i,
  /\bvalue\b/i,
  /\bopportunity\b/i,
];

/**
 * Patterns that indicate role-specific or solution-focused language (deprioritize)
 * These describe requirements, features, or individual tasks rather than outcomes
 */
const NON_OUTCOME_PATTERNS = [
  // Role-specific requirements
  /\bevery\s+\w+\s+(?:must|should|can|will)\s+be\s+able\s+to\b/i,
  /\b\w+\s+(?:squad\s+)?lead(?:s|er)?\s+(?:must|should|can|will)\b/i,
  /\b(?:users?|admins?|managers?|engineers?)\s+(?:must|should|can|will)\s+be\s+able\s+to\b/i,
  /\bAs\s+a\s+\w+,?\s+I\s+(?:want|need|can)\b/i, // User stories
  // Implementation details
  /\bclick(?:able)?\s+(?:ui|prototype|button|card)\b/i,
  /\bdashboard\s+(?:shows?|displays?|contains?)\b/i,
  /\bscreen\s+(?:shows?|displays?|allows?)\b/i,
  /\bui\s+(?:component|element|feature)\b/i,
  /\bfeature\s+(?:allows?|enables?|provides?)\b/i,
  /\bapi\s+(?:endpoint|call|request)\b/i,
  // Tool/system actions
  /\b\w+\s+allows?\s+(?:a\s+)?(?:user|leader|manager|admin|team)\s+to\b/i,
  /\bthis\s+(?:tool|feature|system)\s+(?:will|allows?|enables?)\b/i,
  /\bwe\s+will\s+(?:build|create|implement|deliver)\b/i,
  // Specific artifacts
  /\btop\s+\d+\s+(?:card|list|item)\b/i,
  /\bpoint\s+to\s+(?:a|the)\s+['"]?\w+['"]?\b/i,
  // Success criteria format
  /\bkey\s+result\s*\d*:/i,
  /\bkr\s*\d+:/i,
  /\bsuccess\s+criteria?:/i,
];

/**
 * Score a sentence based on outcome vs non-outcome signals
 * Higher score = more outcome-focused
 */
function scoreOutcomeSentence(sentence: string): number {
  let score = 0;
  
  for (const pattern of OUTCOME_SIGNAL_PATTERNS) {
    if (pattern.test(sentence)) {
      score += 2;
    }
  }
  
  for (const pattern of NON_OUTCOME_PATTERNS) {
    if (pattern.test(sentence)) {
      score -= 3; // Penalize non-outcome language more heavily
    }
  }
  
  // Bonus for sentences that describe state changes
  if (/\b(?:becomes?|enables?|transforms?|achieves?|creates?|establishes?)\b/i.test(sentence)) {
    score += 1;
  }
  
  // Penalty for sentences that are too short or look like list items
  if (sentence.length < 30) {
    score -= 1;
  }
  
  return score;
}

/**
 * Clean and normalize an outcome statement
 */
function cleanOutcomeStatement(text: string): string {
  let cleaned = text;
  
  // Remove leading labels
  const labelPrefixes = [
    /^goal:?\s*/i,
    /^outcome:?\s*/i,
    /^benefit:?\s*/i,
    /^objective:?\s*/i,
    /^primary\s+(?:goal|outcome|objective):?\s*/i,
    /^key\s+(?:goal|outcome|benefit):?\s*/i,
    /^north\s+star:?\s*/i,
  ];
  
  for (const pattern of labelPrefixes) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // Remove parenthetical lists like "(plus 8 additional goals...)"
  cleaned = cleaned.replace(/\s*\(plus\s+\d+\s+additional\s+\w+[^)]*\)/gi, '');
  cleaned = cleaned.replace(/\s*\(etc\.?\)/gi, '');
  cleaned = cleaned.replace(/\s*\([^)]*additional[^)]*\)/gi, '');
  
  // Remove Key Results formatting
  cleaned = cleaned.replace(/\s*Key\s+Results?:\s*[^.]+(?:;\s*[^.]+)*\.?/gi, '');
  
  // Remove role-specific "must be able to" sentences
  cleaned = cleaned.replace(/[^.]*\bevery\s+\w+\s+(?:must|should|can|will)\s+be\s+able\s+to\b[^.]*\./gi, '');
  cleaned = cleaned.replace(/[^.]*\b\w+\s+allows?\s+(?:a\s+)?(?:user|leader|manager)\s+to\b[^.]*\./gi, '');
  
  // Remove solution/implementation sentences
  cleaned = cleaned.replace(/[^.]*\bwe\s+will\s+(?:build|create|implement)\b[^.]*\./gi, '');
  cleaned = cleaned.replace(/[^.]*\bthis\s+(?:tool|feature)\s+(?:will|allows?|enables?)\b[^.]*\./gi, '');
  
  // Clean up whitespace and punctuation
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  cleaned = cleaned.replace(/^[,;.\s]+/, '');
  cleaned = cleaned.replace(/[,;]\s*$/, '');
  
  // Ensure proper sentence ending
  if (cleaned && !cleaned.match(/[.!?]$/)) {
    cleaned += '.';
  }
  
  return cleaned;
}

/**
 * Synthesize an organizational outcome from raw goals/outcomes content
 */
function synthesizeOutcome(rawContent: string, problemText: string = '', benefitsText: string = ''): string {
  // Combine all relevant content for analysis
  const combinedContent = [rawContent, benefitsText].filter(Boolean).join('\n\n');
  
  if (!combinedContent.trim()) {
    return '';
  }
  
  // Split into sentences
  const sentences = combinedContent
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 15);
  
  if (sentences.length === 0) {
    return cleanOutcomeStatement(rawContent);
  }
  
  // Score each sentence for outcome-focus
  const scoredSentences = sentences.map(s => ({
    text: s,
    score: scoreOutcomeSentence(s),
  }));
  
  // Sort by score (highest first)
  scoredSentences.sort((a, b) => b.score - a.score);
  
  // Filter to sentences with positive outcome scores
  const outcomeSentences = scoredSentences.filter(s => s.score > 0);
  
  // If we have good outcome sentences, use them
  if (outcomeSentences.length > 0) {
    // Take the best 2-3 outcome sentences
    const best = outcomeSentences.slice(0, 3).map(s => s.text);
    let result = best.join(' ');
    
    // Cap at 400 characters for outcomes (slightly more than problems)
    if (result.length > 400) {
      // Try to cut at a sentence boundary
      const sentenceEnd = result.indexOf('.', 100);
      if (sentenceEnd > 0 && sentenceEnd < 400) {
        // Try to get a second sentence if possible
        const secondSentenceEnd = result.indexOf('.', sentenceEnd + 1);
        if (secondSentenceEnd > 0 && secondSentenceEnd < 400) {
          result = result.slice(0, secondSentenceEnd + 1);
        } else {
          result = result.slice(0, sentenceEnd + 1);
        }
      } else {
        result = result.slice(0, 397) + '...';
      }
    }
    
    return cleanOutcomeStatement(result);
  }
  
  // Fallback: try to derive outcome from problem consequences
  if (problemText) {
    // Look for consequence patterns and invert them into outcomes
    const problemSentences = problemText.split(/(?<=[.!?])\s+/);
    const derivedOutcomes: string[] = [];
    
    for (const sent of problemSentences) {
      // Convert negative consequences to positive outcomes
      if (/\b(?:causes?|leads?\s+to|results?\s+in)\s+(.+)/i.test(sent)) {
        const match = sent.match(/\b(?:causes?|leads?\s+to|results?\s+in)\s+(.+)/i);
        if (match?.[1]) {
          derivedOutcomes.push(`Eliminates ${match[1].toLowerCase()}`);
        }
      }
    }
    
    if (derivedOutcomes.length > 0) {
      return cleanOutcomeStatement(derivedOutcomes.slice(0, 2).join(' '));
    }
  }
  
  // Ultimate fallback: use first non-role-specific sentence
  const nonRoleSentences = scoredSentences.filter(s => s.score >= 0);
  if (nonRoleSentences.length > 0 && nonRoleSentences[0]) {
    return cleanOutcomeStatement(nonRoleSentences[0].text);
  }
  
  // Last resort: clean and return raw content
  const firstParagraph = rawContent.split(/\n\n/)[0] ?? rawContent;
  let result = firstParagraph.replace(/\n/g, ' ').trim();
  
  // Cap length
  if (result.length > 400) {
    const sentenceEnd = result.indexOf('.', 50);
    if (sentenceEnd > 0 && sentenceEnd < 400) {
      result = result.slice(0, sentenceEnd + 1);
    } else {
      result = result.slice(0, 397) + '...';
    }
  }
  
  return cleanOutcomeStatement(result);
}

/**
 * Legacy function for backward compatibility - now calls synthesizeOutcome
 */
function synthesizeGoals(rawContent: string): string {
  const lines = rawContent
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  const goals: string[] = [];
  let currentObjective = '';
  const keyResults: string[] = [];

  for (const line of lines) {
    // Check for "Objective:" pattern
    const objectiveMatch = line.match(/^Objective[:\s]+(.+)$/i);
    if (objectiveMatch && objectiveMatch[1]) {
      currentObjective = objectiveMatch[1].trim();
      continue;
    }

    // Check for "Key Result X:" pattern
    const keyResultMatch = line.match(/^Key Result \d+[:\s]+(.+)$/i);
    if (keyResultMatch && keyResultMatch[1]) {
      keyResults.push(keyResultMatch[1].trim());
      continue;
    }

    const numberedMatch = line.match(/^\d+\.\s*(.+?):\s*(.+)$/);
    if (numberedMatch && numberedMatch[1] && numberedMatch[2]) {
      goals.push(`${numberedMatch[1]}: ${numberedMatch[2]}`);
      continue;
    }

    const bulletMatch = line.match(/^[*\-•]\s*(.+?):\s*(.+)$/);
    if (bulletMatch && bulletMatch[1] && bulletMatch[2]) {
      goals.push(`${bulletMatch[1]}: ${bulletMatch[2]}`);
      continue;
    }

    const simpleMatch = line.match(/^(\d+\.|[*\-•])\s+(.+)$/);
    if (simpleMatch && simpleMatch[2]) {
      goals.push(simpleMatch[2]);
    }
  }

  // If we found Objective + Key Results format, use that
  if (currentObjective && keyResults.length > 0) {
    const krSummary = keyResults.length > 1 
      ? ` Key Results: ${keyResults.slice(0, 3).join('; ')}${keyResults.length > 3 ? '; etc.' : ''}`
      : ` Key Result: ${keyResults[0]}`;
    return currentObjective + krSummary;
  }

  // Combine objective with any additional goals
  if (currentObjective) {
    goals.unshift(currentObjective);
  }
  
  // Add key results as goals if no other goals found
  if (goals.length === 0 && keyResults.length > 0) {
    return keyResults.join('; ');
  }

  if (goals.length === 0) {
    return rawContent;
  }

  if (goals.length === 1) {
    return goals[0] ?? rawContent;
  }

  return `${goals[0]} (plus ${goals.length - 1} additional goals: ${goals
    .slice(1, 3)
    .map(g => g.split(':')[0])
    .join(', ')}${goals.length > 3 ? ', etc.' : ''})`;
}

type Job = {
  job_id: string;
  description: string;
  trigger: string;
  success_outcome: string;
  priority: 'must' | 'should' | 'could';
  /** Hidden: structured interaction steps parsed from user story blocks */
  _interactionSteps?: Array<{ actor: string; action: string; result: string; sourceType?: string }>;
  /** Hidden: original user story title (e.g. "Action A's Booking Review & Approve") */
  _storyTitle?: string;
};

type Flow = {
  flow_id: string;
  name: string;
  type: string;
  actors: string[];
  steps: Array<{ step_id: string; actor_id: string; action: string; result: string }>;
  linked_jobs: string[];
  preconditions?: string[];
  constraints?: string[];
  linked_requirements?: string[];
};

type Requirement = {
  requirement_id: string;
  title: string;
  description: string;
  type: 'access_control' | 'data_filter' | 'search_logic' | 'ui_behavior' | 'general';
  applies_to?: string[]; // flow_ids this requirement applies to
};

/**
 * Extract jobs verbatim from an explicit "Jobs to be Done" section in the PRD.
 * Returns jobs with verbatim text from PRD, not synthesized content.
 */
function extractJobsFromJtbdSection(
  sectionMap: SectionMap,
  openQuestions: string[]
): { jobs: Job[]; found: boolean } {
  // Look for explicit JTBD sections - both top-level and within content
  const jtbdPatterns = [
    /jobs?\s*to\s*be\s*done/i,
    /^jtbd$/i,
    /^jobs$/i,
    /^user\s*jobs$/i,
    /^job\s*stories$/i,
  ];
  
  // First, try to find a dedicated JTBD section
  let jtbdSection = sectionMap.sections.find(s => 
    jtbdPatterns.some(p => p.test(s.section_title))
  );
  
  // If not found as a section, look within "Think It" or "Requirements" sections
  // The JTBD content might be a subsection or inline within Requirements
  let rawText = '';
  
  if (jtbdSection?.raw_text && jtbdSection.raw_text.trim().length >= 20) {
    rawText = jtbdSection.raw_text;
  } else {
    // Search in Think It, Requirements, or any section containing JTBD content
    for (const section of sectionMap.sections) {
      const fullText = section.raw_text ?? '';
      
      // Check if the section contains JTBD content
      if (/jobs?\s*to\s*be\s*done\s*\(?jtbd\)?/i.test(fullText) || 
          /\bJob:\s*The\s+\w+/i.test(fullText) ||
          /\bJOB\s+\d+\s*(?:Job\s*Description)?/i.test(fullText)) {
        // If it starts with JOB N pattern, use the full section
        if (/JOB\s+\d+/i.test(fullText)) {
          rawText = fullText;
          break;
        }
        // Otherwise extract the JTBD portion
        const jtbdStart = fullText.search(/jobs?\s*to\s*be\s*done/i);
        if (jtbdStart >= 0) {
          rawText = fullText.slice(jtbdStart);
          break;
        }
      }
      
      // Also check subsections
      for (const sub of section.subsections ?? []) {
        if (jtbdPatterns.some(p => p.test(sub.subsection_title)) || 
            /\bJob:\s*The\s+\w+/i.test(sub.raw_text ?? '') ||
            /\bJOB\s+\d+/i.test(sub.raw_text ?? '')) {
          rawText = sub.raw_text ?? '';
          if (rawText.trim().length >= 20) break;
        }
      }
      if (rawText.trim().length >= 20) break;
    }
  }
  
  if (!rawText || rawText.trim().length < 20) {
    return { jobs: [], found: false };
  }
  
  const jobs: Job[] = [];
  const lines = rawText.split('\n');
  
  // Parse job blocks - handle format like:
  // Job: The Resource Guardrail
  // * Job Description: Ensure that engineering capacity...
  // * Trigger: A stakeholder requests to start a new...
  // * Success Outcome: The tool forces a trade-off decision...
  
  let currentJob: Partial<Job> & { hasDescription?: boolean; jobTitle?: string } = {};
  let jobIndex = 0;
  // Track which field we're currently collecting multi-line content for
  let collectingField: 'description' | 'trigger' | 'success_outcome' | null = null;
  
  const saveCurrentJob = () => {
    collectingField = null;
    if ((currentJob.hasDescription || currentJob.jobTitle) && (currentJob.description || currentJob.jobTitle)) {
      jobIndex++;
      const job: Job = {
        job_id: `job_jtbd_${jobIndex}`,
        description: currentJob.description || currentJob.jobTitle || '',
        trigger: currentJob.trigger || '',
        success_outcome: currentJob.success_outcome || '',
        priority: jobIndex <= 2 ? 'must' : 'should',
      };
      
      // Add open questions for missing fields
      if (!job.trigger) {
        openQuestions.push(`Job "${job.description.slice(0, 50)}..." is missing a trigger. Please specify when this job is activated.`);
      }
      if (!job.success_outcome) {
        openQuestions.push(`Job "${job.description.slice(0, 50)}..." is missing a success outcome. Please specify what success looks like.`);
      }
      
      jobs.push(job);
    }
    currentJob = {};
  };
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Check for job title line: "Job: The Resource Guardrail", "JTBD 1: Identify Net-New...", or "JOB 1 Job Description: ..."
    const jobTitleMatch = trimmed.match(/^(?:Job|JTBD\s*\d*)\s*:\s*(.+)$/i);
    if (jobTitleMatch && jobTitleMatch[1]) {
      saveCurrentJob();
      currentJob = { jobTitle: jobTitleMatch[1].trim(), hasDescription: true };
      continue;
    }
    
    // Check for "JOB N Job Description: ..." format (combined title + description)
    const jobNMatch = trimmed.match(/^JOB\s+\d+\s*(?:Job\s*Description\s*:\s*)?(.+)$/i);
    if (jobNMatch && jobNMatch[1]) {
      saveCurrentJob();
      const desc = jobNMatch[1].trim().replace(/\.\s*$/, '');
      currentJob = { jobTitle: desc, description: desc, hasDescription: true };
      collectingField = null;
      continue;
    }
    
    // If we're collecting multi-line content for a field, continue collecting
    // This MUST come before bullet/numbered job matching to avoid treating
    // "- TA reviews only..." as a new job when it's part of Success Outcome
    if (collectingField && currentJob.jobTitle) {
      // Check if this line starts a new labeled field (which would change collectingField)
      if (/^[*•-]?\s*(?:Job\s*Description|Trigger|Success(?:\s*Outcome)?|When|Outcome|Result)\s*:/i.test(trimmed)) {
        // Don't consume - let the field matchers below handle it
      } else if (/^(?:JTBD|Job)\s+\d*\s*:/i.test(trimmed) || /^JOB\s+\d+/i.test(trimmed)) {
        // New JTBD/JOB entry - don't consume, let the title matcher handle it
      } else if (/^[=_-]{5,}$/.test(trimmed)) {
        // Section divider - don't consume
      } else if (/^Flow\s*Name\s*:/i.test(trimmed) || /^\d+[\.\)]\s*Actor\s*:/i.test(trimmed)) {
        // Flow name or flow step line - stop collecting, these belong to flows
        collectingField = null;
      } else if (/^\s*Result\s*:/i.test(trimmed)) {
        // Result line from a flow step - skip
        collectingField = null;
      } else {
        // Collect this line into the current field
        const contentLine = trimmed.replace(/^[-•*]\s*/, '').trim();
        if (contentLine) {
          if (collectingField === 'description') {
            currentJob.description = currentJob.description
              ? `${currentJob.description} ${contentLine}`
              : contentLine;
            currentJob.hasDescription = true;
          } else if (collectingField === 'trigger') {
            currentJob.trigger = currentJob.trigger
              ? `${currentJob.trigger} ${contentLine}`
              : contentLine;
          } else if (collectingField === 'success_outcome') {
            currentJob.success_outcome = currentJob.success_outcome
              ? `${currentJob.success_outcome} ${contentLine}`
              : contentLine;
          }
        }
        continue;
      }
    }

    // Skip flow step lines: "N. Actor: X Action: Y" (these are NOT jobs, they're flow steps)
    // Also skip continuation lines like "    Result: ..." or "    created and status..."
    if (/^\d+[\.\)]\s+Actor\s*:/i.test(trimmed) || /^Actor\s*:\s*\w+\s+Action\s*:/i.test(trimmed)) {
      continue;
    }
    if (/^\s*Result\s*:/i.test(trimmed) && !currentJob.jobTitle) {
      continue;
    }
    
    // Check for numbered job category headers like "2. Operational Clarity Jobs"
    // These are section headers, not individual jobs
    if (/^\d+\.\s+\w+.*Jobs$/i.test(trimmed)) {
      saveCurrentJob();
      continue;
    }
    
    // Check for numbered job: "1. Find relevant content quickly"
    const numberedJobMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (numberedJobMatch && numberedJobMatch[2]) {
      const text = numberedJobMatch[2].trim();
      // Make sure this isn't a sub-field like "1. Trigger: ..." or "Success Outcome: ..."
      if (!/^(Trigger|Success\s*Outcome|Success|Outcome|Result|When|Job\s*Description)\s*:/i.test(text) && text.length > 5) {
        saveCurrentJob();
        currentJob = { description: text, hasDescription: true };
        continue;
      }
    }
    
    // Check for bullet job: "- View dashboard metrics"
    const bulletJobMatch = trimmed.match(/^[-•*]\s+(.+)$/);
    if (bulletJobMatch && bulletJobMatch[1]) {
      const text = bulletJobMatch[1].trim();
      // Make sure this isn't a sub-field like "- Trigger: ..." or "- Success Outcome: ..."
      if (!/^(Trigger|Success\s*Outcome|Success|Outcome|Result|When|Job\s*Description)\s*:/i.test(text) && text.length > 5) {
        saveCurrentJob();
        currentJob = { description: text, hasDescription: true };
        continue;
      }
    }
    
    // Check for job description line: "* Job Description: ..." or "Job Description:" (content on next line)
    const jobDescMatch = trimmed.match(/^[*•-]?\s*Job\s*Description\s*[:]\s*(.*)$/i);
    if (jobDescMatch) {
      collectingField = 'description';
      if (jobDescMatch[1] && jobDescMatch[1].trim()) {
        currentJob.description = jobDescMatch[1].trim();
        currentJob.hasDescription = true;
      }
      continue;
    }
    
    // Check for trigger line: "* Trigger: ..." or "Trigger:" (content on next line)
    const triggerMatch = trimmed.match(/^[*•-]?\s*Trigger\s*[:]\s*(.*)$/i);
    if (triggerMatch) {
      collectingField = 'trigger';
      if (triggerMatch[1] && triggerMatch[1].trim()) {
        currentJob.trigger = triggerMatch[1].trim();
      }
      continue;
    }
    
    // Check for success outcome line: "* Success Outcome: ..." or "Success Outcome:" (content on next line)
    const successMatch = trimmed.match(/^[*•-]?\s*Success(?:\s*Outcome)?\s*[:]\s*(.*)$/i);
    if (successMatch) {
      collectingField = 'success_outcome';
      if (successMatch[1] && successMatch[1].trim()) {
        currentJob.success_outcome = successMatch[1].trim();
      }
      continue;
    }
    
    // Alternative formats
    const whenMatch = trimmed.match(/^[*•-]?\s*When\s*[:]\s*(.+)$/i);
    if (whenMatch && whenMatch[1] && !currentJob.trigger) {
      currentJob.trigger = whenMatch[1].trim();
      continue;
    }
    
    const outcomeMatch = trimmed.match(/^[*•-]?\s*(?:Outcome|Result)\s*[:]\s*(.+)$/i);
    if (outcomeMatch && outcomeMatch[1]) {
      currentJob.success_outcome = outcomeMatch[1].trim();
      continue;
    }
    
    // Stop at section dividers (=== or ___ or ---)
    if (/^[=_-]{5,}$/.test(trimmed)) {
      collectingField = null;
      saveCurrentJob();
      continue;
    }
    
    // "Flow Name:" marks the start of flow steps within a JTBD block - stop collecting job fields
    if (/^Flow\s*Name\s*:/i.test(trimmed)) {
      collectingField = null;
      continue;
    }
    
    // Flow step lines: "N. Actor: ..." or just "Actor: ..." followed by Action/Result
    // These belong to flows, not jobs - skip them entirely
    if (/^\d+[\.\)]\s*Actor\s*:/i.test(trimmed) || /^Actor\s*:\s*\w+\s+Action\s*:/i.test(trimmed)) {
      collectingField = null;
      continue;
    }
    // Indented or standalone Result: lines from flow steps
    if (/^\s*Result\s*:/i.test(trimmed)) {
      continue;
    }
    
    // Stop if we hit a completely different section (like User Flows)
    if (/^(?:Flow\s+\d|Flow\s+[A-Z]:|User\s*Flows?|High\s*Level\s*Design|HLD)/i.test(trimmed)) {
      break;
    }
  }
  
  // Save the last job
  saveCurrentJob();
  
  return { jobs, found: jobs.length > 0 };
}

/**
 * Parse user story tables from PRD content.
 * Handles tables with columns like: Use Case | User Story | Status | Notes
 * or: # | User Story | Status | Notes
 */
function parseUserStoryTable(rawText: string): Job[] {
  const jobs: Job[] = [];
  const lines = rawText.split('\n');
  
  // Find table header row - look for variations of user story column headers
  let headerRowIndex = -1;
  let storyColIndex = -1;
  let statusColIndex = -1;
  let notesColIndex = -1;
  let useCaseColIndex = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (!line.includes('|')) continue;
    
    const cells = line.split('|').map(c => c.trim().toLowerCase());
    
    // Look for user story column
    const storyIdx = cells.findIndex(c => 
      c.includes('user story') || c.includes('story') || c.includes('description')
    );
    
    if (storyIdx >= 0) {
      headerRowIndex = i;
      storyColIndex = storyIdx;
      statusColIndex = cells.findIndex(c => c.includes('status'));
      notesColIndex = cells.findIndex(c => c.includes('note'));
      useCaseColIndex = cells.findIndex(c => c.includes('use case') || c.includes('category'));
      break;
    }
  }
  
  if (headerRowIndex < 0 || storyColIndex < 0) {
    return jobs;
  }
  
  // Parse data rows (skip header and separator rows)
  let jobIndex = 0;
  for (let i = headerRowIndex + 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (!line.includes('|')) continue;
    
    // Skip separator rows (e.g., |---|---|---|)
    if (/^\s*\|[\s\-:]+\|/.test(line)) continue;
    
    const cells = line.split('|').map(c => c.trim());
    const storyText = cells[storyColIndex] ?? '';
    
    // Skip empty cells or header-like content
    if (!storyText || storyText.toLowerCase() === 'user story' || storyText === '-') continue;
    
    // Extract story number if present (e.g., "#1", "#2")
    const storyNumMatch = storyText.match(/#(\d+)/);
    const storyNum = storyNumMatch ? storyNumMatch[1] : String(++jobIndex);
    
    // Clean up the story text - remove leading #N
    let cleanStory = storyText.replace(/^#\d+\s*/, '').trim();
    
    // Extract status emoji/text
    const statusText = cells[statusColIndex] ?? '';
    let status: 'solved' | 'partial' | 'pending' = 'pending';
    if (statusText.includes('✅') || /solved|done|complete/i.test(statusText)) {
      status = 'solved';
    } else if (statusText.includes('⚠️') || /partial|wip|progress/i.test(statusText)) {
      status = 'partial';
    }
    
    // Get notes/additional context
    const notesText = cells[notesColIndex] ?? '';
    const useCaseText = cells[useCaseColIndex] ?? '';
    
    // Parse "As a user, I can/want/need [action]" to derive trigger and outcome
    let trigger = useCaseText ? `User needs: ${useCaseText}` : 'User initiates the action';
    let successOutcome = notesText || `${cleanStory} is completed successfully`;
    
    // Extract action from "As a user/role, [subject] can/will [action]" pattern
    const userStoryMatch = cleanStory.match(/As\s+a\s+(\w+),?\s*(?:["']([^"']+)["']\s+)?(can|will|should|must)?\s*(?:be\s+)?(.*)/i);
    if (userStoryMatch) {
      const role = userStoryMatch[1] ?? 'user';
      const subject = userStoryMatch[2] ?? '';
      const verb = userStoryMatch[3] ?? 'can';
      const action = userStoryMatch[4]?.trim() ?? '';
      
      // Construct more meaningful trigger and outcome
      if (useCaseText) {
        trigger = `${role} needs to perform ${useCaseText.toLowerCase()}`;
      } else if (subject) {
        trigger = `${role} wants to interact with ${subject}`;
      }
      
      if (action) {
        successOutcome = subject 
          ? `${subject} ${verb} ${action}`
          : `${role} ${verb} ${action}`;
      }
      
      // Keep the full user story as description
      cleanStory = `As a ${role}${subject ? `, "${subject}"` : ''} ${verb} ${action}`.trim();
    }
    
    // Create job from user story
    const job: Job = {
      job_id: `job_us_${storyNum}`,
      description: cleanStory || storyText,
      trigger,
      success_outcome: successOutcome,
      priority: status === 'solved' ? 'must' : status === 'partial' ? 'should' : 'could',
    };
    
    jobs.push(job);
  }
  
  return jobs;
}

/**
 * Parse structured "User Story N: Title" blocks from PRD text.
 * Handles the common enterprise PRD format where each user story contains:
 * - "As a [role], I want [capability], so that [benefit]"
 * - "Trigger: ..."
 * - "What I see: ..."
 * - "My Action: ..."
 * - "System Action: ..."
 * - "System Under the Hood: ..."
 * - "Error Visibility: ..."
 * - "Action - [Name]: ..."
 *
 * Returns both jobs and structured interaction data for flow generation.
 */
interface StructuredUserStory {
  storyNum: string;
  title: string;
  role: string;
  capability: string;
  benefit: string;
  job: Job;
  interactions: Array<{
    actor: string;
    action: string;
    result: string;
    sourceType?: string;
  }>;
}

function parseStructuredUserStoryBlocks(rawText: string): StructuredUserStory[] {
  const stories: StructuredUserStory[] = [];

  // Find "User Story N:" boundaries
  const headerPattern = /(?:^|\n)\s*(?:User\s+Story\s+(\d+)\s*:\s*(.+?))\s*(?:\n|$)/gi;
  const headers: Array<{ index: number; num: string; title: string; matchEnd: number }> = [];
  let hMatch;
  while ((hMatch = headerPattern.exec(rawText)) !== null) {
    headers.push({
      index: hMatch.index,
      num: hMatch[1] ?? String(headers.length + 1),
      title: (hMatch[2] ?? '').trim(),
      matchEnd: hMatch.index + hMatch[0].length,
    });
  }

  if (headers.length === 0) return [];

  for (let hi = 0; hi < headers.length; hi++) {
    const header = headers[hi]!;
    const blockEnd = hi < headers.length - 1 ? headers[hi + 1]!.index : rawText.length;
    const blockText = rawText.slice(header.matchEnd, blockEnd).trim();

    // Extract "As a [role], I want [capability], so that [benefit]"
    // Handle multi-word roles: "As an Accountant and Tax Expert"
    const asAMatch = blockText.match(
      /As\s+(?:a|an)\s+([\s\S]+?),\s*I\s+(?:want|need|can)\s+(?:to\s+)?([\s\S]+?)(?:,\s*so\s+that\s+([\s\S]+?))?(?:\.\s*$|\.\s*\n|\n\n)/im
    );

    if (!asAMatch) continue;

    const role = asAMatch[1]?.trim().replace(/,\s*$/, '') ?? 'user';
    const capability = asAMatch[2]?.trim().replace(/,\s*$/, '') ?? '';
    const benefit = asAMatch[3]?.trim().replace(/\.\s*$/, '') ?? '';

    if (!capability || capability.length < 5) continue;

    // Parse interaction patterns from the block text
    const interactions: StructuredUserStory['interactions'] = [];

    // Labeled pattern types and their actor mapping
    const labelPatterns: Array<{
      pattern: RegExp;
      actor: 'role' | 'system';
      resultHint: string;
      sourceType: string;
    }> = [
      { pattern: /^Trigger:\s*/i, actor: 'system', resultHint: 'Process initiated', sourceType: 'trigger' },
      { pattern: /^What\s+I\s+see:\s*/i, actor: 'system', resultHint: 'UI state presented', sourceType: 'what_i_see' },
      { pattern: /^My\s+Action:\s*/i, actor: 'role', resultHint: 'Action performed', sourceType: 'my_action' },
      { pattern: /^System\s+Action:\s*/i, actor: 'system', resultHint: 'System processes request', sourceType: 'system_action' },
      { pattern: /^System\s+Under\s+the\s+Hood:\s*/i, actor: 'system', resultHint: 'System processes internally', sourceType: 'system_hood' },
      { pattern: /^Error\s+Visibility:\s*/i, actor: 'system', resultHint: 'Error state displayed', sourceType: 'error_visibility' },
      { pattern: /^Action\s*[-–—]\s*Retry:\s*/i, actor: 'role', resultHint: 'Retry initiated', sourceType: 'action_retry' },
      { pattern: /^Action\s*[-–—]\s*Partial\s+Failures?:\s*/i, actor: 'system', resultHint: 'Partial failure handled', sourceType: 'action_partial' },
      { pattern: /^Action\s*[-–—]\s*(.+?):\s*/i, actor: 'role', resultHint: 'Action completed', sourceType: 'action_generic' },
    ];

    const lines = blockText.split('\n');
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li]?.trim() ?? '';
      if (!line) continue;

      for (const lp of labelPatterns) {
        if (!lp.pattern.test(line)) continue;

        let text = line.replace(lp.pattern, '').trim();

        // Collect continuation lines (indented, bullets, or same-paragraph)
        for (let li2 = li + 1; li2 < lines.length; li2++) {
          const nextRaw = lines[li2] ?? '';
          const nextTrimmed = nextRaw.trim();

          // Stop at next labeled pattern, heading, or double blank
          if (labelPatterns.some((p) => p.pattern.test(nextTrimmed))) break;
          if (/^(User\s+Story|Requirement|Timing:|FIXME|BR-\d)/i.test(nextTrimmed)) break;
          if (/^\|/.test(nextTrimmed)) break; // table row
          if (nextTrimmed.length === 0) break;

          // Continuation
          text += ' ' + nextTrimmed.replace(/^[*\-•]\s*/, '');
          li = li2;
        }

        if (text.length > 5) {
          const actorName = lp.actor === 'role' ? role : 'System';

          // Try to split text into action/result using sentence structure
          // Many patterns contain "...once X, the system Y" or "...status updates to Z"
          let actionText = text;
          let resultText = lp.resultHint;

          // Look for result indicators within the text
          const resultSplit = text.match(
            /^([\s\S]+?)(?:\.\s*(?:Status\s+updates?\s+to|Once\s+(?:approved|complete|ready|done)|The\s+booking\s+(?:will|can)|The\s+system)\s+([\s\S]+))$/i
          );
          if (resultSplit && resultSplit[1] && resultSplit[2]) {
            actionText = resultSplit[1].trim();
            resultText = resultSplit[2].trim().replace(/\.\s*$/, '');
          } else {
            // For "What I see" patterns, the whole text IS the result
            if (lp.pattern.source.includes('What')) {
              actionText = `Display: ${text.slice(0, 80)}`;
              resultText = text;
            }
            // For trigger patterns, text is the event
            if (lp.pattern.source.includes('Trigger')) {
              actionText = text;
              resultText = 'Process triggered';
            }
          }

          interactions.push({
            actor: actorName,
            action: actionText.slice(0, 200),
            result: resultText.slice(0, 200),
            sourceType: lp.sourceType,
          });
        }
        break; // Only match first pattern per line
      }
    }

    // Build the job
    const triggerInteraction = interactions.find((i) => i.sourceType === 'trigger');
    const trigger = triggerInteraction?.action ?? `${role} initiates the action`;
    const successOutcome = benefit || capability;

    const job: Job = {
      job_id: `job_us_${header.num}`,
      description: `As a ${role}, I want to ${capability}${benefit ? `, so that ${benefit}` : ''}`,
      trigger,
      success_outcome: successOutcome,
      priority: 'must',
    };

    stories.push({
      storyNum: header.num,
      title: header.title,
      role,
      capability,
      benefit,
      job,
      interactions,
    });
  }

  return stories;
}

/**
 * Parse "As a user, I can/want/need..." patterns from text.
 * Also handles numbered user stories like "#1 As a user..."
 * Enhanced to capture "so that [benefit]" as success outcome.
 */
function parseAsAUserPatterns(rawText: string): Job[] {
  const jobs: Job[] = [];
  const seenDescriptions = new Set<string>();
  
  // Enhanced pattern: capture "so that" clause across the same line or next line
  // IMPORTANT: Only match "As a" at the START of a line/bullet/number to avoid false positives
  // from prose like "...the logic to mark..." being misread as "As a logic, I can to mark..."
  const fullPattern = /(?:^|\n)\s*(?:[*•\-]\s*)?(?:#(\d+)\s*)?As\s+(?:a|an)\s+([\w\s]{2,30}?),?\s*I\s+(can|want|need|should|will)\s+(?:to\s+)?([\s\S]+?)(?:,\s*so\s+that\s+([\s\S]+?))?(?:\.\s*$|\.\s*\n|\n\n)/gim;
  
  let match;
  let jobIndex = 0;
  
  while ((match = fullPattern.exec(rawText)) !== null) {
    const storyNum = match[1] || String(++jobIndex);
    const role = match[2]?.trim().replace(/,\s*$/, '') ?? 'user';
    const verb = match[3] ?? 'can';
    const action = match[4]?.trim().replace(/,\s*$/, '') ?? '';
    const soThat = match[5]?.trim().replace(/\.\s*$/, '') ?? '';
    
    if (!action || action.length < 10) continue;
    
    // Construct full description including "so that" if present
    const description = soThat
      ? `As a ${role}, I ${verb} ${action}, so that ${soThat}`
      : `As a ${role}, I ${verb} ${action}`;
    
    // Skip duplicates
    const descKey = description.toLowerCase().replace(/\s+/g, ' ');
    if (seenDescriptions.has(descKey)) continue;
    seenDescriptions.add(descKey);
    
    // Extract trigger from nearby text (look for "Trigger:" within next few lines)
    const afterMatch = rawText.slice(match.index + match[0].length, match.index + match[0].length + 500);
    const triggerMatch = afterMatch.match(/Trigger:\s*(.+?)(?:\n|$)/i);
    
    let trigger = triggerMatch?.[1]?.trim() ?? '';
    if (!trigger) {
      // Determine trigger based on action keywords
      trigger = `${role} needs to perform this action`;
      if (/search|find|retrieve|look/i.test(action)) {
        trigger = `${role} searches for content`;
      } else if (/save|store|add|book/i.test(action)) {
        trigger = `${role} wants to save or book something`;
      } else if (/view|see|access|review/i.test(action)) {
        trigger = `${role} wants to review or access content`;
      } else if (/approv|confirm|submit/i.test(action)) {
        trigger = `${role} wants to approve or confirm`;
      }
    }
    
    // Use "so that" clause as success outcome if available, otherwise derive from action
    const successOutcome = soThat
      ? soThat.charAt(0).toUpperCase() + soThat.slice(1)
      : `${role} can successfully ${action.replace(/^(be able to|to)\s*/i, '').trim()}`;
    
    const job: Job = {
      job_id: `job_us_${storyNum}`,
      description,
      trigger,
      success_outcome: successOutcome,
      priority: 'must',
    };
    
    jobs.push(job);
  }
  
  // Fallback: simpler pattern for user stories without "so that"
  if (jobs.length === 0) {
    // Only match "As a" at start of line/bullet to avoid false positives from mid-sentence text
    const simplePattern = /(?:^|\n)\s*(?:[*•\-]\s*)?(?:#(\d+)\s*)?As\s+a\s+(\w+),?\s*(?:I\s+)?(can|want|need|should|will)?\s*([^.\n]+)/gi;
    while ((match = simplePattern.exec(rawText)) !== null) {
      const storyNum = match[1] || String(++jobIndex);
      const role = match[2] ?? 'user';
      const verb = match[3] ?? 'can';
      const action = match[4]?.trim() ?? '';
      if (!action || action.length < 10) continue;
      const description = `As a ${role}, I ${verb} ${action}`;
      const descKey = description.toLowerCase().replace(/\s+/g, ' ');
      if (seenDescriptions.has(descKey)) continue;
      seenDescriptions.add(descKey);
      const successOutcome = action.replace(/^(be able to|to)\s*/i, '').trim();
      jobs.push({
        job_id: `job_us_${storyNum}`,
        description,
        trigger: `${role} needs to perform this action`,
        success_outcome: `${role} ${verb} successfully ${successOutcome}`,
        priority: 'must',
      });
    }
  }
  
  return jobs;
}

/**
 * Extract jobs from User Stories / Use Cases sections in the PRD.
 * Handles both table format and inline "As a user" patterns.
 * Also checks subsections (e.g., "Confirmed Use Cases" within "Think It").
 */
function extractJobsFromUserStoriesSection(
  sectionMap: SectionMap,
  _openQuestions: string[]
): { jobs: Job[]; found: boolean } {
  const jobs: Job[] = [];
  const seenJobIds = new Set<string>();
  
  // Patterns to find user story sections (expanded to include common variations)
  const userStoryPatterns = [
    /use\s*cases?/i,                    // "Use Case", "Use Cases"
    /confirmed\s*use\s*cases?/i,        // "Confirmed Use Cases"
    /proposed\s*use\s*cases?/i,         // "Proposed Use Cases"
    /pilot\s*use\s*cases?/i,            // "Pilot Use Cases"
    /user\s*stor(y|ies)/i,              // "User Story", "User Stories"
    /user\s*scenarios?/i,               // "User Scenario", "User Scenarios"
    /acceptance\s*criteria/i,           // "Acceptance Criteria" (often contains user stories)
  ];
  
  // Helper function to process raw text and extract jobs
  const processRawText = (rawText: string) => {
    if (!rawText || rawText.trim().length < 20) return;
    
    const contentMatch = userStoryPatterns.some(p => p.test(rawText));
    const hasUserStories = /As\s+a\s+\w+,?\s*I\s+(can|want|need|should)/i.test(rawText);
    const hasStoryTable = /\|\s*#?\d*\s*\|.*\|.*user\s*story/i.test(rawText) || 
                          /\|\s*user\s*story\s*\|/i.test(rawText) ||
                          /\|\s*use\s*case\s*\|/i.test(rawText);  // Also detect "Use Case" column
    // Detect "User Story N:" labeled blocks (enterprise PRD format)
    const hasLabeledStories = /User\s+Story\s+\d+\s*:/i.test(rawText);
    
    if (!contentMatch && !hasUserStories && !hasStoryTable && !hasLabeledStories) return;
    
    // Priority 0: Try structured "User Story N:" blocks (enterprise PRD format with Trigger/My Action/System Action)
    if (hasLabeledStories) {
      const structuredStories = parseStructuredUserStoryBlocks(rawText);
      for (const story of structuredStories) {
        if (!seenJobIds.has(story.job.job_id)) {
          // Attach interaction data and title to the job for flow creation
          story.job._interactionSteps = story.interactions;
          story.job._storyTitle = story.title;
          seenJobIds.add(story.job.job_id);
          jobs.push(story.job);
        }
      }
      // If structured parsing found stories, skip less precise parsers for this text
      if (structuredStories.length > 0) return;
    }
    
    // Parse table format first (more structured)
    const tableJobs = parseUserStoryTable(rawText);
    for (const job of tableJobs) {
      if (!seenJobIds.has(job.job_id)) {
        seenJobIds.add(job.job_id);
        jobs.push(job);
      }
    }
    
    // Parse "As a user" patterns (may catch additional stories not in tables)
    const patternJobs = parseAsAUserPatterns(rawText);
    for (const job of patternJobs) {
      // Check for duplicate by comparing descriptions
      const isDuplicate = jobs.some(j => 
        j.description.toLowerCase().includes(job.description.toLowerCase().slice(0, 50)) ||
        job.description.toLowerCase().includes(j.description.toLowerCase().slice(0, 50))
      );
      if (!isDuplicate && !seenJobIds.has(job.job_id)) {
        // Renumber to avoid conflicts
        job.job_id = `job_us_pattern_${jobs.length + 1}`;
        jobs.push(job);
      }
    }
  };
  
  // Find relevant sections and subsections
  for (const section of sectionMap.sections) {
    const titleMatch = userStoryPatterns.some(p => p.test(section.section_title));
    const rawText = section.raw_text ?? '';
    
    // Process section if title matches or content contains user stories
    if (titleMatch) {
      processRawText(rawText);
    } else {
      // Even without title match, process if content contains user stories
      processRawText(rawText);
    }
    
    // Also check subsections (important for nested structures like "Think It > Confirmed Use Cases")
    for (const subsection of section.subsections ?? []) {
      const subTitleMatch = userStoryPatterns.some(p => p.test(subsection.subsection_title));
      const subRawText = subsection.raw_text ?? '';
      
      if (subTitleMatch) {
        processRawText(subRawText);
      } else {
        // Even without title match, process if content contains user stories
        processRawText(subRawText);
      }
    }
  }
  
  return { jobs, found: jobs.length > 0 };
}

/**
 * Parse requirements tables from PRD content.
 * Handles multiple table formats:
 * 1. Pipe-delimited: ID | Requirement | Priority | Notes  or  FR-01 | The page MUST... | P0 | ...
 * 2. Tab-separated: Category\tDetails\tResponsible\tLevel of Effort\tLevel of Importance\tNotes
 * 3. Effort estimate tables: Team\tDescription\tT-shirt size
 */
function parseRequirementsTable(rawText: string, existingJobs: Job[]): Job[] {
  // Try tab-separated table first (Category/Details format from Google Docs/Sheets)
  const tabJobs = parseTabSeparatedRequirementsTable(rawText, existingJobs);
  if (tabJobs.length > 0) return tabJobs;

  // Try effort estimate table (Team/Description/T-shirt format)
  const effortJobs = parseEffortEstimateTable(rawText, existingJobs);
  if (effortJobs.length > 0) return effortJobs;

  // Fall back to pipe-delimited table
  return parsePipeDelimitedRequirementsTable(rawText, existingJobs);
}

/**
 * Parse tab-separated requirement tables with columns like:
 * Category | Details | Responsible | Level of Effort | Level of Importance | Notes
 * Supports both horizontal (true tab-separated rows) and vertical (Google Docs export) formats.
 * 
 * Google Docs vertical format looks like:
 *   Category              ← header (no leading tab)
 *   \tDetails             ← header (tab-indented)
 *   \tResponsible         ← header (tab-indented)
 *   \tCreate new offer... ← first data row cell
 *   \tThis new offer...   ← second cell
 *   ...
 */
function parseTabSeparatedRequirementsTable(rawText: string, existingJobs: Job[]): Job[] {
  // Try horizontal format first (true tab-separated rows)
  const horizontalJobs = parseHorizontalTabTable(rawText, existingJobs);
  if (horizontalJobs.length > 0) return horizontalJobs;

  // Try vertical Google Docs format
  return parseVerticalGoogleDocsTable(rawText, existingJobs);
}

/**
 * Parse horizontal tab-separated tables (each row on one line with tab-separated cells).
 */
function parseHorizontalTabTable(rawText: string, existingJobs: Job[]): Job[] {
  const jobs: Job[] = [];
  const lines = rawText.split('\n');

  // Find header row with multiple tabs on a single line
  let headerRowIndex = -1;
  let categoryColIndex = -1;
  let detailsColIndex = -1;
  let responsibleColIndex = -1;
  let effortColIndex = -1;
  let importanceColIndex = -1;
  let notesColIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    // Horizontal format: header has multiple tabs on one line
    const tabCount = (line.match(/\t/g) || []).length;
    if (tabCount < 2) continue;

    const cells = line.split('\t').map(c => c.trim().toLowerCase());
    
    const catIdx = cells.findIndex(c =>
      c === 'category' || c === 'work item' || c === 'item' || c === 'task' || c === 'feature'
    );
    const detIdx = cells.findIndex(c =>
      c === 'details' || c === 'description' || c === 'requirement' || c === 'scope'
    );

    if (catIdx >= 0 && detIdx >= 0) {
      headerRowIndex = i;
      categoryColIndex = catIdx;
      detailsColIndex = detIdx;
      responsibleColIndex = cells.findIndex(c => c === 'responsible' || c === 'owner' || c === 'assigned to');
      effortColIndex = cells.findIndex(c => /effort|size|estimate/i.test(c));
      importanceColIndex = cells.findIndex(c => /importance|priority|criticality/i.test(c));
      notesColIndex = cells.findIndex(c => /notes?|comments?/i.test(c));
      break;
    }
    
    // Also check for Team/Description effort table headers
    const teamIdx = cells.findIndex(c => c === 'team' || c === 'squad');
    const descIdx = cells.findIndex(c => /description|work\s*required/i.test(c));
    if (teamIdx >= 0 && descIdx >= 0) {
      headerRowIndex = i;
      categoryColIndex = teamIdx;
      detailsColIndex = descIdx;
      effortColIndex = cells.findIndex(c => /effort|size|estimate|t-shirt/i.test(c));
      break;
    }
  }

  if (headerRowIndex < 0) return jobs;

  let reqIndex = 0;
  for (let i = headerRowIndex + 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const tabCount = (line.match(/\t/g) || []).length;
    if (tabCount < 1) continue;

    const cells = line.split('\t').map(c => c.trim());
    const category = cells[categoryColIndex] ?? '';
    const details = cells[detailsColIndex] ?? '';

    if (!category && !details) continue;
    const jobTitle = category || `Requirement ${reqIndex + 1}`;
    const jobDetails = details || category;
    if (jobDetails.length < 10) continue;

    const isDuplicate = existingJobs.some(j =>
      j.description.toLowerCase().includes(jobTitle.toLowerCase().slice(0, 25))
    ) || jobs.some(j =>
      j.description.toLowerCase().includes(jobTitle.toLowerCase().slice(0, 25))
    );
    if (isDuplicate) continue;

    reqIndex++;
    const importanceText = (importanceColIndex >= 0 ? cells[importanceColIndex] : '') ?? '';
    const notesText = (notesColIndex >= 0 ? cells[notesColIndex] : '') ?? '';
    const effortText = (effortColIndex >= 0 ? cells[effortColIndex] : '') ?? '';
    const responsibleText = (responsibleColIndex >= 0 ? cells[responsibleColIndex] : '') ?? '';

    let priority: 'must' | 'should' | 'could' = 'should';
    if (/high|must|critical|p0|p1/i.test(importanceText) || /must[\s-]*do/i.test(notesText)) priority = 'must';
    else if (/low|could|optional/i.test(importanceText)) priority = 'could';

    const cleanId = jobTitle.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase().slice(0, 40);
    jobs.push({
      job_id: `job_req_tab_${cleanId || reqIndex}`,
      description: `${jobTitle}: ${jobDetails.slice(0, 250)}`,
      trigger: responsibleText
        ? `${responsibleText} needs to deliver this (effort: ${effortText || 'TBD'})`
        : `Team needs to deliver this requirement (effort: ${effortText || 'TBD'})`,
      success_outcome: `${jobTitle} completed successfully`,
      priority,
    });
  }

  return jobs;
}

/**
 * Parse vertical Google Docs table format where each cell is on its own line.
 * Pattern: header cells appear first (some tab-indented), then data cells repeat
 * in the same column order, tab-indented.
 * 
 * Detects tables with known header patterns like:
 *   Category / Details / Responsible / Level of Effort / Level of Importance / Notes
 *   Team / HL Description / T-shirt size
 *   Field / Description / Notes
 */
function parseVerticalGoogleDocsTable(rawText: string, existingJobs: Job[]): Job[] {
  const jobs: Job[] = [];
  const lines = rawText.split('\n');

  // Detect vertical table headers by looking for known header words on consecutive lines
  // The first header may or may not be tab-indented; subsequent headers are tab-indented
  let headerStartIndex = -1;
  let headerLabels: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim().toLowerCase();
    
    // Look for Category/Details table
    if (line === 'category') {
      const nextLines = collectTabIndentedLabels(lines, i + 1);
      if (nextLines.some(l => /^details$/i.test(l)) || nextLines.some(l => /^description$/i.test(l))) {
        headerStartIndex = i;
        headerLabels = ['category', ...nextLines.map(l => l.toLowerCase())];
        break;
      }
    }
    // Look for Team/Description effort table
    if (line === 'team') {
      const nextLines = collectTabIndentedLabels(lines, i + 1);
      if (nextLines.some(l => /description|work\s*required/i.test(l))) {
        headerStartIndex = i;
        headerLabels = ['team', ...nextLines.map(l => l.toLowerCase())];
        break;
      }
    }
    // Look for Field/Description identification table
    if (line === 'field') {
      const nextLines = collectTabIndentedLabels(lines, i + 1);
      if (nextLines.some(l => /^description$/i.test(l))) {
        headerStartIndex = i;
        headerLabels = ['field', ...nextLines.map(l => l.toLowerCase())];
        break;
      }
    }
  }

  if (headerStartIndex < 0 || headerLabels.length < 2) return jobs;

  const numCols = headerLabels.length;

  // Verify we have at least a category or details column
  const catIdx = headerLabels.findIndex(h => /^(category|team|field|item|task|feature)$/i.test(h));
  const detIdx = headerLabels.findIndex(h => /^(details|description|hl description.*|scope)$/i.test(h));

  if (catIdx < 0 && detIdx < 0) return jobs;

  // Parse data cells after the headers
  // In Google Docs vertical export, tab-indented lines are cell values.
  // Non-tab lines are multi-line content within a cell or separators.
  // Rows don't have a fixed number of cells, so we detect row boundaries
  // by identifying "category" cells (short titles that start a new row).
  const dataStartIndex = headerStartIndex + numCols;
  const tabCells: string[] = [];

  for (let i = dataStartIndex; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    if (line.startsWith('\t') && trimmed.length > 0) {
      tabCells.push(trimmed);
    }
  }

  // Now group tab cells into rows by detecting "category" cells.
  // A category cell is a short-ish title that doesn't look like a detail/metadata value.
  // Detail cells are longer descriptions, "(see grouped rows)", effort sizes, importance levels, etc.
  function looksLikeCategoryCell(cell: string): boolean {
    if (cell.length > 80) return false;
    if (cell.length < 3) return false;
    // Skip known non-category patterns
    if (/^\(see\s/i.test(cell)) return false;
    if (/^(S|M|L|XS|XL|S-M|M-L|TBD)$/i.test(cell)) return false;
    if (/^(S|M|L)\s*[-–]/i.test(cell)) return false;
    if (/^(High|Medium|Low|Critical)/i.test(cell)) return false;
    if (/^(The |This |For |A |An |In |It |There |Some |Longer |Business |Drew )/i.test(cell)) return false;
    if (/^(Finance)/i.test(cell)) return false;
    if (/^(One of|True |False |See |Whether )/i.test(cell)) return false;
    if (/^X$/i.test(cell)) return false;
    // Category cells typically: start with uppercase, are action-oriented or noun phrases
    return /^[A-Z]/.test(cell);
  }

  // Build rows: each row starts with a category cell
  type TableRow = { category: string; cells: string[] };
  const rows: TableRow[] = [];

  for (let i = 0; i < tabCells.length; i++) {
    const cell = tabCells[i]!;
    if (looksLikeCategoryCell(cell) && (rows.length === 0 || rows[rows.length - 1]!.cells.length >= 1)) {
      rows.push({ category: cell, cells: [] });
    } else if (rows.length > 0) {
      rows[rows.length - 1]!.cells.push(cell);
    }
  }

  // Convert rows to jobs
  let reqIndex = 0;
  for (const row of rows) {
    const jobTitle = row.category;
    // First non-category cell is typically the "Details" column
    const jobDetails = row.cells[0] ?? '';
    // Look for responsible, effort, and importance in remaining cells
    let responsible = '';
    let effort = '';
    let importance = '';
    
    for (const cell of row.cells.slice(1)) {
      if (/^(Finance|\(see grouped)/i.test(cell)) {
        responsible = responsible || cell;
      } else if (/^(S|M|L|XS|XL|S-M|M-L|TBD)/i.test(cell)) {
        effort = effort || cell;
      } else if (/^(High|Medium|Low|Critical)/i.test(cell)) {
        importance = importance || cell;
      }
    }

    // Skip empty or trivially short entries
    if (jobDetails.length < 5 && jobTitle.length < 5) continue;

    // Check for duplicates
    const isDuplicate = existingJobs.some(j =>
      j.description.toLowerCase().includes(jobTitle.toLowerCase().slice(0, 20))
    ) || jobs.some(j =>
      j.description.toLowerCase().includes(jobTitle.toLowerCase().slice(0, 20))
    );
    if (isDuplicate) continue;

    reqIndex++;
    let priority: 'must' | 'should' | 'could' = 'should';
    const allText = `${importance} ${row.cells.join(' ')}`;
    if (/high|must[\s-]*do|critical/i.test(allText)) priority = 'must';
    else if (/low|could|optional/i.test(importance)) priority = 'could';

    const cleanId = jobTitle.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase().slice(0, 40);

    jobs.push({
      job_id: `job_req_tab_${cleanId || reqIndex}`,
      description: `${jobTitle}: ${(jobDetails || jobTitle).slice(0, 250)}`,
      trigger: responsible && !/^\(see/i.test(responsible)
        ? `${responsible} needs to deliver this (effort: ${effort || 'TBD'})`
        : `Team needs to deliver this requirement (effort: ${effort || 'TBD'})`,
      success_outcome: `${jobTitle} completed successfully`,
      priority,
    });
  }

  return jobs;
}

/** Collect consecutive tab-indented non-empty lines starting from index i. */
function collectTabIndentedLabels(lines: string[], startIndex: number): string[] {
  const labels: string[] = [];
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.startsWith('\t') && line.trim().length > 0) {
      labels.push(line.trim());
    } else if (line.trim().length === 0) {
      continue; // skip blank lines between headers
    } else {
      break; // non-tab, non-empty = end of headers
    }
  }
  return labels;
}

/**
 * Parse effort estimate tables (kept for backward compatibility with horizontal format).
 */
function parseEffortEstimateTable(_rawText: string, _existingJobs: Job[]): Job[] {
  // Effort estimate tables are now handled by both horizontal and vertical parsers above
  return [];
}

/**
 * Parse pipe-delimited requirements tables.
 * Handles: ID | Requirement | Priority | Notes  or  FR-01 | The page MUST... | P0 | ...
 */
function parsePipeDelimitedRequirementsTable(rawText: string, existingJobs: Job[]): Job[] {
  const jobs: Job[] = [];
  const lines = rawText.split('\n');
  
  // Find table header row - look for requirements table headers
  let headerRowIndex = -1;
  let idColIndex = -1;
  let reqColIndex = -1;
  let priorityColIndex = -1;
  let notesColIndex = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (!line.includes('|')) continue;
    
    const cells = line.split('|').map(c => c.trim().toLowerCase());
    
    // Look for ID column (ID, #, FR, Req ID, etc.)
    const idIdx = cells.findIndex(c => 
      c === 'id' || c === '#' || /^(req|fr|nr|tr)[\s-]*id$/i.test(c) || c === 'requirement id'
    );
    
    // Look for requirement/description column
    const reqIdx = cells.findIndex(c => 
      c === 'requirement' || c === 'description' || c === 'req' || c.includes('must') || c.includes('should')
    );
    
    // If we found a requirement column header, use it
    if (reqIdx >= 0) {
      headerRowIndex = i;
      idColIndex = idIdx >= 0 ? idIdx : 0;
      reqColIndex = reqIdx;
      priorityColIndex = cells.findIndex(c => c === 'priority' || c.startsWith('p'));
      notesColIndex = cells.findIndex(c => c.includes('note'));
      break;
    }
  }
  
  // If no header found but there are rows with FR-XX pattern, try to parse anyway
  if (headerRowIndex < 0) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      if (/\|\s*FR-\d+\s*\|/i.test(line) || /\|\s*REQ-\d+\s*\|/i.test(line)) {
        // Found a requirement row, assume simple format: | ID | Requirement | Priority | Notes |
        headerRowIndex = i - 1; // Assume header is one row before
        idColIndex = 1; // Skip first empty cell
        reqColIndex = 2;
        priorityColIndex = 3;
        notesColIndex = 4;
        break;
      }
    }
  }
  
  if (headerRowIndex < 0) {
    return jobs;
  }
  
  // Parse data rows
  let reqIndex = 0;
  for (let i = headerRowIndex + 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (!line.includes('|')) continue;
    
    // Skip separator rows (e.g., |---|---|---|)
    if (/^\s*\|[\s\-:]+\|/.test(line)) continue;
    
    const cells = line.split('|').map(c => c.trim());
    
    // Get requirement ID
    let reqId = cells[idColIndex] ?? '';
    const reqText = cells[reqColIndex] ?? '';
    
    // Skip empty rows or header rows
    if (!reqText || reqText.toLowerCase() === 'requirement' || reqText === '-') continue;
    
    // Extract FR-XX or REQ-XX pattern from ID column
    const idMatch = reqId.match(/(FR|REQ|NR|TR)-(\d+)/i);
    if (idMatch && idMatch[1] && idMatch[2]) {
      reqId = idMatch[1].toUpperCase() + '-' + idMatch[2];
    } else {
      reqIndex++;
      reqId = `REQ-${reqIndex}`;
    }
    
    // Check for duplicate
    const isDuplicate = existingJobs.some(j => 
      j.description.toLowerCase().includes(reqText.toLowerCase().slice(0, 30))
    );
    if (isDuplicate) continue;
    
    // Get priority
    const priorityText = cells[priorityColIndex] ?? '';
    let priority: 'must' | 'should' | 'could' = 'should';
    if (/p0|p1|must|critical|high/i.test(priorityText) || /\bMUST\b/.test(reqText)) {
      priority = 'must';
    } else if (/could|low|optional/i.test(priorityText)) {
      priority = 'could';
    }
    
    // Get notes
    const notesText = cells[notesColIndex] ?? '';
    
    // Create job from requirement
    jobs.push({
      job_id: `job_req_${reqId.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`,
      description: `${reqId}: ${reqText}`,
      trigger: notesText || 'System must satisfy this requirement',
      success_outcome: reqText.replace(/^The\s+(?:page|system|app)\s+/i, '').trim(),
      priority,
    });
  }
  
  return jobs;
}

/**
 * Extract FR3-style functional requirements (FR3.0, FR3.1, etc.) from PRD text.
 * User Stories = Jobs to be Done. Each User Story becomes one job with detailed step-by-step flow.
 * Produces jobs with rich _interactionSteps from Trigger, What, Acceptance Criteria, Buttons, Edge Cases.
 *
 * Note: Sectionizer treats #### FR3.X as section headings, so raw_text excludes the header.
 * We find FR3 blocks via (a) section titles matching FR3.X, (b) raw text regex as fallback.
 */
function extractJobsFromFr3StyleRequirements(sectionMap: SectionMap, existingJobs: Job[]): Job[] {
  const jobs: Job[] = [];
  const allText = sectionMap.sections
    .flatMap(s => [
      s.raw_text ?? '',
      ...(s.subsections ?? []).map(ss => ss.raw_text ?? ''),
    ])
    .join('\n\n');

  // Source 1: Sections whose title matches FR3.X or FR-X (sectionizer splits on #### FR3.X)
  const frSectionPattern = /^FR3\.(\d+)\s*:\s*(.+)$/i;
  const blocksFromSections: Array<{ num: string; title: string; blockText: string }> = [];
  for (const section of sectionMap.sections) {
    const titleMatch = (section.section_title ?? '').match(frSectionPattern);
    if (titleMatch && section.raw_text && section.raw_text.trim().length > 30) {
      blocksFromSections.push({
        num: titleMatch[1] ?? '',
        title: (titleMatch[2] ?? '').trim(),
        blockText: section.raw_text.trim(),
      });
    }
  }
  for (const sub of sectionMap.sections.flatMap(s => s.subsections ?? [])) {
    const titleMatch = (sub.subsection_title ?? '').match(frSectionPattern);
    if (titleMatch && sub.raw_text && sub.raw_text.trim().length > 30) {
      blocksFromSections.push({
        num: titleMatch[1] ?? '',
        title: (titleMatch[2] ?? '').trim(),
        blockText: sub.raw_text.trim(),
      });
    }
  }

  // Source 2: Regex on raw text (when FR3.X is not a section boundary, e.g. in Bucket content)
  const frBlockPattern = /(?:^|\n)\s*(?:####\s+)?(?:FR3\.|FR-)(\d+)\s*:\s*([^\n]+)/g;
  const matches: Array<{ num: string; title: string; index: number; matchEnd: number }> = [];
  let m;
  while ((m = frBlockPattern.exec(allText)) !== null) {
    matches.push({
      num: m[1] ?? '',
      title: (m[2] ?? '').trim(),
      index: m.index,
      matchEnd: m.index + m[0].length,
    });
  }
  const blocksFromRegex = matches.map((match, i) => ({
    num: match.num,
    title: match.title,
    blockText: allText.slice(match.matchEnd, i < matches.length - 1 ? matches[i + 1]!.index : allText.length).trim(),
  }));

  // Prefer sections (they have correct boundaries); merge with regex only for numbers not in sections
  const seenNums = new Set(blocksFromSections.map(b => b.num));
  const blocks = [
    ...blocksFromSections,
    ...blocksFromRegex.filter(b => !seenNums.has(b.num) && b.blockText.length > 50),
  ].sort((a, b) => parseInt(a.num, 10) - parseInt(b.num, 10));

  for (const block of blocks) {
    const blockText = block.blockText;
    if (blockText.length < 50) continue;

    const whatMatch = blockText.match(/\*\*What:\*\*\s*([\s\S]+?)(?=\n\s*\*\*[A-Z]|$)/i);
    const triggerMatch = blockText.match(/\*\*Trigger:\*\*\s*([\s\S]+?)(?=\n\s*\*\*[A-Z]|$)/i);
    // User Story: "As a X, I want to Y, so that Z" — multiline "**As a** X **I want to** Y **So that** Z"
    const userStoryMatch = blockText.match(
      /(?:As\s+(?:a|an)\s+([^,\n]+),?\s*)?(?:I\s+(?:want|need|can)\s+(?:to\s+)?([\s\S]+?))(?:,\s*so\s+that\s+([\s\S]+?))?(?=\.\s*\n|\.\s*$|\n\n)/im
    );
    const userStoryWant = blockText.match(/\*\*I\s+want\s+to\*\*\s*([^\n*]+?)(?=\n|\*\*|$)/i);
    const userStorySoThat = blockText.match(/\*\*So\s+that\*\*\s*([^\n*]+?)(?=\n|\*\*|$)/i);
    const asAMatch = blockText.match(/\*\*As\s+(?:a|an)\*\*\s*([^\n*]+?)(?=\n|\*\*)/i);
    const role = (userStoryMatch?.[1] ?? asAMatch?.[1])?.trim() ?? 'Creator';
    const capability =
      (userStoryMatch?.[2] ?? userStoryWant?.[1])?.trim().replace(/\s+/g, ' ').slice(0, 150) ?? '';
    const benefit =
      (userStoryMatch?.[3] ?? userStorySoThat?.[1])?.trim().replace(/\s+/g, ' ').slice(0, 120) ?? '';
    const what = (whatMatch?.[1] ?? '').trim().replace(/\s+/g, ' ').slice(0, 200) ?? '';
    const trigger = (triggerMatch?.[1] ?? '').trim().replace(/\s+/g, ' ').slice(0, 180) ?? '';

    const jobId = `job_fr3_${block.num}`;
    if (existingJobs.some(j => j.job_id === jobId)) continue;

    const description = capability
      ? `As a ${role}, I want to ${capability}${benefit ? `, so that ${benefit}` : ''}`
      : `FR3.${block.num}: ${block.title} — ${what || 'See requirement.'}`;

    const interactions: Array<{ actor: string; action: string; result: string; sourceType?: string }> = [];

    // Step 1: Trigger (when does this flow start)
    if (trigger) {
      interactions.push({
        actor: 'System',
        action: trigger,
        result: `Flow is initiated: ${block.title}`,
        sourceType: 'trigger',
      });
    }

    // Step 2: What (main behavior) — only if it adds distinct value from AC
    if (what && !interactions.some(i => i.action.includes(what.slice(0, 40)))) {
      interactions.push({
        actor: role,
        action: what,
        result: 'Primary requirement is met',
        sourceType: 'what',
      });
    }

    // Steps from Dialog/Modal/Body content (creator sees content)
    const bodyMatch = blockText.match(/\*\*(?:Body|Dialog\s+Content|Modal\s+Content|Title)\*\*\s*[:\s]*\n?([^\n*]+(?:\n(?!\*\*)[^\n*]*)*)/i);
    if (bodyMatch?.[1]) {
      const bodyPreview = bodyMatch[1].trim().replace(/\s+/g, ' ').slice(0, 100);
      interactions.push({
        actor: 'System',
        action: `Displays: ${bodyPreview}`,
        result: `${role} sees dialog or modal content`,
        sourceType: 'dialog_content',
      });
    }

    // Steps from Buttons (explicit user actions)
    const buttonsMatch = blockText.match(/\*\*Buttons?:\*\*\s*[:\s]*\n?([\s\S]+?)(?=\n\s*\*\*[A-Z]|\n\n\n|$)/i);
    if (buttonsMatch?.[1]) {
      const buttonLines = buttonsMatch[1].match(/\[\s*([^\]]+?)\s*\]/g) ?? [];
      for (const btn of buttonLines.slice(0, 4)) {
        const label = btn?.replace(/^\[\s*|\s*\]$/g, '').trim() ?? '';
        if (label.length > 2 && label.length < 50) {
          interactions.push({
            actor: role,
            action: `Clicks "${label}"`,
            result: label.toLowerCase().includes('cancel') || label.toLowerCase().includes('back') || label.toLowerCase().includes('go back')
              ? 'Returns to previous screen or cancels'
              : label.toLowerCase().includes('continue') || label.toLowerCase().includes('confirm')
                ? 'Proceeds to next step'
                : 'Action completed',
            sourceType: 'button',
          });
        }
      }
    }

    // Steps from Checkbox (required confirmation)
    const checkboxMatch = blockText.match(/\*\*Checkbox:\*\*\s*[:\s]*\n?[-*•]?\s*(.+?)(?=\n\s*\*\*|\n\n|$)/i);
    if (checkboxMatch?.[1]) {
      const cbText = checkboxMatch[1].trim().slice(0, 100);
      interactions.push({
        actor: role,
        action: `Checks: ${cbText}`,
        result: 'Confirmation required to proceed',
        sourceType: 'checkbox',
      });
    }

    // ALL Acceptance Criteria as detailed flow steps (no limit)
    const acSection = blockText.match(/\*\*Acceptance\s+Criteria:\*\*\s*([\s\S]+?)(?=\n\s*\*\*(?:Edge|Success|User\s+Story|Wireframe)|$)/i);
    const acText = acSection?.[1] ?? blockText;
    const acPattern = /[-*•]\s*(?:✅\s*)?([^\n]+)/g;
    let acMatch;
    const seenAc = new Set<string>();
    while ((acMatch = acPattern.exec(acText)) !== null) {
      const ac = acMatch[1]?.trim() ?? '';
      const acNorm = ac.toLowerCase().slice(0, 60);
      if (
        ac.length >= 12 &&
        ac.length <= 180 &&
        !/^(?:See|Wireframe|Edge|Success|User Story|Note:)/i.test(ac) &&
        !seenAc.has(acNorm)
      ) {
        seenAc.add(acNorm);
        const isCreatorAction = /clicks?|enters?|selects?|checks?|confirms?|submits?|chooses?|reviews?|views?|(?:creator|user)\s+(?:clicks?|enters?|must|can)/i.test(ac);
        const actor = isCreatorAction ? role : 'System';
        let result = 'Step complete';
        if (/proceed|continue|enabled|allow/i.test(ac)) result = 'User can proceed';
        else if (/return|go back|cancel|abandon/i.test(ac)) result = 'Returns to previous screen';
        else if (/disable|greyed|locked/i.test(ac)) result = 'Action blocked until condition met';
        else if (/appears?|shown|displayed|visible/i.test(ac)) result = 'Content displayed';
        else if (/required|must|cannot skip/i.test(ac)) result = 'Requirement enforced';
        interactions.push({
          actor,
          action: ac.replace(/^(?:Dialog|Modal|Button|Creator|User|System)\s+/i, ''),
          result,
          sourceType: 'acceptance_criteria',
        });
      }
    }

    // Edge Cases as alternate-path steps
    const edgeSection = blockText.match(/\*\*Edge\s+Cases:\*\*\s*([\s\S]+?)(?=\n\s*\*\*[A-Z]|\n\n\n|$)/i);
    if (edgeSection?.[1]) {
      const edgeLines = edgeSection[1].match(/[-*•]\s*([^\n]+)/g) ?? [];
      for (const line of edgeLines.slice(0, 4)) {
        const edge = line?.replace(/^[-*•]\s*/, '').trim() ?? '';
        const arrowMatch = edge.match(/^([^→]+)\s*[→]\s*(.+)$/) ?? edge.match(/^([^–-]+)\s*[-–]\s*(.+)$/);
        if (arrowMatch && arrowMatch[1] && arrowMatch[2] && edge.length < 150) {
          interactions.push({
            actor: role,
            action: arrowMatch[1].trim(),
            result: arrowMatch[2].trim(),
            sourceType: 'edge_case',
          });
        }
      }
    }

    if (interactions.length === 0 && (what || capability)) {
      interactions.push({
        actor: role,
        action: what || capability || block.title,
        result: benefit || 'Requirement satisfied',
        sourceType: 'fallback',
      });
    }

    jobs.push({
      job_id: jobId,
      description,
      trigger: trigger || `Creator initiates ${block.title}`,
      success_outcome: benefit || `${block.title} completed`,
      priority: 'must',
      _interactionSteps: interactions,
      _storyTitle: `${block.title} (FR3.${block.num})`,
    });
  }

  return jobs;
}

/**
 * Extract standalone User Stories from the full PRD (As a X, I want to Y, so that Z).
 * These become Jobs to be Done when not already captured by FR3 blocks.
 */
function extractStandaloneUserStoriesAsJobs(sectionMap: SectionMap, existingJobs: Job[]): Job[] {
  const jobs: Job[] = [];
  const allText = sectionMap.sections
    .flatMap(s => [s.raw_text ?? '', ...(s.subsections ?? []).map(ss => ss.raw_text ?? '')])
    .join('\n\n');

  const fullPattern =
    /(?:^|\n)\s*(?:[*•\-]\s*)?(?:As\s+(?:a|an)\s+([^,\n]+),?\s*)?I\s+(?:want|need|can)\s+(?:to\s+)?([\s\S]+?)(?:,\s*so\s+that\s+([\s\S]+?))?(?=\.\s*\n|\.\s*$|\n\n)/gim;
  const seenCapability = new Set<string>();

  for (const job of existingJobs) {
    const cap = (job.description ?? '').toLowerCase();
    if (cap.includes('i want to') || cap.includes('i need to')) {
      const m = cap.match(/i\s+(?:want|need)\s+to\s+(.+?)(?:,|\.|$)/);
      if (m?.[1]) seenCapability.add(m[1].slice(0, 50));
    }
  }

  let match;
  let idx = 0;
  while ((match = fullPattern.exec(allText)) !== null) {
    const role = (match[1] ?? 'User').trim();
    const capability = (match[2] ?? '').trim().replace(/\s+/g, ' ').slice(0, 150);
    const benefit = (match[3] ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
    if (capability.length < 10) continue;
    const capKey = capability.toLowerCase().slice(0, 50);
    if (seenCapability.has(capKey)) continue;
    seenCapability.add(capKey);

    const blockStart = Math.max(0, match.index - 500);
    const blockEnd = Math.min(allText.length, match.index + match[0].length + 800);
    const context = allText.slice(blockStart, blockEnd);

    const interactions: Array<{ actor: string; action: string; result: string; sourceType?: string }> = [];
    interactions.push({
      actor: role,
      action: capability,
      result: benefit || 'Goal achieved',
      sourceType: 'user_story',
    });

    const contextBullets = context.match(/[-*•]\s*(?:✅\s*)?([^\n]{15,120})/g) ?? [];
    for (const b of contextBullets.slice(0, 6)) {
      const text = b?.replace(/^[-*•]\s*(?:✅\s*)?/, '').trim() ?? '';
      if (text && !/^(?:See|Wireframe|Edge|Success)/i.test(text) && !interactions.some(i => i.action.includes(text.slice(0, 30)))) {
        interactions.push({
          actor: /clicks?|enters?|selects?|checks?|user|creator/i.test(text) ? role : 'System',
          action: text,
          result: 'Step complete',
          sourceType: 'context',
        });
      }
    }

    idx++;
    jobs.push({
      job_id: `job_us_standalone_${idx}`,
      description: `As a ${role}, I want to ${capability}${benefit ? `, so that ${benefit}` : ''}`,
      trigger: `${role} initiates action`,
      success_outcome: benefit || capability,
      priority: 'should',
      _interactionSteps: interactions,
      _storyTitle: capability.slice(0, 60),
    });
  }

  return jobs;
}

/**
 * Extract requirements from Requirements sections and add them as additional jobs.
 * This captures specific technical or business requirements that should be tracked.
 * Also handles table-based requirements (FR-01, FR-02 format) and subsections.
 */
function extractJobsFromRequirementsSection(
  sectionMap: SectionMap,
  existingJobs: Job[]
): Job[] {
  const jobs: Job[] = [];
  
  // Find Requirements sections (including nested subsections)
  let rawText = '';
  
  // Check top-level sections
  const requirementsSection = sectionMap.sections.find(s => 
    /^requirements$/i.test(s.section_title) ||
    /^functional\s*requirements$/i.test(s.section_title) ||
    /^technical\s*requirements$/i.test(s.section_title)
  );
  
  if (requirementsSection?.raw_text) {
    rawText = requirementsSection.raw_text;
  } else {
    // Check subsections within other sections (e.g., "Think It > Requirements")
    for (const section of sectionMap.sections) {
      for (const subsection of section.subsections ?? []) {
        if (/^requirements$/i.test(subsection.subsection_title) ||
            /requirements/i.test(subsection.subsection_title)) {
          if (subsection.raw_text && subsection.raw_text.length > rawText.length) {
            rawText = subsection.raw_text;
          }
        }
      }
      // Also check if the section content contains requirements table (pipe or tab-delimited)
      const sectionText = section.raw_text ?? '';
      if (sectionText.includes('| FR-') || sectionText.includes('| Requirement')) {
        if (sectionText.length > rawText.length) {
          rawText = sectionText;
        }
      }
    }
  }
  
  // Also scan "Think It", "Understand It", and "Effort Estimate" sections for tabular requirements
  // These sections commonly contain tab-separated tables in FinE PRDs
  const tabularSections: string[] = [];
  for (const section of sectionMap.sections) {
    const title = section.section_title.toLowerCase();
    const text = section.raw_text ?? '';
    const hasTabTable = text.includes('\t') && text.split('\n').filter(l => l.includes('\t')).length >= 3;
    
    if (hasTabTable && (
      /think\s*it/i.test(title) ||
      /understand\s*it/i.test(title) ||
      /effort\s*estimate/i.test(title) ||
      /requirements/i.test(title) ||
      /identification\s*requirements/i.test(title)
    )) {
      tabularSections.push(text);
    }
  }
  
  // Try to parse tabular requirements from lifecycle sections
  for (const tabText of tabularSections) {
    const tabJobs = parseRequirementsTable(tabText, [...existingJobs, ...jobs]);
    if (tabJobs.length > 0) {
      jobs.push(...tabJobs);
    }
  }
  
  // If we already found tabular jobs, return them
  if (jobs.length > 0) {
    return jobs;
  }
  
  if (!rawText) {
    return jobs;
  }
  
  const lines = rawText.split('\n');
  
  // First, try to parse requirements table (FR-01, FR-02, or tab-separated format)
  const tableJobs = parseRequirementsTable(rawText, existingJobs);
  if (tableJobs.length > 0) {
    return tableJobs;
  }
  
  let reqIndex = 0;
  let currentReqTitle = '';
  let currentReqContent: string[] = [];
  
  const saveRequirement = () => {
    if (currentReqTitle && currentReqContent.length > 0) {
      // Check if this requirement is already covered by an existing job
      const isDuplicate = existingJobs.some(j => 
        j.description.toLowerCase().includes(currentReqTitle.toLowerCase().slice(0, 30))
      );
      
      if (!isDuplicate) {
        reqIndex++;
        const content = currentReqContent.join(' ').trim();
        jobs.push({
          job_id: `job_req_${reqIndex}`,
          description: `${currentReqTitle}: ${content.slice(0, 150)}`,
          trigger: 'System or user requires this capability',
          success_outcome: `${currentReqTitle} requirement is satisfied`,
          priority: 'should',
        });
      }
    }
    currentReqTitle = '';
    currentReqContent = [];
  };
  
  for (const line of lines) {
    const trimmed = (line ?? '').trim();
    if (!trimmed) continue;
    
    // Check for requirement header (e.g., "Indexing thresholds:", "Searchable fields:")
    const headerMatch = trimmed.match(/^([A-Z][^:]+):\s*(.*)$/);
    if (headerMatch) {
      saveRequirement();
      currentReqTitle = headerMatch[1]?.trim() ?? '';
      if (headerMatch[2]) {
        currentReqContent.push(headerMatch[2].trim());
      }
      continue;
    }
    
    // Check for bold header (e.g., "**Indexing thresholds**")
    const boldMatch = trimmed.match(/^\*\*([^*]+)\*\*:?\s*(.*)$/);
    if (boldMatch) {
      saveRequirement();
      currentReqTitle = boldMatch[1]?.trim() ?? '';
      if (boldMatch[2]) {
        currentReqContent.push(boldMatch[2].trim());
      }
      continue;
    }
    
    // Collect content under current requirement
    if (currentReqTitle) {
      // Handle bullet points
      const bulletContent = trimmed.replace(/^[-•*]\s*/, '').trim();
      if (bulletContent) {
        currentReqContent.push(bulletContent);
      }
    }
  }
  
  // Save last requirement
  saveRequirement();
  
  return jobs;
}

/**
 * Extract "must" requirement statements from a section's text.
 * Filters out stakeholder tags, placeholders, and short notes.
 */
function extractMustStatements(text: string): string[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const statements: string[] = [];

  for (const line of lines) {
    // Skip stakeholder tag lines (e.g., "Tax; Legal; ABM; PtP")
    if (/^[A-Za-z&\s]+(?:\s*;\s*[A-Za-z&\s]+)+$/.test(line) && line.length < 60) continue;
    // Skip placeholder lines
    if (/^\[placeholder/i.test(line)) continue;
    // Skip short reference/note lines without requirement language
    if (line.length < 30 && !/\bmust\b/i.test(line)) continue;
    // Skip lines that are clearly notes or references (not requirements)
    if (/^(?:check\s|see\s|add\s|note:|to\s+confirm|to\s+check|e\.?g\.?\s|identified\s+places|e2e\s|will\s+be\s+used)/i.test(line)) continue;
    // Skip lines that are sub-heading-like without "must" (short, no verb)
    if (line.length < 80 && !/\bmust\b|\bshall\b|\bshould\b/i.test(line) && /^[A-Z][a-z]/.test(line) && !/[.!?]$/.test(line)) continue;
    // Extract lines with "must" or "shall" requirement language
    if (/\bmust\b/i.test(line) || /\bshall\b/i.test(line)) {
      statements.push(line);
    }
  }

  return statements;
}

/**
 * Extract the actor/subject from a "must" requirement statement.
 * E.g., "Self-published authors must..." → "Self-Published Author"
 */
function extractActorFromStatement(statement: string): string {
  const match = statement.match(/^(.+?)\s+must\b/i);
  if (match && match[1]) {
    const subject = match[1].trim()
      .replace(/^all\s+/i, '')
      .replace(/^the\s+/i, '')
      .replace(/^each\s+/i, '')
      .replace(/^every\s+/i, '');
    if (/system|platform|solution/i.test(subject)) return 'System';
    if (/self[\s-]*published\s*author/i.test(subject)) return 'Self-Published Author';
    if (/creator/i.test(subject)) return 'Creator';
    if (/author/i.test(subject)) return 'Author';
    if (/sfa\s*portal|sfa/i.test(subject)) return 'SFA Portal';
    if (/psl/i.test(subject)) return 'Payment System';
    if (/customer\s*support/i.test(subject)) return 'Customer Support';
    if (/accounting/i.test(subject)) return 'Content Accounting';
    if (/report/i.test(subject)) return 'System';
    if (/onboarding/i.test(subject)) return 'Onboarding System';
    if (/tax/i.test(subject)) return 'Tax Team';
    if (/payout/i.test(subject)) return 'Payout System';
    if (/moneybooker/i.test(subject)) return 'MoneyBooker';
    if (/terms|conditions|legal/i.test(subject)) return 'Legal Team';
    // Fallback: use subject if short enough
    if (subject.length <= 40) return subject;
  }
  return 'System';
}

/**
 * Methodology-based JTBD extraction.
 * Scans ALL sections for purpose statements, pain signals, and named artifacts,
 * then consolidates into 3-6 high-leverage JTBDs using the PRD's own terms.
 * 
 * Methodology:
 * A. Identify workflow nouns/artifacts (named steps, files, checks, processes)
 * B. Extract purpose statements ("main purpose is", "goal would be", "critical to")
 * C. Extract pain signals (manual, brittle, hours spent, scaling, month-end)
 * D. Group by persona/actor implied in PRD
 * E. Convert into structured JTBD format with fewer, higher-leverage jobs
 */
function extractJobsFromPrdMethodology(
  sectionMap: SectionMap,
  existingJobs: Job[]
): Job[] {
  // Collect all text from all sections
  const allText = sectionMap.sections
    .map(s => s.raw_text ?? '')
    .join('\n');
  
  // Skip if too little content
  if (allText.length < 200) return [];
  
  // Skip if we already have explicit JTBD-section jobs (those are verbatim from the PRD)
  if (existingJobs.some(j => j.job_id.startsWith('job_jtbd'))) return [];

  // Step A: Identify named artifacts and process steps
  const artifactPatterns = [
    /(?:the|a|an)\s+([A-Z][a-zA-Z\s]{3,30}(?:file|check|step|process|report|review|tool|system|pipeline|dataset|feature\s*set))/g,
    /(?:update|create|replace|deprecate|migrate|automate)\s+(?:the\s+)?([A-Z][a-zA-Z\s]{3,40})/g,
  ];
  const artifacts = new Set<string>();
  for (const pattern of artifactPatterns) {
    let match;
    while ((match = pattern.exec(allText)) !== null) {
      if (match[1] && match[1].trim().length > 5) {
        artifacts.add(match[1].trim());
      }
    }
  }

  // Step B: Extract purpose statements
  const purposePatterns = [
    /(?:main|primary)\s+purpose\s+(?:of\s+(?:this|the)\s+\w+\s+)?is\s+(?:to\s+)?(.{20,200}?)(?:\.|$)/gi,
    /(?:the\s+)?goal\s+(?:would\s+be|is)\s+(?:to\s+)?(.{20,200}?)(?:\.|$)/gi,
    /(?:this\s+(?:step|process|review)\s+is\s+)?critical\s+to\s+(.{20,200}?)(?:\.|$)/gi,
    /in\s+an\s+ideal\s+world[,\s]+(.{20,200}?)(?:\.|$)/gi,
    /(?:opportunity|opportunities)\s+(?:with\s+this\s+step)?[:\s]+(.{20,200}?)(?:\.|$)/gi,
    /by\s+replacing\s+(.{20,200}?)(?:,\s+we\s+can\s+|$)/gi,
  ];
  
  type PurposeStatement = { text: string; source: string };
  const purposeStatements: PurposeStatement[] = [];
  for (const pattern of purposePatterns) {
    let match;
    while ((match = pattern.exec(allText)) !== null) {
      if (match[1] && match[1].trim().length > 20) {
        purposeStatements.push({ text: match[1].trim(), source: match[0].slice(0, 50) });
      }
    }
  }

  // Step C: Extract pain signals
  const painPatterns = [
    /(\d+)\s+(?:MEC\s+)?hours?\s+(?:per\s+\w+\s+)?(?:on|spent|across)/gi,
    /(?:manual|manually)\s+(.{10,100}?)(?:\.|$)/gi,
    /(?:brittle|fragile|limiting|limited)\s+(.{10,100}?)(?:\.|$)/gi,
    /(?:no\s+way\s+to|cannot|unable\s+to)\s+(.{10,100}?)(?:\.|$)/gi,
    /(?:significant\s+effort|time[\s-]consuming|bottleneck)\s*(.{0,100}?)(?:\.|$)/gi,
  ];
  
  const painSignals: string[] = [];
  for (const pattern of painPatterns) {
    let match;
    while ((match = pattern.exec(allText)) !== null) {
      const signal = (match[1] || match[0]).trim();
      if (signal.length > 10) painSignals.push(signal);
    }
  }

  // Step D: Identify actors/personas from PRD
  const actorPatterns = [
    /\b(TA|Finance|Content\s*Accounting|Controls|Compliance)\b/gi,
    /\b(analyst|reviewer|controller|engineer|team\s*lead|user)\b/gi,
  ];
  const detectedActors = new Set<string>();
  for (const pattern of actorPatterns) {
    let match;
    while ((match = pattern.exec(allText)) !== null) {
      if (match[1]) detectedActors.add(match[1].trim());
    }
  }

  // Step E: Consolidate into high-leverage JTBDs
  // Only create jobs that don't duplicate existing ones
  const newJobs: Job[] = [];
  
  // Create jobs from purpose statements (these are the strongest signals)
  // Filter out PRD template boilerplate (generic goal statements that appear in every PRD)
  const filteredStatements = purposeStatements.filter(stmt => {
    const t = stmt.text.toLowerCase();
    // Skip generic template phrases
    if (/^(?:that\s+)?stakeholders\s+(?:are\s+)?aligned/i.test(t)) return false;
    if (/^have\s+a\s+solution\s+(?:chosen|that\s+can\s+be\s+given)/i.test(t)) return false;
    if (/^learn\s*\.|^to\s+learn\s*$/i.test(t)) return false;
    if (/^an?\s+updated\s+version/i.test(t)) return false;
    if (/^determine\s+if\s+there/i.test(t)) return false;
    if (/^frame\s+it\s+in\s+a\s+way/i.test(t)) return false;
    // Skip if too short or too generic
    if (t.length < 30) return false;
    // Skip if it doesn't contain any domain-specific terms from the PRD
    if (!/(?:offer|royalt|product|report|mapping|review|check|file|data|contract|mec|finance|ta\b)/i.test(t)) return false;
    return true;
  });
  
  for (const stmt of filteredStatements) {
    const text = stmt.text;
    
    // Check if this purpose is already covered by existing JTBD-level jobs (not table/requirement jobs)
    // Only deduplicate against other purpose/jtbd jobs, not against table-row items
    const isDuplicate = existingJobs.some(j =>
      j.job_id.startsWith('job_jtbd') && (
        j.description.toLowerCase().includes(text.toLowerCase().slice(0, 40)) ||
        text.toLowerCase().includes(j.description.toLowerCase().slice(0, 40))
      )
    ) || newJobs.some(j =>
      j.description.toLowerCase().includes(text.toLowerCase().slice(0, 40))
    );
    if (isDuplicate) continue;
    
    // Find related pain signals
    const relatedPain = painSignals.find(p =>
      text.toLowerCase().includes(p.toLowerCase().slice(0, 20)) ||
      p.toLowerCase().includes(text.toLowerCase().slice(0, 20))
    );
    
    const jobId = `job_purpose_${newJobs.length + 1}`;
    const actionText = text.charAt(0).toUpperCase() + text.slice(1);
    
    newJobs.push({
      job_id: jobId,
      description: actionText.slice(0, 250),
      trigger: relatedPain
        ? `Operational pain: ${relatedPain.slice(0, 150)}`
        : 'Process requires this capability to function correctly',
      success_outcome: actionText.slice(0, 200),
      priority: /critical|must|essential|key/i.test(text) ? 'must' : 'should',
    });
    
    // Cap at 6 methodology-derived jobs (these are high-leverage, purpose-driven)
    if (newJobs.length >= 6) break;
  }

  return newJobs;
}

/**
 * Enhance flows by adding persistence steps where the PRD implies historical reuse,
 * and by normalizing actor names to typed format (User/System/Logic).
 */
function enhanceFlowsWithPersistence(flows: Flow[], sectionMap: SectionMap): Flow[] {
  const allText = sectionMap.sections.map(s => s.raw_text ?? '').join('\n').toLowerCase();
  
  // Check if PRD implies historical reuse / persistence
  const impliesPersistence = /previously\s*reviewed|historical\s*(mapping|data|pattern)|reuse|persist|approved\s*mapping/i.test(allText);
  // Check if PRD describes current→target transformations
  const impliesTransformation = /replace\s+(?:the\s+)?(?:use\s+of\s+)?(?:reporting|current)|migrate\s+(?:to|from)|deprecat/i.test(allText);
  
  return flows.map(flow => {
    const steps = [...flow.steps];
    const lastStep = steps[steps.length - 1];
    
    // Add persistence step if PRD implies historical reuse and flow doesn't already have one
    if (impliesPersistence && !steps.some(s => /persist|store|save|record|log/i.test(s.action))) {
      steps.push({
        step_id: `step_${String(steps.length + 1).padStart(2, '0')}`,
        actor_id: 'System',
        action: 'Persist decisions and outcomes for historical reuse in future cycles',
        result: 'Review history updated and available for future automated comparison',
      });
    }
    
    // If last step has no result and flow implies transformation, add context
    if (impliesTransformation && lastStep && !lastStep.result) {
      lastStep.result = 'Process completed using updated data sources';
    }
    
    return { ...flow, steps };
  });
}

/**
 * Domain patterns for identifying financial/ERP requirement sections.
 */
const DOMAIN_SECTION_PATTERNS = [
  { pattern: /terms\s*(?:&|and)\s*conditions/i, domain: 'terms_conditions', label: 'Terms & Conditions' },
  { pattern: /^onboarding$/i, domain: 'onboarding', label: 'Onboarding' },
  { pattern: /data\s*calculat/i, domain: 'data_calculation', label: 'Data Calculation' },
  { pattern: /tax\s*management/i, domain: 'tax_management', label: 'Tax Management' },
  { pattern: /^booking$/i, domain: 'booking', label: 'Booking' },
  { pattern: /performance\s*reporting/i, domain: 'performance_reporting', label: 'Performance Reporting' },
  { pattern: /^payouts?$/i, domain: 'payouts', label: 'Payouts' },
  { pattern: /payout\s*eligib/i, domain: 'payout_eligibility', label: 'Payout Eligibility' },
  { pattern: /payment\s*fraud/i, domain: 'payment_fraud', label: 'Payment Fraud' },
  { pattern: /payout\s*notes?/i, domain: 'payout_notes', label: 'Payout Notes' },
  { pattern: /financial\s*reporting/i, domain: 'financial_reporting', label: 'Financial Reporting' },
  { pattern: /data\s*reports?/i, domain: 'data_reports', label: 'Data Reports' },
  { pattern: /customer\s*support/i, domain: 'customer_support', label: 'Customer Support' },
  { pattern: /sox\s*compliance/i, domain: 'sox_compliance', label: 'SOX Compliance' },
  { pattern: /reconciliation/i, domain: 'reconciliation', label: 'Reconciliation' },
];

/**
 * Scan domain-specific sections (financial/ERP) for requirement statements.
 * Creates jobs from individual "must" requirement statements within domain sections.
 * Each domain section produces up to 5 jobs capturing the key requirements.
 */
function extractJobsFromDomainSections(
  sectionMap: SectionMap,
  existingJobs: Job[]
): Job[] {
  const jobs: Job[] = [];
  let domainPriority = 0;

  for (const section of sectionMap.sections) {
    const matchedDomain = DOMAIN_SECTION_PATTERNS.find(d =>
      d.pattern.test(section.section_title)
    );

    if (!matchedDomain || !section.raw_text) continue;

    const mustStatements = extractMustStatements(section.raw_text);
    if (mustStatements.length === 0) continue;

    // Skip if existing jobs already cover this domain
    const isDuplicate = existingJobs.some(j =>
      j.job_id.includes(matchedDomain.domain) ||
      j.description.toLowerCase().includes(matchedDomain.label.toLowerCase())
    );
    if (isDuplicate) continue;

    domainPriority++;

    // Create jobs from the must statements (max 5 per domain section)
    const statementsToUse = mustStatements.slice(0, 5);
    for (let i = 0; i < statementsToUse.length; i++) {
      const stmt = statementsToUse[i]!;
      const actionPart = stmt.replace(/^.+?\bmust\b\s*/i, '').trim();
      const actor = extractActorFromStatement(stmt);

      jobs.push({
        job_id: `job_req_${matchedDomain.domain}_${i + 1}`,
        description: `${matchedDomain.label}: ${actionPart.slice(0, 180) || stmt.slice(0, 180)}`,
        trigger: `${actor} requires ${matchedDomain.label.toLowerCase()} capability`,
        success_outcome: actionPart.slice(0, 150) || `${matchedDomain.label} requirement satisfied`,
        priority: domainPriority <= 3 && i === 0 ? 'must' : 'should',
      });
    }
  }

  return jobs;
}

/**
 * Extract structured requirements from Requirements sections.
 * Classifies requirements by type (access_control, data_filter, search_logic, etc.)
 * and identifies which flows they should apply to.
 */
function extractStructuredRequirements(sectionMap: SectionMap): Requirement[] {
  const requirements: Requirement[] = [];
  
  // Find Requirements sections
  const requirementsSection = sectionMap.sections.find(s => 
    /^requirements$/i.test(s.section_title) ||
    /^functional\s*requirements$/i.test(s.section_title) ||
    /^technical\s*requirements$/i.test(s.section_title)
  );
  
  if (!requirementsSection?.raw_text) {
    return requirements;
  }
  
  const rawText = requirementsSection.raw_text;
  const lines = rawText.split('\n');
  
  let reqIndex = 0;
  let currentReqTitle = '';
  let currentReqContent: string[] = [];
  
  // Classification patterns
  const accessControlPatterns = [
    /authenticat/i, /unauthenticat/i, /age/i, /under\s*\d+/i, /children/i,
    /managed\s*account/i, /permission/i, /access/i, /exclude/i, /restrict/i
  ];
  const dataFilterPatterns = [
    /index/i, /threshold/i, /filter/i, /only\s*(?:show|display|include)/i,
    /must\s*only/i, /should\s*only/i, /distribute/i
  ];
  const searchLogicPatterns = [
    /search/i, /retrieval/i, /query/i, /match/i, /exact/i, /specificity/i
  ];
  const uiBehaviorPatterns = [
    /surface/i, /display/i, /appear/i, /step/i, /screen/i, /ui/i, /interface/i
  ];
  
  const classifyRequirement = (title: string, content: string): Requirement['type'] => {
    const combined = `${title} ${content}`.toLowerCase();
    
    if (accessControlPatterns.some(p => p.test(combined))) return 'access_control';
    if (searchLogicPatterns.some(p => p.test(combined))) return 'search_logic';
    if (dataFilterPatterns.some(p => p.test(combined))) return 'data_filter';
    if (uiBehaviorPatterns.some(p => p.test(combined))) return 'ui_behavior';
    return 'general';
  };
  
  const inferAppliesTo = (title: string, content: string): string[] => {
    const combined = `${title} ${content}`.toLowerCase();
    const flows: string[] = [];
    
    // Infer which flows this requirement might apply to
    if (/search|retrieval|query/i.test(combined)) flows.push('search');
    if (/save|library/i.test(combined)) flows.push('save', 'library');
    if (/index|ingest/i.test(combined)) flows.push('indexing', 'ingestion');
    if (/display|surface|result/i.test(combined)) flows.push('display', 'results');
    if (/authenticat|access|permission/i.test(combined)) flows.push('access_control');
    
    return flows.length > 0 ? flows : ['all'];
  };
  
  const saveRequirement = () => {
    if (currentReqTitle && currentReqContent.length > 0) {
      reqIndex++;
      const content = currentReqContent.join(' ').trim();
      const reqType = classifyRequirement(currentReqTitle, content);
      
      requirements.push({
        requirement_id: `req_${reqIndex}`,
        title: currentReqTitle,
        description: content,
        type: reqType,
        applies_to: inferAppliesTo(currentReqTitle, content),
      });
    }
    currentReqTitle = '';
    currentReqContent = [];
  };
  
  for (const line of lines) {
    const trimmed = (line ?? '').trim();
    if (!trimmed) continue;
    
    // Stop parsing if we hit a new major section like "Constraints" or "Accepted Tradeoffs"
    if (/^(Constraints|Accepted\s*Tradeoffs|Risks)/i.test(trimmed)) {
      saveRequirement();
      break;
    }
    
    // Check for bullet point with header (e.g., "* Indexing thresholds: ...")
    const bulletHeaderMatch = trimmed.match(/^[*•-]\s*([A-Za-z][^:]+):\s*(.*)$/);
    if (bulletHeaderMatch) {
      saveRequirement();
      currentReqTitle = bulletHeaderMatch[1]?.trim() ?? '';
      if (bulletHeaderMatch[2]) {
        currentReqContent.push(bulletHeaderMatch[2].trim());
      }
      continue;
    }
    
    // Check for requirement header without bullet (e.g., "Indexing thresholds:", "Searchable fields:")
    const headerMatch = trimmed.match(/^([A-Z][^:]+):\s*(.*)$/);
    if (headerMatch) {
      saveRequirement();
      currentReqTitle = headerMatch[1]?.trim() ?? '';
      if (headerMatch[2]) {
        currentReqContent.push(headerMatch[2].trim());
      }
      continue;
    }
    
    // Check for bold header (e.g., "**Indexing thresholds**")
    const boldMatch = trimmed.match(/^\*\*([^*]+)\*\*:?\s*(.*)$/);
    if (boldMatch) {
      saveRequirement();
      currentReqTitle = boldMatch[1]?.trim() ?? '';
      if (boldMatch[2]) {
        currentReqContent.push(boldMatch[2].trim());
      }
      continue;
    }
    
    // Check for bracketed sub-requirements like "[Saved to library]"
    const bracketMatch = trimmed.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (bracketMatch && currentReqTitle) {
      // Add as sub-content with context
      currentReqContent.push(`[${bracketMatch[1]}]: ${bracketMatch[2] ?? ''}`);
      continue;
    }
    
    // Collect content under current requirement
    if (currentReqTitle) {
      // Handle bullet points
      const bulletContent = trimmed.replace(/^[-•*]\s*/, '').trim();
      if (bulletContent) {
        currentReqContent.push(bulletContent);
      }
    }
  }
  
  // Save last requirement
  saveRequirement();
  
  return requirements;
}

/**
 * Generate validation steps for access control requirements.
 * These should be added as precondition checks in relevant flows.
 */
function generateValidationSteps(requirements: Requirement[]): Array<{ step_id: string; actor_id: string; action: string; result: string }> {
  const validationSteps: Array<{ step_id: string; actor_id: string; action: string; result: string }> = [];
  
  const accessControlReqs = requirements.filter(r => r.type === 'access_control');
  
  for (const req of accessControlReqs) {
    const descLower = req.description.toLowerCase();
    
    // Generate appropriate validation step based on requirement content
    if (/authenticat/i.test(descLower) || /unauthenticat/i.test(descLower)) {
      validationSteps.push({
        step_id: `validation_auth_${req.requirement_id}`,
        actor_id: 'System',
        action: 'Validate user authentication status',
        result: 'User is authenticated and authorized to proceed',
      });
    }
    
    if (/age|under\s*\d+|children|managed\s*account/i.test(descLower)) {
      const ageMatch = descLower.match(/under\s*(\d+)|<\s*(\d+)/);
      const age = ageMatch?.[1] || ageMatch?.[2] || '13';
      validationSteps.push({
        step_id: `validation_age_${req.requirement_id}`,
        actor_id: 'System',
        action: `Validate user age is ${age} or older (exclude managed accounts)`,
        result: `User meets age requirement (>= ${age} years old)`,
      });
    }
  }
  
  return validationSteps;
}

/**
 * Link requirements to flows based on content matching.
 * Adds preconditions, constraints, and linked_requirements to flows.
 */
function linkRequirementsToFlows(flows: Flow[], requirements: Requirement[]): Flow[] {
  if (requirements.length === 0) return flows;
  
  return flows.map(flow => {
    const flowNameLower = flow.name.toLowerCase();
    const flowStepsText = flow.steps.map(s => `${s.action} ${s.result}`).join(' ').toLowerCase();
    
    const preconditions: string[] = [];
    const constraints: string[] = [];
    const linkedReqs: string[] = [];
    
    for (const req of requirements) {
      // Check if requirement applies to this flow
      const appliesToFlow = req.applies_to?.some(a => 
        a === 'all' || 
        flowNameLower.includes(a) || 
        flowStepsText.includes(a)
      );
      
      if (!appliesToFlow) continue;
      
      linkedReqs.push(req.requirement_id);
      
      // Add as precondition or constraint based on type
      if (req.type === 'access_control') {
        preconditions.push(`${req.title}: ${req.description.slice(0, 100)}`);
      } else if (req.type === 'data_filter' || req.type === 'search_logic') {
        constraints.push(`${req.title}: ${req.description.slice(0, 100)}`);
      } else if (req.type === 'ui_behavior') {
        constraints.push(`UI: ${req.title} - ${req.description.slice(0, 80)}`);
      }
    }
    
    return {
      ...flow,
      preconditions: preconditions.length > 0 ? preconditions : undefined,
      constraints: constraints.length > 0 ? constraints : undefined,
      linked_requirements: linkedReqs.length > 0 ? linkedReqs : undefined,
    };
  });
}

/**
 * Add validation steps to flows that have access control preconditions.
 */
function addValidationStepsToFlows(flows: Flow[], requirements: Requirement[]): Flow[] {
  const validationSteps = generateValidationSteps(requirements);
  
  if (validationSteps.length === 0) return flows;
  
  return flows.map(flow => {
    // Only add validation steps to flows with access control preconditions
    const hasAccessControlPreconditions = flow.preconditions?.some(p => 
      /authenticat|age|managed|permission|access/i.test(p)
    );
    
    if (!hasAccessControlPreconditions) return flow;
    
    // Prepend validation steps to the flow
    const updatedSteps = [
      ...validationSteps.map((vs, idx) => ({
        ...vs,
        step_id: `${flow.flow_id}_${vs.step_id}_${idx}`,
      })),
      ...flow.steps,
    ];
    
    return {
      ...flow,
      steps: updatedSteps,
    };
  });
}

/**
 * Strategic context extracted from strategy/scope docs.
 * Captures not just what's being built, but HOW users experience it:
 * access model, discovery channels, content details, and value framing.
 */
type StrategyContext = {
  productName: string;
  targetUser: string;
  valueProposition: string;
  /** What the content/product actually IS (e.g., "2000+ floor-based workout videos") */
  contentDescription: string;
  /** How users get access (e.g., "free for Premium, gated for free users") */
  accessModel: string;
  /** How users discover the product (e.g., "Browse hub, search, cross-promo from playlists") */
  discoveryChannels: string[];
  /** What the product replaces or competes with (e.g., "$13/month standalone subscription") */
  valueAnchor: string;
  /** The aspirational shift (e.g., from "where I play workout music" to "where I do guided workouts") */
  behaviorShift: string;
};

/**
 * Extract strategic context from the non-DoD sections of the document.
 * Deeply reads TL;DR, Challenge, Strategy, and Scope to understand
 * the full picture: what the product is, who uses it, how they find it,
 * how they access it, and why it matters to them.
 */
function extractStrategyContext(sectionMap: SectionMap): StrategyContext {
  const allText = sectionMap.sections.map(s => s.raw_text ?? '').join('\n');
  // Focus on the strategy portion (first ~5000 chars, before DoD tables)
  const strategyText = allText.slice(0, Math.min(allText.length, 6000));

  // Product name
  const nameMatch = allText.match(/(?:initiative\s*name|strategy\s*name)\s*(?:\n|\t)?\s*(.+?)(?:\n|\t)/i);
  const productName = nameMatch?.[1]?.trim() ?? 'this initiative';

  // Target user
  const audiencePatterns = [
    /(?:primary\s*audience|target\s*(?:user|audience|segment))\s*(?:is|are)?\s*(.+?)(?:\.|,\s*(?:who|and|but)|$)/im,
    /(?:existing|current)\s+([\w\s]+(?:users?|subscribers?|members?))\s+who/im,
    /(?:targeting|designed\s+for|built\s+for|aimed\s+at)\s+(.+?)(?:\.|,|$)/im,
  ];
  let targetUser = 'user';
  for (const p of audiencePatterns) {
    const m = strategyText.match(p);
    if (m?.[1] && m[1].length > 5 && m[1].length < 100) {
      targetUser = m[1].trim().replace(/\.\s*$/, '');
      break;
    }
  }

  // Value proposition from TL;DR
  const valueMatch = strategyText.match(/(?:tl;?\s*dr|summary)\s*(?:\n|\t)?\s*([\s\S]+?)(?:\n\n|\n\d+\.)/i);
  const valueProposition = valueMatch?.[1]?.trim().replace(/\n/g, ' ').slice(0, 400) ?? '';

  // Content description — what the product actually offers
  const contentPatterns = [
    /(?:over|with|debut.*with|launch.*with|offering|providing)\s+([\d,]+\+?\s+[\w\s-]+(?:workouts?|videos?|classes?|episodes?|courses?|sessions?|titles?))/i,
    /(?:approximately|about|around|roughly)\s+([\d,]+\s+new\s+[\w\s]+(?:added|published|released)\s+\w+)/i,
    /(\d[\d,]*\+?\s+(?:floor-based|guided|on-demand|live)\s+[\w\s]+)/i,
  ];
  const contentParts: string[] = [];
  for (const p of contentPatterns) {
    const m = strategyText.match(p);
    if (m?.[1]) contentParts.push(m[1].trim());
  }
  // Playlist/social/messaging domain
  if (/\b(?:collaborative|social)\s*playlists?\b/i.test(strategyText)) {
    contentParts.push('collaborative playlists and messaging');
  }
  // Also capture ongoing additions
  const weeklyMatch = strategyText.match(/(approximately|about|around)\s+([\d,]+)\s+new\s+([\w\s]+?)(?:added|published)\s+(\w+)/i);
  if (weeklyMatch) {
    contentParts.push(`~${weeklyMatch[2]} new ${weeklyMatch[3]?.trim()} ${weeklyMatch[4]}`);
  }
  const contentDescription = contentParts.join(', ') || '';

  // Access model — who can access and how
  let accessModel = '';
  if (/premium.only|premium\s*exclusive|gat.*premium|provided.*premium.*free|included\s*in\s*premium/i.test(strategyText)) {
    accessModel = 'included free for Premium subscribers';
  }
  if (/free\s*user|upsell|gating.*free/i.test(allText)) {
    accessModel += accessModel ? ', with upsell prompts for free users' : 'gated with upsell for non-subscribers';
  }
  if (!accessModel) {
    if (/premium/i.test(strategyText)) accessModel = 'available to Premium users';
    else if (/free/i.test(strategyText)) accessModel = 'available for free';
  }

  // Discovery channels — how users find the product
  const discoveryChannels: string[] = [];
  const channelPatterns: Array<{ test: RegExp; label: string }> = [
    { test: /\b(browse|hub)\b.*\b(fitness|curated|destination)\b/i, label: 'Browse hub' },
    { test: /\bsearch\b.*\b(fitness|workout|exercise|result)\b/i, label: 'Search results' },
    { test: /cross.?promot|promot.*playlist|workout\s*music\s*playlist/i, label: 'Cross-promotion from related playlists' },
    { test: /\bhome\b.*\b(shelf|card|recommend)\b/i, label: 'Home feed recommendations' },
    { test: /\beditorial\b.*\b(playlist|collection|curat)\b/i, label: 'Editorial playlists and collections' },
    { test: /\bnotif|push|email|marketing\b/i, label: 'Marketing and notifications' },
    { test: /\bnudge|banner|prompt\b/i, label: 'In-app nudges and prompts' },
  ];
  for (const cp of channelPatterns) {
    if (cp.test.test(allText)) discoveryChannels.push(cp.label);
  }

  // Value anchor — what the product replaces or what it's worth
  const anchorMatch = strategyText.match(/(?:current|currently)\s+\$?([\d.]+)\/?\s*(?:month|mo)\b.*?(?:for|from|with)/i)
    ?? strategyText.match(/\$?([\d.]+)\/?\s*(?:month|mo)\b.*?(?:price|cost|subscription|separately)/i);
  const valueAnchor = anchorMatch
    ? `content worth $${anchorMatch[1]}/month when purchased separately`
    : '';

  // Behavior shift — from current to desired
  const shiftPatterns = [
    /not\s+just\s+["'](.+?)["']\s*,?\s*but\s+(?:also\s+)?["'](.+?)["']/i,
    /from\s+["'](.+?)["']\s+to\s+["'](.+?)["']/i,
  ];
  let behaviorShift = '';
  for (const p of shiftPatterns) {
    const m = strategyText.match(p);
    if (m?.[1] && m?.[2]) {
      behaviorShift = `from "${m[1]}" to "${m[2]}"`;
      break;
    }
  }

  return {
    productName,
    targetUser,
    valueProposition,
    contentDescription,
    accessModel,
    discoveryChannels,
    valueAnchor,
    behaviorShift,
  };
}

/**
 * Translate a delivery-oriented DoD into a user-perspective Job to be Done.
 * Uses the strategic context to frame each DoD as what the product lets users DO
 * within the broader product vision, not what the team must DELIVER.
 */
function translateDoDToUserJob(
  title: string,
  detail: string,
  ctx: StrategyContext
): { description: string; trigger: string; outcome: string } {
  const combined = `${title} ${detail}`.toLowerCase();

  // Step 1: Strip delivery verbs to get the core capability
  let core = detail.replace(/\[\w+\]/g, '').replace(/\s+/g, ' ').trim();
  core = core.replace(
    /^(?:Ship|Deliver|Develop|Build|Create|Implement|Launch|Prepare|Define|Ensure|Enable|Configure|Integrate|Design|Set\s*up|Extend|Introduce|Establish|Gate|Exclude|Filter|Replace|Onboard|Codify|Test)\s+(?:a\s+|an\s+|the\s+|support\s+(?:for\s+)?)?/i,
    ''
  );

  // Step 2: Split into "what" and "why" on value connectors
  let whatPart = core;
  let whyPart = '';
  const splitters = [
    /\s*,?\s*(?:to\s+(?:allow|enable|ensure|drive|help|support|let|protect|reinforce))\s+/i,
    /\s*,?\s*so\s+that\s+/i,
    /\s*,?\s*ensuring\s+/i,
    /\s*,?\s*(?:in\s+order\s+to)\s+/i,
  ];
  for (const sp of splitters) {
    const idx = core.search(sp);
    if (idx > 10) {
      whatPart = core.slice(0, idx).trim();
      whyPart = core.slice(idx).replace(sp, '').trim();
      break;
    }
  }

  // Step 3: Determine actor
  const actor = inferDoDActor(combined);
  const actorLabel = actor === 'user' ? ctx.targetUser : actor;

  // Step 4: Reframe as user experience using product context
  const userWhat = reframeAsUserExperience(whatPart, ctx);
  const userWhy = whyPart
    ? whyPart.replace(/^users?\s+/i, 'I ').replace(/^they\s+/i, 'I ').replace(/\.\s*$/, '')
    : '';

  const description = userWhy
    ? `As a ${actorLabel}, ${userWhat}, so that ${lcfirst(userWhy)}`
    : `As a ${actorLabel}, ${userWhat}`;

  const trigger = inferUserTrigger(combined, ctx);

  const outcome = userWhy
    ? ucfirst(userWhy)
    : `${title} enhances my experience with ${ctx.productName}`;

  return {
    description: description.slice(0, 300),
    trigger,
    outcome: outcome.slice(0, 200),
  };
}

function inferDoDActor(text: string): string {
  if (/\bfree\s*user|non.?subscri|upsell.*free/i.test(text)) return 'free user';
  if (/\bpartner|licensor\b/i.test(text) && /\b(analytic|payout|payment|report|compensat)/i.test(text)) return 'content partner';
  if (/\bcreator|instructor\b/i.test(text) && /\b(onboard|publish|monetiz)/i.test(text)) return 'content creator';
  if (/\b(deal|partnership|assess|evaluate|codify)\b/i.test(text) && !/\buser\b/i.test(text)) return 'business stakeholder';
  if (/\bpremium\b/i.test(text)) return 'premium subscriber';
  return 'user';
}

function reframeAsUserExperience(whatPart: string, ctx: StrategyContext): string {
  const w = whatPart.toLowerCase();
  const pn = ctx.productName;
  const content = ctx.contentDescription || `${pn} content`;
  const access = ctx.accessModel || 'as part of my subscription';
  const anchor = ctx.valueAnchor ? ` (${ctx.valueAnchor})` : '';

  if (/\b(hub|browse|destination|category|grid|sub.?page)\b/.test(w))
    return `I can open a dedicated ${pn} section in the app to browse ${content} organized by category and type`;
  if (/\b(search|query|result|shelf.*search|carousel.*search)\b/.test(w))
    return `when I search for relevant terms in the app, I see ${pn} results alongside music`;
  if (/\b(gat|premium.only|restrict|access)\b/.test(w))
    return `I get ${content} ${access}${anchor}`;
  if (/\b(free\s*user|upsell|upgrade)\b/.test(w))
    return `I see what ${pn} offers in the app and get a clear prompt to upgrade for access`;
  if (/\b(cross.?promot|promot|recommend|suggest|personali[sz])\b/.test(w))
    return `while I'm already in the app (e.g. listening to a related playlist), I get shown ${pn} content I might enjoy`;
  if (/\b(playlist.*same\s*time|music.*alongside|own\s*music|user.initiated.*playlist)\b/.test(w))
    return `I can play my own music playlist at the same time as a guided ${pn} video`;
  if (/\b(nudge|watch\s*on|tv|big\s*screen|transfer|device.*recommend)\b/.test(w))
    return `The app suggests I switch my ${pn} video to my TV for a better viewing experience`;
  if (/\b(autoplay|exclude.*recommend|protect.*background)\b/.test(w))
    return `my regular listening isn't interrupted by ${pn} video autoplay`;
  if (/\b(non.video|filter.*device|broken\s*experience|video.*support)\b/.test(w))
    return `I only see ${pn} video content on app devices that can actually play video`;
  if (/\b(editorial|distribution.*strateg|curated.*playlist)\b/.test(w))
    return `I find curated ${pn} collections, playlists, and featured content across the app's surfaces (Home, Browse, etc.)`;
  if (/\b(content\s*model|metadata|tagging|catalog)\b/.test(w))
    return `${pn} content in the app is properly categorized (by type, duration, equipment, etc.) so recommendations and browsing work well`;
  if (/\b(content\s*delivery|ingest|licensed|distribution\s*api)\b/.test(w))
    return `${content} is published in the app regularly, with new content added on an ongoing basis`;
  if (/\b(episode\s*page|premium.*value|no\s*ads|exclusiv)\b/.test(w))
    return `when I view ${pn} content in the app, I see clearly that it's an exclusive Premium benefit${anchor}`;
  if (/\b(program|structured|instructor.*playlist|trainer)\b/.test(w))
    return `I can follow structured multi-session ${pn} programs in the app (e.g. a 30-day challenge)`;
  if (/\b(habit|gamif|achievement|progress|goal|celebrat|streak)\b/.test(w))
    return `The app helps me track my ${pn} progress, celebrate milestones, and stay motivated`;
  // Playlist / social / messaging domain — user-facing translations
  if (/\b(invite\s*flow|invite\s*.*collaborative|on-platform\s*invites?|expiring\s*invites?)\b/.test(w))
    return `I can invite friends to collaborate on my playlists and manage invites without friction`;
  if (/\b(request\s*to\s*join|request.*join\s*playlist)\b/.test(w))
    return `I can request to join a friend's playlist when they're in my trusted circle`;
  if (/\b(managing\s*collaborator|collaborator\s*access|let\s+collaborators\s+invite)\b/.test(w))
    return `I can control who can edit my playlist and let collaborators invite others when I choose`;
  if (/\b(create\s*flow|playlist-level\s*controls|private\s*vs\s*public)\b/.test(w))
    return `I can set my playlist to private or public when I create it, so I'm in control from the start`;
  if (/\b(social\s*playlist\s*track\s*row|facepile|who\s*added|reaction\s*slot)\b/.test(w))
    return `I can see who added each track to our playlist and react to their contributions`;
  if (/\b(your\s*updates|social\s*playlist\s*updates|forward\s*journey|habit\s*loops?)\b/.test(w))
    return `I get relevant updates about our collaborative playlists and can jump back in easily`;
  if (/\b(retriev.*social\s*playlist|collaborative\s*playlist\s*row|filter.*collaborative|recently\s*updated)\b/.test(w))
    return `I can find my collaborative playlists in Your Library and see which ones were recently updated`;
  if (/\b(initiat.*message|message.*from\s*playlist|group\s*message.*playlist)\b/.test(w))
    return `I can start a conversation with collaborators directly from our playlist`;
  if (/\b(track\s*reaction|react.*track|conversation\s*about\s*a\s*track)\b/.test(w))
    return `I can react to tracks and start a conversation about them with my collaborators`;
  if (/\b(liner\s*notes?|user-created\s*liner|add\s*liner\s*notes?)\b/.test(w))
    return `I can add personal notes to tracks I add to our playlist, so collaborators know why I chose them`;
  if (/\b(moderation|liner\s*notes?.*moderation|reporting|IP\s*protection)\b/.test(w) && !/\buser\b.*\bexperience\b/i.test(w))
    return `Playlist liner notes are moderated so our shared space stays safe and trusted`;
  if (/\b(npv|you\s*might|onward|also\s*like|next\s*up)\b/.test(w))
    return `after I finish ${pn} content in the app, I see relevant suggestions for what to do next`;
  if (/\b(analytic|report|performance|metric)\b/.test(w))
    return `I receive performance data showing how my content is consumed in the app`;
  if (/\b(payout|payment|compensat|revenue|minimum\s*guarantee)\b/.test(w))
    return `I receive accurate, timely payouts based on the agreed terms`;
  if (/\b(deal|assess|evaluat|partnership|success\s*criteria|codify)\b/.test(w))
    return `there are clear success criteria for the ${pn} partnership`;
  if (/\b(onboard.*creator|creator.*onboard|publish.*episode|monetiz)\b/.test(w))
    return `I can publish my content in the app as video episodes`;
  if (/\b(guideline|title.*description|naming|content\s*type|app\s*ia)\b/.test(w))
    return `${pn} content in the app has clear, scannable titles and descriptions I can understand at a glance`;
  if (/\b(go.to.market|gtm|launch|readiness|end.to.end\s*qa|marketing|comms)\b/.test(w))
    return `when ${pn} launches in the app, my first experience is smooth, polished, and clearly communicated`;
  if (/\b(hardware|discount|affiliate|equipment)\b/.test(w))
    return `I can get an exclusive hardware discount through my Premium subscription`;

  let cleaned = whatPart.replace(/\.\s*$/, '');
  return `I can use ${cleaned.charAt(0).toLowerCase()}${cleaned.slice(1)} in the app`;
}

function inferUserTrigger(combined: string, ctx: StrategyContext): string {
  const pn = ctx.productName;
  const content = ctx.contentDescription || `${pn} content`;
  const channels = ctx.discoveryChannels.length > 0
    ? ` (via ${ctx.discoveryChannels.slice(0, 2).join(' or ')})`
    : '';
  const shift = ctx.behaviorShift || '';

  if (/\b(hub|browse|discover|catalog|find|explore)\b/.test(combined))
    return `I open the app and want to find ${content} that matches my interests${channels}`;
  if (/\b(search)\b/.test(combined))
    return `I search the app for workout/exercise terms and expect to find ${pn} results`;
  if (/\b(cross.?promot|promot.*playlist|interested\s*audience)\b/.test(combined))
    return `I'm listening to a related playlist in the app and could be introduced to ${pn}`;
  if (/\b(play|stream|watch|listen|byom|video)\b/.test(combined))
    return `I'm doing or about to start a ${pn} session in the app`;
  if (/\b(autoplay|background|exclude)\b/.test(combined))
    return `I'm listening to regular audio in the app and don't want video content interrupting`;
  if (/\b(nudge|tv|device|screen|cast|transfer|non.video)\b/.test(combined))
    return `I'm using ${pn} in the app and want the best experience for my current device`;
  if (/\b(premium|gating|free|upsell|access|subscri|exclusive)\b/.test(combined))
    return `I encounter ${pn} in the app and want to know if it's included in my plan${ctx.accessModel ? ` (${ctx.accessModel})` : ''}`;
  if (/\b(habit|progress|goal|achievement|program|structured)\b/.test(combined))
    return `I've been using ${pn} in the app regularly and want to keep going${shift ? ` — shifting ${shift}` : ''}`;
  if (/\b(content.*delivery|ingest|editorial|metadata|model|guideline|naming)\b/.test(combined))
    return `I browse or search ${pn} in the app and expect content to be well-organized and up to date`;
  if (/\b(partner|creator|onboard|payout|analytic|deal|monetiz)\b/.test(combined))
    return `I provide ${pn} content to the app and need to manage my business`;
  if (/\b(launch|gtm|readiness|marketing|comms|qa)\b/.test(combined))
    return `${pn} is newly available in the app and I hear about it or stumble upon it`;
  if (/\b(invite|collaborative\s*playlist|request\s*to\s*join)\b/.test(combined))
    return `I want to make my playlist social and invite friends to collaborate`;
  if (/\b(message|messaging|react|liner\s*notes?)\b/.test(combined))
    return `I'm in a collaborative playlist and want to connect with my collaborators`;
  if (/\b(retriev|your\s*library|filter.*playlist)\b/.test(combined))
    return `I'm in Your Library and want to find my collaborative playlists`;

  return `I use the app and encounter ${pn}`;
}

function ucfirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function lcfirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * Extract jobs from "Definitions of Done" (DoD) sections found in strategy/scope documents.
 * Handles two formats:
 *   A) Compact table: number on own line, description on next line, priority on next line
 *   B) Detailed sections: "DoD X: Name: Description" scattered across sections
 */
function extractJobsFromDoDSection(
  sectionMap: SectionMap,
  _openQuestions: string[],
  strategyCtx?: StrategyContext
): { jobs: Job[]; found: boolean } {
  // Step 1: Gather text from ALL sections containing DoD content (not just the first).
  // Strategy/scope docs may have DoDs in "Definitions of Done" and again in "Workstreams, DoDs & contributions".
  const dodTextChunks: string[] = [];
  const allSectionText = sectionMap.sections.map(s => s.raw_text ?? '').join('\n');

  for (const section of sectionMap.sections) {
    const fullText = section.raw_text ?? '';
    const title = (section.section_title ?? '').toLowerCase();
    const hasDoDInTitle = /definitions?\s*of\s*done|dod|workstream.*dod/i.test(title);
    const hasDoDInContent = /definitions?\s*of\s*done|DoD\s*(?:#?\s*)?\d+|DoD\s*Priority/i.test(fullText);
    if ((hasDoDInTitle || hasDoDInContent) && fullText.length > 100) {
      const start = fullText.search(/definitions?\s*of\s*done|DoD\s*#|invite\s*flow|request\s*to\s*join/i);
      dodTextChunks.push(start >= 0 ? fullText.slice(start) : fullText);
    }
  }
  const dodTableText = dodTextChunks.join('\n\n');

  // Check if there's any DoD content at all
  const hasDoDContent = dodTableText.length > 100 ||
    /DoD\s*(?:#?\s*)?(?:X|\d+)\s*:/i.test(allSectionText) ||
    /DoD\s*Priority/i.test(allSectionText);

  if (!hasDoDContent) {
    return { jobs: [], found: false };
  }

  const jobs: Job[] = [];
  const seenDescriptions = new Set<string>();

  function addJob(
    num: number,
    rawDescription: string,
    priority: 'must' | 'should' | 'could',
    workstream: string
  ): void {
    let desc = rawDescription
      .replace(/\[\w+\]/g, '')  // Remove Google Doc comment markers like [a], [j], [k]
      .replace(/\s+/g, ' ')
      .trim();

    if (desc.length < 15) return;

    const colonSplit = desc.match(/^([^:]+):\s*(.+)/);
    const title = colonSplit ? colonSplit[1]!.trim() : desc.slice(0, 60);
    const rawDetail = colonSplit ? colonSplit[2]!.trim() : desc;

    const dedupeKey = rawDetail.slice(0, 60).toLowerCase();
    if (seenDescriptions.has(dedupeKey)) return;
    seenDescriptions.add(dedupeKey);

    const workstreamTag = workstream ? ` [${workstream}]` : '';
    const ctx: StrategyContext = strategyCtx ?? {
      productName: 'this initiative',
      targetUser: 'user',
      valueProposition: '',
      contentDescription: '',
      accessModel: '',
      discoveryChannels: [],
      valueAnchor: '',
      behaviorShift: '',
    };
    const translated = translateDoDToUserJob(title, rawDetail, ctx);

    jobs.push({
      job_id: `job_dod_${num}`,
      description: translated.description.slice(0, 300),
      trigger: `${translated.trigger}${workstreamTag}`,
      success_outcome: translated.outcome,
      priority,
      _storyTitle: `DoD ${num}: ${title}`,
    });
  }

  // Step 2: Parse compact table format (number / description / priority on separate lines)
  if (dodTableText) {
    const lines = dodTableText.split('\n');
    let currentWorkstream = '';
    let pendingNum: number | null = null;
    let pendingDesc = '';
    let pendingPriority: 'must' | 'should' | 'could' = 'must';
    let dodCounter = 0;

    function flushPending(): void {
      if (pendingDesc.length > 15) {
        dodCounter++;
        addJob(pendingNum ?? dodCounter, pendingDesc, pendingPriority, currentWorkstream);
      }
      pendingNum = null;
      pendingDesc = '';
      pendingPriority = 'must';
    }

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Tab-separated table row: "1\tInvite flow improvements\tShip improvements...\tMust"
      const tabs = line.split('\t');
      if (tabs.length >= 3) {
        const numStr = tabs[0]?.trim();
        const priorityCol = tabs[tabs.length - 1]?.trim();
        const priorityMatch = /^(Must|Should|Could)$/i.test(priorityCol ?? '');
        if (/^\d{1,2}$/.test(numStr ?? '') && priorityMatch) {
          flushPending();
          const num = parseInt(numStr!, 10);
          const descCols = tabs.slice(1, -1).join(' ').trim();
          if (descCols.length > 15) {
            addJob(num, descCols, (priorityCol!.toLowerCase()) as 'must' | 'should' | 'could', currentWorkstream);
          }
          continue;
        }
      }

      // Workstream header
      const wsMatch = line.match(/Workstream\s*\d+\s*:\s*(.+)/i);
      if (wsMatch) {
        flushPending();
        currentWorkstream = wsMatch[1]!.trim();
        continue;
      }

      // Skip table headers and metadata
      if (/^(?:A\.\s*DoD|B\.\s*Definition|C\.\s*Must|Follow the DoD principles|Indicate the DoDs)/i.test(line)) continue;
      // Skip DoD owner lines (e.g. "Soh Nagano") and scope labels — don't append to description
      if (/^(?:In scope|Out of scope)\s*(?:\([^)]*\))?$/i.test(line)) continue;
      if (/^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(line) && line.length < 35) continue;

      // Priority line: "Must" or "DoD Priority: Must"
      const priorityMatch = line.match(/(?:DoD\s*Priority\s*:\s*)?(Must|Should|Could)/i);
      if (priorityMatch) {
        pendingPriority = priorityMatch[1]!.toLowerCase() as 'must' | 'should' | 'could';
        flushPending();
        continue;
      }

      // Number-only line (e.g., "\t1", "\t15")
      if (/^\d{1,2}$/.test(line)) {
        flushPending();
        pendingNum = parseInt(line, 10);
        continue;
      }

      // Description line — if we have a pending number or it starts a new unnumbered item
      if (pendingNum !== null && !pendingDesc) {
        pendingDesc = line;
        continue;
      }

      // Continuation of description (multi-line descriptions before the priority)
      if (pendingDesc && !/(?:DoD\s*Priority\s*:\s*)?(Must|Should|Could)(?:\s|$)/i.test(line) && !/^\d{1,2}$/.test(line)) {
        pendingDesc += ' ' + line;
        continue;
      }

      // Unnumbered item (description without a preceding number line)
      if (!pendingDesc && line.length > 20 && /^[A-Z]/.test(line) && !pendingNum) {
        flushPending();
        pendingDesc = line;
        continue;
      }
    }
    flushPending();
  }

  // Step 3: If compact table didn't yield enough, scan all sections for "DoD X:" pattern
  if (jobs.length < 8) {
    let currentPriority: 'must' | 'should' | 'could' = 'must';
    const dodXRegex = /(?:DoD\s*Priority\s*:\s*(Must|Should|Could))|(?:DoD\s*(?:#?\s*)?(?:X|\d+)\s*:\s*(.+?)(?:\n|$))/gi;
    let match;

    while ((match = dodXRegex.exec(allSectionText)) !== null) {
      if (match[1]) {
        currentPriority = match[1].toLowerCase() as 'must' | 'should' | 'could';
        continue;
      }
      if (match[2]) {
        const desc = match[2].trim();
        if (desc.length < 15) continue;
        addJob(jobs.length + 1, desc, currentPriority, '');
      }
    }
  }

  return { jobs, found: jobs.length > 0 };
}

/**
 * Create user flows from DoD-derived jobs, grouped into user journeys.
 * Generic: automatically groups jobs by common UX themes (discovery,
 * consumption, engagement, access, operations) based on content analysis.
 */
function createFlowsFromDoDJobs(jobs: Job[]): Flow[] {
  const dodJobs = jobs.filter(j => j.job_id.startsWith('job_dod_'));
  if (dodJobs.length === 0) return [];

  // Generic journey categories that apply to any product domain
  const journeyRules: Array<{ key: string; name: string; test: RegExp }> = [
    { key: 'discover', name: 'Discover & Find Content', test: /\b(browse|hub|search|discover|explore|find|catalog|editorial|distribution|curated|naming|guideline|title|description|query|suggest|retriev|filter.*playlist|your\s*library)\b/i },
    { key: 'consume', name: 'Use & Experience Content', test: /\b(play|stream|watch|listen|music.*alongside|nudge|tv|desktop|screen|cast|autoplay|video|device|episode|background|playback|npv|onward|next|track\s*row|facepile)\b/i },
    { key: 'engage', name: 'Stay Engaged & Build Habits', test: /\b(habit|gamif|achievement|progress|goal|streak|motivat|celebrat|promot|cross.?promot|program|structured|follow|your\s*updates|forward\s*journey)\b/i },
    { key: 'access', name: 'Access & Subscription Value', test: /\b(invite|request\s*to\s*join|collaborator|create\s*flow|private|public|premium|gating|gate|access|free\s*user|upsell|subscri|entitle|unlock|value|exclusive|content\s*model|metadata|content\s*delivery|ingest|launch|gtm|go.to.market|readiness|qa\b|marketing|comms|hardware|discount|affiliate)\b/i },
    { key: 'social', name: 'Connect & Collaborate', test: /\b(message|messaging|react|reaction|liner\s*notes?|conversation|group\s*message)\b/i },
    { key: 'operate', name: 'Manage Content & Operations', test: /\b(partner|payout|payment|analytic|report|dashboard|deal|assess|evaluat|creator|onboard|publish|monetiz|spp|compensat|revenue|moderation)\b/i },
  ];

  const journeyGroups: Record<string, { name: string; jobs: Job[] }> = {};

  for (const job of dodJobs) {
    const text = `${job._storyTitle ?? ''} ${job.description} ${job.trigger}`;
    let matched = false;

    for (const rule of journeyRules) {
      if (rule.test.test(text)) {
        if (!journeyGroups[rule.key]) {
          journeyGroups[rule.key] = { name: rule.name, jobs: [] };
        }
        journeyGroups[rule.key]!.jobs.push(job);
        matched = true;
        break;
      }
    }

    if (!matched) {
      if (!journeyGroups['general']) {
        journeyGroups['general'] = { name: 'General Experience', jobs: [] };
      }
      journeyGroups['general']!.jobs.push(job);
    }
  }

  const flows: Flow[] = [];
  let flowIndex = 0;

  for (const [_groupKey, group] of Object.entries(journeyGroups)) {
    flowIndex++;

    const steps: Array<{ step_id: string; actor_id: string; action: string; result: string }> = [];

    for (let i = 0; i < group.jobs.length; i++) {
      const job = group.jobs[i]!;
      const actor = determineUserActorGeneric(job.description + ' ' + job.trigger);

      steps.push({
        step_id: `step_dod_${flowIndex}_${i + 1}`,
        actor_id: actor,
        action: job.description.slice(0, 150),
        result: job.success_outcome.slice(0, 150),
      });
    }

    // Determine primary actor from the majority of steps
    const actorCounts: Record<string, number> = {};
    for (const step of steps) {
      actorCounts[step.actor_id] = (actorCounts[step.actor_id] ?? 0) + 1;
    }
    const primaryActor = Object.entries(actorCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'User';

    flows.push({
      flow_id: `flow_dod_${flowIndex}`,
      name: group.name,
      type: 'user_journey',
      actors: [primaryActor, ...new Set(steps.map(s => s.actor_id).filter(a => a !== primaryActor))],
      steps,
      linked_jobs: group.jobs.map(j => j.job_id),
    });
  }

  return flows;
}

function determineUserActorGeneric(text: string): string {
  const d = text.toLowerCase();
  if (/\bpartner\b.*(?:analytic|payout|payment|report|compensat)/i.test(d)) return 'Content Partner';
  if (/\bcreator\b|publish.*content|monetiz/i.test(d)) return 'Content Creator';
  if (/\bfree\s*user\b|non.?subscri|upsell/i.test(d)) return 'Free User';
  if (/\bstakeholder\b|assess|evaluat.*partnership/i.test(d)) return 'Business Stakeholder';
  if (/\bops\b|operations|support\s*team/i.test(d)) return 'Operations Team';
  if (/\bsystem\b|filter|exclude|automat|enforce/i.test(d)) return 'System';
  if (/\bpremium\b|subscri/i.test(d)) return 'Premium User';
  if (/\badmin|configur|manage/i.test(d)) return 'Admin';
  return 'User';
}

/**
 * Create flows from user story jobs.
 * When jobs have _interactionSteps (from structured user story parsing),
 * creates detailed flows using the actual Trigger/My Action/System Action data.
 * Falls back to generic flow templates for unstructured user stories.
 */
function createFlowsFromUserStoryJobs(jobs: Job[]): Flow[] {
  const userStoryJobs = jobs.filter(j => 
    j.job_id.startsWith('job_us') || 
    j.job_id.startsWith('job_us_standalone') ||
    j.job_id.startsWith('job_fr3') ||
    j.description.toLowerCase().includes('as a user') ||
    j.description.toLowerCase().includes('as an ') ||
    j.description.toLowerCase().includes('as a creator')
  );
  
  if (userStoryJobs.length === 0) return [];
  
  const flows: Flow[] = [];
  
  for (let i = 0; i < userStoryJobs.length; i++) {
    const job = userStoryJobs[i];
    if (!job) continue;
    const desc = job.description ?? '';
    
    // CASE 1: Structured interaction steps available (enterprise PRD format)
    if (job._interactionSteps && job._interactionSteps.length > 0) {
      const storyTitle = job._storyTitle ?? '';
      
      // Determine flow name from story title, or derive from capability
      const capMatch = desc.match(/I\s+(?:want|need|can)\s+(?:to\s+)?(.+?)(?:,\s*so\s+that|$)/i);
      const capText = capMatch?.[1]?.trim() ?? desc.slice(0, 60);
      const flowName = storyTitle || capText;
      
      // Determine flow type from content keywords
      let flowType = 'user_journey';
      if (/review|approv|verify/i.test(flowName + ' ' + desc)) flowType = 'review_approval';
      if (/troubleshoot|error|retry|fail/i.test(flowName + ' ' + desc)) flowType = 'error_handling';
      if (/book|load|post|ingest/i.test(flowName + ' ' + desc)) flowType = 'transaction';
      if (/reconcil|compar|validat/i.test(flowName + ' ' + desc)) flowType = 'reconciliation';
      if (/re-evaluat|trigger|aggregat/i.test(flowName + ' ' + desc)) flowType = 'batch_process';
      
      // Convert interaction steps to flow steps
      const steps: Array<{ step_id: string; actor_id: string; action: string; result: string }> = [];
      const actors = new Set<string>();
      
      for (let si = 0; si < job._interactionSteps.length; si++) {
        const interaction = job._interactionSteps[si]!;
        actors.add(interaction.actor);
        steps.push({
          step_id: `step_${i + 1}_${si + 1}`,
          actor_id: interaction.actor,
          action: interaction.action,
          result: interaction.result,
        });
      }
      
      const flowPrefix = job.job_id.startsWith('job_fr3') ? 'flow_fr3' : 'flow_us';
      flows.push({
        flow_id: `${flowPrefix}_${i + 1}`,
        name: flowName,
        type: flowType,
        actors: Array.from(actors),
        steps,
        linked_jobs: [job.job_id],
      });
      continue;
    }
    
    // CASE 2: Generic flow creation (fallback for unstructured user stories)
    const actionMatch = desc.match(/(?:as\s+a\s+(?:[\w\s]+),?\s*)?(?:I\s+(?:can|want|need)\s+(?:to\s+)?)?(.+)/i);
    const action = actionMatch?.[1]?.trim() || desc;
    
    // Determine the flow type based on content
    let flowType = 'user_journey';
    let flowName = `User Story #${i + 1}`;
    
    if (/search|retriev|query|find/i.test(desc)) {
      flowType = 'search';
      flowName = /personal|library|saved/i.test(desc) 
        ? `Personal ${action.slice(0, 40)}` 
        : `Search: ${action.slice(0, 40)}`;
    } else if (/save|library|add/i.test(desc)) {
      flowType = 'save';
      flowName = `Save: ${action.slice(0, 40)}`;
    } else if (/review|approv/i.test(desc)) {
      flowType = 'review_approval';
      flowName = `Review: ${action.slice(0, 40)}`;
    } else if (/book|post|load/i.test(desc)) {
      flowType = 'transaction';
      flowName = `Booking: ${action.slice(0, 40)}`;
    }
    
    // Generate detailed steps based on the action
    const steps: Array<{ step_id: string; actor_id: string; action: string; result: string }> = [];
    
    // Determine the primary actor role from the user story
    const roleMatch = desc.match(/As\s+(?:a|an)\s+(.+?),/i);
    const primaryActor = roleMatch?.[1]?.trim() ?? 'User';
    
    // Step 1: User initiates the action
    steps.push({
      step_id: `step_${i + 1}_1`,
      actor_id: primaryActor,
      action: `Initiate: ${action.slice(0, 60)}`,
      result: 'Request received by system',
    });
    
    // Step 2: System processes based on flow type
    if (flowType === 'search') {
      steps.push({
        step_id: `step_${i + 1}_2`,
        actor_id: 'System',
        action: 'Execute search query against indexed content',
        result: 'Matching results retrieved',
      });
      steps.push({
        step_id: `step_${i + 1}_3`,
        actor_id: 'System',
        action: 'Apply ranking and filtering logic',
        result: 'Results sorted and filtered per requirements',
      });
      steps.push({
        step_id: `step_${i + 1}_4`,
        actor_id: primaryActor,
        action: 'View and select from search results',
        result: `${primaryActor} finds desired content`,
      });
    } else if (flowType === 'save') {
      steps.push({
        step_id: `step_${i + 1}_2`,
        actor_id: 'System',
        action: 'Validate content can be saved',
        result: 'Content validation passed',
      });
      steps.push({
        step_id: `step_${i + 1}_3`,
        actor_id: 'System',
        action: 'Add content to user library',
        result: 'Content saved successfully',
      });
    } else if (flowType === 'review_approval') {
      steps.push({
        step_id: `step_${i + 1}_2`,
        actor_id: 'System',
        action: 'Present data for review',
        result: 'Review interface displayed with relevant data',
      });
      steps.push({
        step_id: `step_${i + 1}_3`,
        actor_id: primaryActor,
        action: 'Review presented data and approve or reject',
        result: job.success_outcome || 'Action approved successfully',
      });
      steps.push({
        step_id: `step_${i + 1}_4`,
        actor_id: 'System',
        action: 'Process approval decision',
        result: 'Status updated to reflect decision',
      });
    } else if (flowType === 'transaction') {
      steps.push({
        step_id: `step_${i + 1}_2`,
        actor_id: 'System',
        action: 'Prepare transaction data',
        result: 'Transaction data prepared and ready for review',
      });
      steps.push({
        step_id: `step_${i + 1}_3`,
        actor_id: primaryActor,
        action: 'Review and confirm transaction',
        result: job.success_outcome || 'Transaction confirmed',
      });
      steps.push({
        step_id: `step_${i + 1}_4`,
        actor_id: 'System',
        action: 'Execute transaction and update status',
        result: 'Transaction completed successfully',
      });
    } else {
      steps.push({
        step_id: `step_${i + 1}_2`,
        actor_id: 'System',
        action: 'Process user request',
        result: 'Request processed successfully',
      });
      steps.push({
        step_id: `step_${i + 1}_3`,
        actor_id: primaryActor,
        action: 'Confirm action completion',
        result: job.success_outcome || 'Action completed successfully',
      });
    }
    
    flows.push({
      flow_id: `flow_us_${i + 1}`,
      name: flowName,
      type: flowType,
      actors: [primaryActor, 'System'],
      steps,
      linked_jobs: [job.job_id],
    });
  }
  
  return flows;
}

/**
 * Create flows from requirement jobs.
 * Each requirement (job with id starting with job_req) becomes a validation flow.
 */
function createFlowsFromRequirementsJobs(jobs: Job[]): Flow[] {
  const requirementJobs = jobs.filter(j => j.job_id.startsWith('job_req'));
  
  if (requirementJobs.length === 0) return [];
  
  const flows: Flow[] = [];
  
  // Group related requirements into single flows where possible
  const requirementGroups: { [key: string]: Job[] } = {};
  
  for (const job of requirementJobs) {
    const desc = job.description.toLowerCase();
    const jobId = job.job_id;
    
    // Categorize requirements into groups
    let groupKey = 'general';
    
    // Check job_id for domain-specific grouping first (from extractJobsFromDomainSections)
    const domainMatch = jobId.match(/^job_req_([a-z_]+)_\d+$/);
    if (domainMatch && domainMatch[1]) {
      groupKey = domainMatch[1];
    }
    // Existing pattern-based grouping (for non-domain jobs)
    else if (/index|threshold|data/i.test(desc)) {
      groupKey = 'data_management';
    } else if (/search|retriev|query/i.test(desc)) {
      groupKey = 'search_behavior';
    } else if (/access|permission|authenticat|restrict/i.test(desc)) {
      groupKey = 'access_control';
    } else if (/surface|display|ui|interface|screen/i.test(desc)) {
      groupKey = 'ui_presentation';
    }
    // Financial domain fallback grouping (for jobs not from domain sections)
    else if (/onboard/i.test(desc)) {
      groupKey = 'onboarding';
    } else if (/tax|withhold|wht\b|vat\b/i.test(desc)) {
      groupKey = 'tax_management';
    } else if (/calculat/i.test(desc)) {
      groupKey = 'data_calculation';
    } else if (/booking|journal|ledger|netsuite|accrual/i.test(desc)) {
      groupKey = 'booking';
    } else if (/payout|payment|batch|hyperwallet/i.test(desc)) {
      groupKey = 'payouts';
    } else if (/report|csv/i.test(desc)) {
      groupKey = 'performance_reporting';
    } else if (/compliance|sox|fraud/i.test(desc)) {
      groupKey = 'sox_compliance';
    } else if (/reconcil/i.test(desc)) {
      groupKey = 'reconciliation';
    } else if (/terms|conditions/i.test(desc)) {
      groupKey = 'terms_conditions';
    }
    
    if (!requirementGroups[groupKey]) {
      requirementGroups[groupKey] = [];
    }
    requirementGroups[groupKey]!.push(job);
  }
  
  // Flow names by group key
  const flowNames: { [key: string]: string } = {
    // Existing
    data_management: 'Data Management & Indexing',
    search_behavior: 'Search Behavior',
    access_control: 'Access Control & Permissions',
    ui_presentation: 'UI Presentation',
    general: 'General Requirements',
    // Financial/ERP domains
    terms_conditions: 'Terms & Conditions Review',
    onboarding: 'Author Onboarding',
    data_calculation: 'Data Calculation & Aggregation',
    tax_management: 'Tax Management & Compliance',
    booking: 'Financial Booking & Journal Entries',
    performance_reporting: 'Performance Reporting',
    payouts: 'Payout Processing',
    payout_eligibility: 'Payout Eligibility Verification',
    payment_fraud: 'Payment Fraud Detection',
    payout_notes: 'Payout Note Generation',
    financial_reporting: 'Financial & Tax Reporting',
    data_reports: 'Report Generation',
    customer_support: 'Customer Support Enablement',
    sox_compliance: 'SOX Compliance',
    reconciliation: 'Financial Reconciliation',
  };
  
  // Domain-specific actors for financial flows
  const domainActors: { [key: string]: string[] } = {
    terms_conditions: ['Legal Team', 'System'],
    onboarding: ['Author', 'SFA Portal', 'PSL System'],
    data_calculation: ['System', 'Content Accounting'],
    tax_management: ['Tax Team', 'System'],
    booking: ['Content Accounting', 'System', 'NetSuite'],
    performance_reporting: ['System', 'Author'],
    payouts: ['PtP Team', 'System', 'Hyperwallet'],
    payout_eligibility: ['PSL System', 'System'],
    payment_fraud: ['Ravelin', 'PSL System'],
    payout_notes: ['System', 'Self-Published Author'],
    financial_reporting: ['Tax Team', 'System'],
    data_reports: ['System', 'Author'],
    customer_support: ['Customer Support', 'System'],
    sox_compliance: ['Compliance Team', 'System'],
    reconciliation: ['Content Accounting', 'System'],
  };
  
  // Financial domain group keys for checking
  const financialDomains = new Set(Object.keys(domainActors));
  
  // Create a flow for each requirement group
  let flowIndex = 0;
  for (const [groupKey, groupJobs] of Object.entries(requirementGroups)) {
    flowIndex++;
    
    const flowName = flowNames[groupKey] ?? 'Requirements Flow';
    const isFinancialDomain = financialDomains.has(groupKey);
    const actors = domainActors[groupKey] ?? ['System'];
    
    // Generate steps from each requirement in the group
    const steps: Array<{ step_id: string; actor_id: string; action: string; result: string }> = [];
    
    for (let i = 0; i < groupJobs.length; i++) {
      const job = groupJobs[i];
      if (!job) continue;
      
      // Parse requirement title and content
      const descParts = job.description.split(':');
      const reqTitle = descParts[0]?.trim() ?? `Requirement ${i + 1}`;
      const reqContent = descParts.slice(1).join(':').trim() || job.description;
      
      if (isFinancialDomain) {
        // For financial domains, create action-oriented steps with proper actors
        const stepActor = actors[i % actors.length] ?? actors[0] ?? 'System';
        const capitalizedContent = reqContent.charAt(0).toUpperCase() + reqContent.slice(1);
        steps.push({
          step_id: `step_req_${flowIndex}_${i + 1}`,
          actor_id: stepActor,
          action: capitalizedContent.slice(0, 120),
          result: `${reqTitle} requirement fulfilled`,
        });
      } else {
        // Original validation-style steps for non-financial domains
        steps.push({
          step_id: `step_req_${flowIndex}_${i + 1}`,
          actor_id: 'System',
          action: `Validate: ${reqTitle}`,
          result: reqContent.slice(0, 100) + (reqContent.length > 100 ? '...' : ''),
        });
      }
    }
    
    // Add completion step
    steps.push({
      step_id: `step_req_${flowIndex}_complete`,
      actor_id: isFinancialDomain ? (actors[actors.length - 1] ?? 'System') : 'System',
      action: `Complete ${flowName.toLowerCase()}`,
      result: `All ${groupJobs.length} requirements in ${flowName.toLowerCase()} satisfied`,
    });
    
    flows.push({
      flow_id: `flow_req_${flowIndex}`,
      name: flowName,
      type: isFinancialDomain ? 'domain_process' : 'validation',
      actors: isFinancialDomain ? [...new Set(actors)] : ['System'],
      steps,
      linked_jobs: groupJobs.map(j => j.job_id),
    });
  }
  
  return flows;
}

/**
 * Extract user flows verbatim from an explicit "User Flows" section in the PRD.
 * Returns flows with verbatim text from PRD, not synthesized content.
 */
function extractFlowsFromUserFlowsSection(
  sectionMap: SectionMap,
  jobs: Job[]
): { flows: Flow[]; found: boolean } {
  // Look for explicit User Flows sections
  const flowPatterns = [
    /^user\s*flows?$/i,
    /^flows?$/i,
    /^steps$/i,
    /^user\s*journey(?:s)?$/i,
    /^workflow(?:s)?$/i,
    /^happy\s*path$/i,
    /^error\s*path$/i,
    /^alternate\s*path$/i,
  ];
  
  const flowSections = sectionMap.sections.filter(s => 
    flowPatterns.some(p => p.test(s.section_title))
  );
  
  // Also search for inline flow definitions within sections (e.g., in Think It, Requirements, or JTBD blocks)
  // Look for patterns like "Flow A:", "Flow 1:", or "Flow Name:" within any section
  let inlineFlowText = '';
  let inlineFlowSectionId = '';
  
  if (flowSections.length === 0) {
    for (const section of sectionMap.sections) {
      const fullText = section.raw_text ?? '';
      
      // Check if the section contains flow definitions (Flow A:, Flow 1:, Flow Name:, etc.)
      if (/Flow\s+(?:[A-Z]|\d+)\s*:/i.test(fullText) || 
          /Flow\s*Name\s*:/i.test(fullText) ||
          /User\s*Flows?\s*&\s*Interaction/i.test(fullText) ||
          /Detailed\s*User\s*Flows/i.test(fullText)) {
        // Extract the flow portion from the section
        const flowStart = fullText.search(/(?:User\s*Flows|Flow\s+(?:[A-Z]|\d+)\s*:|Flow\s*Name\s*:)/i);
        if (flowStart >= 0) {
          inlineFlowText = fullText.slice(flowStart);
          inlineFlowSectionId = section.section_id;
          break;
        }
      }
      
      // Also check subsections
      for (const sub of section.subsections ?? []) {
        const subText = sub.raw_text ?? '';
        if (/Flow\s+(?:[A-Z]|\d+)\s*:/i.test(subText) || /Flow\s*Name\s*:/i.test(subText)) {
          inlineFlowText = subText;
          inlineFlowSectionId = sub.subsection_id;
          break;
        }
      }
      if (inlineFlowText.trim().length >= 20) break;
    }
  }
  
  const flows: Flow[] = [];
  
  // Process dedicated flow sections first
  for (const flowSection of flowSections) {
    if (!flowSection.raw_text || flowSection.raw_text.trim().length < 20) continue;
    
    const rawText = flowSection.raw_text;
    const lines = rawText.split('\n');
    
    // Determine flow type from section title
    let flowType = 'user_journey';
    if (/happy\s*path/i.test(flowSection.section_title)) flowType = 'happy_path';
    if (/error\s*path/i.test(flowSection.section_title)) flowType = 'error_path';
    if (/alternate\s*path/i.test(flowSection.section_title)) flowType = 'alternate_path';
    
    // If section contains "Flow N:", "Flow Name:", patterns, try nested flow format FIRST
    // This ensures multiple named flows within a section are properly separated
    const hasNamedFlows = /Flow\s+(?:\d+|[A-Z])\s*:/i.test(rawText) || /Flow\s*Name\s*:/i.test(rawText);
    
    if (hasNamedFlows) {
      const nestedFlows = parseNestedFlowFormat(lines, flowSection.section_id, jobs);
      if (nestedFlows.length > 0) {
        flows.push(...nestedFlows);
        continue;
      }
    }
    
    // Try to parse as table format (Actor | Action | Result)
    const tableSteps = parseTableFormat(lines);
    
    if (tableSteps.length > 0) {
      const flowId = `flow_${flowSection.section_id}`;
      flows.push({
        flow_id: flowId,
        name: flowSection.section_title,
        type: flowType,
        actors: [...new Set(tableSteps.map(s => s.actor_id))],
        steps: tableSteps,
        linked_jobs: jobs.slice(0, 2).map(j => j.job_id),
      });
      continue;
    }
    
    // Try to parse as numbered/bulleted steps
    const bulletSteps = parseBulletStepFormat(lines);
    
    if (bulletSteps.length > 0) {
      const flowId = `flow_${flowSection.section_id}`;
      flows.push({
        flow_id: flowId,
        name: flowSection.section_title,
        type: flowType,
        actors: [...new Set(bulletSteps.map(s => s.actor_id))],
        steps: bulletSteps,
        linked_jobs: jobs.slice(0, 2).map(j => j.job_id),
      });
      continue;
    }
    
    // Try nested flow format as fallback
    if (!hasNamedFlows) {
      const nestedFlows = parseNestedFlowFormat(lines, flowSection.section_id, jobs);
      if (nestedFlows.length > 0) {
        flows.push(...nestedFlows);
      }
    }
  }
  
  // If no dedicated sections found, try to parse inline flows
  if (flows.length === 0 && inlineFlowText.trim().length >= 20) {
    // Try nested flow format first (handles "Flow Name:" and "Flow N:" patterns)
    const hasInlineNamedFlows = /Flow\s+(?:\d+|[A-Z])\s*:/i.test(inlineFlowText) || /Flow\s*Name\s*:/i.test(inlineFlowText);
    if (hasInlineNamedFlows) {
      const nestedFlows = parseNestedFlowFormat(inlineFlowText.split('\n'), inlineFlowSectionId, jobs);
      if (nestedFlows.length > 0) {
        flows.push(...nestedFlows);
      }
    }
    // Fallback to table-based inline flow parsing
    if (flows.length === 0) {
      const inlineFlows = parseInlineFlowsWithTables(inlineFlowText, inlineFlowSectionId, jobs);
      if (inlineFlows.length > 0) {
        flows.push(...inlineFlows);
      }
    }
  }
  
  // If still no flows found, try reconstructing flows from fragmented sections
  // This handles cases where table rows were incorrectly parsed as separate sections
  if (flows.length === 0) {
    const reconstructedFlows = reconstructFlowsFromFragmentedSections(sectionMap, jobs);
    if (reconstructedFlows.length > 0) {
      flows.push(...reconstructedFlows);
    }
  }
  
  return { flows, found: flows.length > 0 };
}

/**
 * Reconstruct flows from fragmented sections where table rows became separate sections.
 * This handles PRDs where "A1", "B1", "PM", etc. were incorrectly recognized as headings.
 */
function reconstructFlowsFromFragmentedSections(
  sectionMap: SectionMap,
  jobs: Job[]
): Flow[] {
  // Concatenate all sections INCLUDING titles (since step IDs like "A1" may be section titles)
  const allText = sectionMap.sections
    .map(s => `${s.section_title}\n${s.raw_text ?? ''}`)
    .join('\n');
  
  // Check if there are flow patterns in the combined text
  if (!/Flow\s+[A-Z]:\s*(?:The\s+)?["']?[^"'\n]+/i.test(allText)) {
    return [];
  }
  
  const flows: Flow[] = [];
  
  // Extract flow definitions using regex
  // Pattern: Flow A: The "Name" (Description)
  const flowHeaderPattern = /Flow\s+([A-Z]):\s*(?:The\s+)?["']?([^"'\n(]+)["']?\s*(?:\(([^)]+)\))?/gi;
  const flowMatches = [...allText.matchAll(flowHeaderPattern)];
  
  for (let i = 0; i < flowMatches.length; i++) {
    const match = flowMatches[i];
    if (!match) continue;
    
    const flowLetter = match[1] || '';
    const flowName = match[2]?.trim() || `Flow ${flowLetter}`;
    const flowDesc = match[3]?.trim() || '';
    
    // Find the content between this flow header and the next (or end of document)
    const startIdx = match.index! + match[0].length;
    const nextMatch = flowMatches[i + 1];
    const endIdx = nextMatch?.index ?? allText.length;
    
    const flowContent = allText.slice(startIdx, endIdx);
    
    // Extract objective if present (for potential future use)
    // const objectiveMatch = flowContent.match(/Objective:\s*([^\n]+)/i);
    
    // Extract steps from table format
    // Look for patterns like: A1\nActor\tAction\tResponse\tResult (fragmented across sections)
    const steps: Array<{ step_id: string; actor_id: string; action: string; result: string }> = [];
    
    // Pattern to find step rows - handle both:
    // 1. Inline format: A1\tSystem\tAction\tResponse\tResult
    // 2. Fragmented format: A1\nSystem\n\tAction\n\tResponse\n\tResult
    
    // First try inline format
    const inlineStepPattern = new RegExp(`${flowLetter}(\\d+)[\\t\\s]+([^\\n]+)`, 'gi');
    const inlineStepMatches = [...flowContent.matchAll(inlineStepPattern)];
    
    for (const stepMatch of inlineStepMatches) {
      const stepNum = stepMatch[1] || '';
      const stepContent = stepMatch[2] || '';
      
      // Split by tabs or multiple spaces
      const parts = stepContent.split(/\t+|\s{2,}/).map(p => p.trim()).filter(Boolean);
      
      if (parts.length >= 2) {
        const actor = parts[0] || 'User';
        const action = parts[1] || '';
        const response = parts[2] || '';
        const result = parts[3] || response;
        
        if (action) {
          steps.push({
            step_id: `step_${flowLetter}${stepNum}`,
            actor_id: actor,
            action: action,
            result: result,
          });
        }
      }
    }
    
    // If no inline steps found, try fragmented format
    if (steps.length === 0) {
      // Look for step ID followed by Actor on next line, then tab-separated content
      // Pattern: A1\nActor\n\tAction\n\tResponse\n\tResult
      const fragmentedPattern = new RegExp(
        `${flowLetter}(\\d+)\\s*\\n([^\\n]+)\\n\\t([^\\n]+)\\n\\t([^\\n]+)\\n\\t([^\\n]+)`,
        'gi'
      );
      const fragmentedMatches = [...flowContent.matchAll(fragmentedPattern)];
      
      for (const stepMatch of fragmentedMatches) {
        const stepNum = stepMatch[1] || '';
        const actor = stepMatch[2]?.trim() || 'User';
        const action = stepMatch[3]?.trim() || '';
        const response = stepMatch[4]?.trim() || '';
        const result = stepMatch[5]?.trim() || response;
        
        if (action) {
          steps.push({
            step_id: `step_${flowLetter}${stepNum}`,
            actor_id: actor,
            action: action,
            result: result,
          });
        }
      }
    }
    
    // If still no steps, try alternative fragmented format (sections as rows)
    if (steps.length === 0) {
      // Find all step IDs for this flow letter in sequence
      const stepIdPattern = new RegExp(`\\b${flowLetter}(\\d+)\\b`, 'gi');
      const stepIdMatches = [...flowContent.matchAll(stepIdPattern)];
      
      for (const idMatch of stepIdMatches) {
        const stepNum = idMatch[1] || '';
        const stepIdx = idMatch.index ?? 0;
        
        // Look for actor and action content after the step ID
        // Content is typically in the following lines
        const afterStepId = flowContent.slice(stepIdx + idMatch[0].length);
        const lines = afterStepId.split('\n').slice(0, 5).map(l => l.trim()).filter(Boolean);
        
        if (lines.length >= 2) {
          const actor = lines[0] || 'User';
          const action = lines[1]?.replace(/^\t+/, '') || '';
          const response = lines[2]?.replace(/^\t+/, '') || '';
          const result = lines[3]?.replace(/^\t+/, '') || response;
          
          if (action && !steps.some(s => s.step_id === `step_${flowLetter}${stepNum}`)) {
            steps.push({
              step_id: `step_${flowLetter}${stepNum}`,
              actor_id: actor,
              action: action,
              result: result,
            });
          }
        }
      }
    }
    
    // Only add the flow if we found steps
    if (steps.length > 0) {
      flows.push({
        flow_id: `flow_${flowLetter.toLowerCase()}`,
        name: flowDesc ? `${flowName} - ${flowDesc}` : flowName,
        type: 'user_journey',
        actors: [...new Set(steps.map(s => s.actor_id))],
        steps,
        linked_jobs: jobs.slice(0, 2).map(j => j.job_id),
      });
    }
  }
  
  return flows;
}

/**
 * Parse inline flows with tab-separated table format
 * Format:
 * Flow A: The "Intake & Proposal" (Moving from Pipeline to Stack-Rank)
 * Objective: To transition an initiative...
 * Step	Actor	Action	System Response	Data Result (State)
 * A1	System	Automated JIRA Scan...	Pulls new tickets...	New records created...
 */
function parseInlineFlowsWithTables(
  rawText: string,
  sectionId: string,
  jobs: Job[]
): Flow[] {
  const flows: Flow[] = [];
  const lines = rawText.split('\n');
  
  let currentFlow: {
    name: string;
    objective: string;
    steps: Array<{ step_id: string; actor_id: string; action: string; result: string }>;
  } | null = null;
  
  let columnMap: { step: number; actor: number; action: number; response: number; result: number } | null = null;
  let flowIndex = 0;
  
  const saveCurrentFlow = () => {
    if (currentFlow && currentFlow.steps.length > 0) {
      flowIndex++;
      flows.push({
        flow_id: `flow_${sectionId}_${flowIndex}`,
        name: currentFlow.name,
        type: 'user_journey',
        actors: [...new Set(currentFlow.steps.map(s => s.actor_id))],
        steps: currentFlow.steps,
        linked_jobs: jobs.slice(0, 2).map(j => j.job_id),
      });
    }
    currentFlow = null;
    columnMap = null;
  };
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Check for flow header: "Flow A: The "Intake & Proposal" (...)"
    const flowHeaderMatch = trimmed.match(/^Flow\s+([A-Z]):\s*(?:The\s+)?["']?([^"'(]+)["']?\s*(?:\(([^)]+)\))?/i);
    if (flowHeaderMatch) {
      saveCurrentFlow();
      const flowLetter = flowHeaderMatch[1] || '';
      const flowName = flowHeaderMatch[2]?.trim() || `Flow ${flowLetter}`;
      const flowDesc = flowHeaderMatch[3]?.trim() || '';
      currentFlow = {
        name: flowDesc ? `${flowName} - ${flowDesc}` : flowName,
        objective: '',
        steps: [],
      };
      continue;
    }
    
    // Check for objective line
    if (currentFlow && /^Objective:\s*/i.test(trimmed)) {
      currentFlow.objective = trimmed.replace(/^Objective:\s*/i, '').trim();
      continue;
    }
    
    // Check for table header (tab-separated or pipe-separated)
    // Format: Step	Actor	Action	System Response	Data Result (State)
    const isTableHeader = /^Step\s*[\t|].*Actor\s*[\t|].*Action/i.test(trimmed) ||
                         /^Step\s+Actor\s+Action/i.test(trimmed);
    
    if (isTableHeader && currentFlow) {
      // Parse column positions from header
      const cells = trimmed.split(/\t+|\s{2,}|\|/).map(c => c.trim().toLowerCase());
      columnMap = {
        step: cells.findIndex(c => /^step$/i.test(c)),
        actor: cells.findIndex(c => /^actor$/i.test(c)),
        action: cells.findIndex(c => /^action$/i.test(c)),
        response: cells.findIndex(c => /response|system/i.test(c)),
        result: cells.findIndex(c => /result|state|data/i.test(c)),
      };
      // Set defaults if not found
      if (columnMap.step < 0) columnMap.step = 0;
      if (columnMap.actor < 0) columnMap.actor = 1;
      if (columnMap.action < 0) columnMap.action = 2;
      if (columnMap.response < 0) columnMap.response = 3;
      if (columnMap.result < 0) columnMap.result = 4;
      continue;
    }
    
    // Skip divider lines
    if (/^_{5,}$/.test(trimmed) || /^-{5,}$/.test(trimmed)) {
      saveCurrentFlow();
      continue;
    }
    
    // Parse table data row
    if (currentFlow && columnMap) {
      // Split by tabs or multiple spaces
      const cells = trimmed.split(/\t+|\s{2,}/).map(c => c.trim());
      
      // Check if this looks like a step row (starts with A1, B1, C1, D1, etc. or a number)
      const firstCell = cells[0] ?? '';
      const looksLikeStepRow = /^[A-Z]\d+$/i.test(firstCell) || /^\d+$/.test(firstCell);
      
      if (looksLikeStepRow && cells.length >= 3) {
        const stepId = firstCell;
        const actor = cells[columnMap.actor] || cells[1] || 'User';
        const action = cells[columnMap.action] || cells[2] || '';
        const response = cells[columnMap.response] || cells[3] || '';
        const result = cells[columnMap.result] || cells[4] || response;
        
        if (action) {
          currentFlow.steps.push({
            step_id: `step_${stepId}`,
            actor_id: actor,
            action: action,
            result: result,
          });
        }
      }
    }
  }
  
  // Save the last flow
  saveCurrentFlow();
  
  return flows;
}

/**
 * Parse table format: Actor | Action | Result (or tab-separated)
 */
function parseTableFormat(lines: string[]): Array<{ step_id: string; actor_id: string; action: string; result: string }> {
  const steps: Array<{ step_id: string; actor_id: string; action: string; result: string }> = [];
  
  // Look for table header row
  let headerFound = false;
  let stepCol = -1;
  let actorCol = -1;
  let actionCol = -1;
  let resultCol = -1;
  let hasExplicitStepCol = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || /^\|?[\s-]+\|/.test(trimmed) || /^-{3,}$/.test(trimmed)) continue;
    
    // Determine separator type
    const hasTabs = trimmed.includes('\t');
    const hasPipes = trimmed.includes('|');
    
    // Skip if no separators found
    if (!hasTabs && !hasPipes) continue;
    
    // Split by tabs or pipes
    let cells: string[];
    if (hasTabs) {
      cells = trimmed.split(/\t+/).map(c => c.trim()).filter(c => c.length > 0);
    } else {
      cells = trimmed.split('|').map(c => c.trim()).filter(c => c.length > 0);
    }
    
    // Try to identify header row
    if (!headerFound) {
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i]?.toLowerCase() || '';
        if (/^step$/i.test(cell)) { stepCol = i; hasExplicitStepCol = true; }
        if (/^(?:actor|user|role|who)$/i.test(cell)) actorCol = i;
        if (/^action$/i.test(cell)) actionCol = i;
        if (/^(?:result|outcome|response|then|expected|state)$/i.test(cell)) resultCol = i;
      }
      
      if (actorCol >= 0 || actionCol >= 0) {
        headerFound = true;
        // Set defaults if not all columns found
        if (!hasExplicitStepCol) {
          // No step column — Actor | Action | Result layout
          if (actorCol < 0) actorCol = 0;
          if (actionCol < 0) actionCol = actorCol + 1;
          if (resultCol < 0) resultCol = actionCol + 1;
        } else {
          if (actorCol < 0) actorCol = stepCol + 1;
          if (actionCol < 0) actionCol = actorCol + 1;
          if (resultCol < 0) resultCol = actionCol + 1;
        }
        continue; // Skip header row
      }
    }
    
    // Parse data row
    if (headerFound && cells.length >= 2) {
      if (hasExplicitStepCol) {
        // Check if this looks like a data row (step column has A1, B1, C1, etc. or just numbers)
        const stepCell = cells[stepCol] || cells[0] || '';
        const looksLikeDataRow = /^[A-Z]?\d+$/i.test(stepCell);
        
        if (looksLikeDataRow) {
          const actor = cells[actorCol] || cells[1] || 'User';
          const action = cells[actionCol] || cells[2] || '';
          const result = cells[resultCol] || cells[3] || '';
          
          if (action) {
            steps.push({
              step_id: `step_${stepCell || String(steps.length + 1).padStart(2, '0')}`,
              actor_id: actor,
              action: action,
              result: result,
            });
          }
        }
      } else {
        // No step column — every non-separator row with enough cells is a data row
        const actor = cells[actorCol] || 'User';
        const action = cells[actionCol] || '';
        const result = cells[resultCol] || '';
        
        if (action) {
          steps.push({
            step_id: `step_${String(steps.length + 1).padStart(2, '0')}`,
            actor_id: actor,
            action: action,
            result: result,
          });
        }
      }
    }
  }
  
  return steps;
}

/**
 * Parse bullet/numbered step format with Actor, Action, Result labels
 */
function parseBulletStepFormat(lines: string[]): Array<{ step_id: string; actor_id: string; action: string; result: string }> {
  const steps: Array<{ step_id: string; actor_id: string; action: string; result: string }> = [];
  
  let currentStep: { actor_id?: string; action?: string; result?: string } = {};
  
  const saveCurrentStep = () => {
    if (currentStep.action || (currentStep.actor_id && currentStep.result)) {
      steps.push({
        step_id: `step_${String(steps.length + 1).padStart(2, '0')}`,
        actor_id: currentStep.actor_id || 'User',
        action: currentStep.action || currentStep.result || '',
        result: currentStep.result || '',
      });
    }
    currentStep = {};
  };
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Skip section dividers
    if (/^[=_-]{5,}$/.test(trimmed)) continue;
    
    // Check for combined format: "1. Actor: User Action: Open... Result: ..."
    // Actor, Action, and optionally Result on the same line. Result may be partial (continues on next line).
    const combinedWithResultMatch = trimmed.match(/^(?:\d+[\.\)]\s*)?Actor\s*:\s*(\w+(?:\s*\([^)]*\))?)\s+Action\s*:\s*(.+?)\s+Result\s*:\s*(.*)$/i);
    if (combinedWithResultMatch && combinedWithResultMatch[1] && combinedWithResultMatch[2]) {
      saveCurrentStep();
      const resultText = (combinedWithResultMatch[3] ?? '').trim();
      currentStep = {
        actor_id: combinedWithResultMatch[1].trim(),
        action: combinedWithResultMatch[2].trim(),
        result: resultText,
      };
      // If Result: had content, it might still continue on the next line
      // Don't save yet - let continuation lines append to the result
      if (resultText) {
        // Peek ahead: if next non-empty line is indented (continuation), wait for it
        // Otherwise save now
        const nextIdx = lines.indexOf(line) + 1;
        const nextLine = nextIdx < lines.length ? (lines[nextIdx] ?? '') : '';
        if (nextLine.match(/^\s{2,}\S/) && !/Actor\s*:/i.test(nextLine)) {
          // Next line is a continuation - don't save yet
        } else {
          saveCurrentStep();
        }
      }
      continue;
    }
    // Actor + Action without Result on same line (Result on next line)
    const combinedMatch = trimmed.match(/^(?:\d+[\.\)]\s*)?Actor\s*:\s*(\w+(?:\s*\([^)]*\))?)\s+Action\s*:\s*(.+)$/i);
    if (combinedMatch && combinedMatch[1] && combinedMatch[2]) {
      saveCurrentStep();
      currentStep = { actor_id: combinedMatch[1].trim(), action: combinedMatch[2].trim() };
      continue;
    }
    
    // Check for step number starting a new step: "1. Actor: System"
    // This format has the step number followed by a labeled field
    const numberedLabeledMatch = trimmed.match(/^(\d+)[\.\)]\s*(?:Actor|User|Role)\s*[:]\s*(.+)$/i);
    if (numberedLabeledMatch && numberedLabeledMatch[2]) {
      saveCurrentStep();
      currentStep = { actor_id: numberedLabeledMatch[2].trim() };
      continue;
    }
    
    // Check for "Result:" that might appear on its own line or as continuation (indented)
    // This handles wrapping from the previous line: "Actor: User Action: Open...\n    Result: ..."
    const resultOnlyMatch = trimmed.match(/^Result\s*[:]\s*(.*)$/i);
    if (resultOnlyMatch && currentStep.action) {
      const resultContent = (resultOnlyMatch[1] ?? '').trim();
      currentStep.result = resultContent;
      // If Result: has no content on this line, the next indented line has it
      if (!resultContent) {
        // Don't save yet - wait for continuation
      } else {
        saveCurrentStep();
      }
      continue;
    }
    
    // Indented continuation line: append to current step's result or action
    if (line.match(/^\s{2,}/) && currentStep.action && trimmed.length > 0 && !/^\d+[\.\)]/.test(trimmed) && !/^Actor\s*:/i.test(trimmed)) {
      if (currentStep.result !== undefined) {
        // Append to result (continuation of Result: from previous line)
        currentStep.result = currentStep.result ? `${currentStep.result} ${trimmed}` : trimmed;
        saveCurrentStep();
      }
      continue;
    }
    
    // Check for labeled lines (indented or not)
    const actorMatch = trimmed.match(/^(?:Actor|User|Role|Who)\s*[:]\s*(.+)$/i);
    const actionMatch = trimmed.match(/^(?:Action|Step|Does|What)\s*[:]\s*(.+)$/i);
    const resultMatch = trimmed.match(/^(?:Result|Outcome|Then|Expected)\s*[:]\s*(.+)$/i);
    
    if (actorMatch && actorMatch[1]) {
      // If we already have a complete step (actor + action + result), save it first
      if (currentStep.action && currentStep.result) saveCurrentStep();
      // If this is a brand new step (no current step started), or we need to start fresh
      if (!currentStep.actor_id && !currentStep.action) {
        currentStep = { actor_id: actorMatch[1].trim() };
      } else if (currentStep.actor_id && currentStep.action) {
        // We have a previous complete step without result yet, but this starts a new step
        saveCurrentStep();
        currentStep = { actor_id: actorMatch[1].trim() };
      } else {
        currentStep.actor_id = actorMatch[1].trim();
      }
      continue;
    }
    
    if (actionMatch && actionMatch[1]) {
      currentStep.action = actionMatch[1].trim();
      continue;
    }
    
    if (resultMatch && resultMatch[1]) {
      currentStep.result = resultMatch[1].trim();
      // After getting result, this step is complete - save it
      saveCurrentStep();
      continue;
    }
    
    // Check for inline format: "Actor does action -> result"
    const inlineMatch = trimmed.match(/^(.+?)\s+(?:does|performs|clicks|enters|selects|navigates|reviews|submits)\s+(.+?)(?:\s*[-→>]+\s*(.+))?$/i);
    if (inlineMatch && inlineMatch[1] && inlineMatch[2]) {
      saveCurrentStep();
      currentStep = {
        actor_id: inlineMatch[1].trim(),
        action: inlineMatch[2].trim(),
        result: inlineMatch[3]?.trim() || '',
      };
      continue;
    }
    
    // Check for step number/bullet starting a new step
    const stepMatch = trimmed.match(/^(?:Step\s*)?(\d+)[\.\):]?\s*(.*)$/i);
    const bulletMatch = trimmed.match(/^[-*•]\s+(.+)$/);
    
    // Check for numbered step without labels (assume action)
    if (stepMatch && stepMatch[2] && stepMatch[2].length > 3) {
      saveCurrentStep();
      currentStep.action = stepMatch[2].trim();
      continue;
    }
    
    // Check for bullet without labels (assume action)
    if (bulletMatch && bulletMatch[1]) {
      const labeledBullet = bulletMatch[1].match(/^(.+?)\s*[:]\s*(.+)$/);
      if (labeledBullet) {
        const label = labeledBullet[1]?.toLowerCase() || '';
        const value = labeledBullet[2]?.trim() || '';
        if (/actor|user|role|who/i.test(label)) {
          currentStep.actor_id = value;
        } else if (/action|step|does|what/i.test(label)) {
          currentStep.action = value;
        } else if (/result|outcome|then|expected/i.test(label)) {
          currentStep.result = value;
          saveCurrentStep();
        } else {
          if (currentStep.action) saveCurrentStep();
          currentStep.action = bulletMatch[1].trim();
        }
      } else {
        if (currentStep.action) saveCurrentStep();
        currentStep.action = bulletMatch[1].trim();
      }
      continue;
    }
  }
  
  saveCurrentStep();
  
  return steps;
}

/**
 * Parse nested flow format where flow names are headers followed by steps
 */
function parseNestedFlowFormat(
  lines: string[],
  sectionId: string,
  jobs: Job[]
): Flow[] {
  const flows: Flow[] = [];
  let currentFlow: { name: string; steps: Array<{ step_id: string; actor_id: string; action: string; result: string }> } | null = null;
  let flowIndex = 0;
  
  const saveCurrentFlow = () => {
    if (currentFlow && currentFlow.steps.length > 0) {
      flowIndex++;
      flows.push({
        flow_id: `flow_${sectionId}_${flowIndex}`,
        name: currentFlow.name,
        type: 'user_journey',
        actors: [...new Set(currentFlow.steps.map(s => s.actor_id))],
        steps: currentFlow.steps,
        linked_jobs: jobs.slice(0, 2).map(j => j.job_id),
      });
    }
    currentFlow = null;
  };
  
  // Collect lines per flow, then parse each flow's steps using parseBulletStepFormat
  let currentFlowLines: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines and dividers
    if (!trimmed || /^[=_-]{5,}$/.test(trimmed)) continue;
    
    // Check for flow name header (bold text, ### header, "Flow N:", or "Flow Name:")
    const flowNameMatch = trimmed.match(/^(?:\*\*(.+?)\*\*|###?\s*(.+)|(?:Flow\s+\d+\s*[:.]?\s*)(.+)|(?:Flow\s*Name\s*[:]\s*)(.+))$/);
    if (flowNameMatch) {
      const flowName = (flowNameMatch[1] || flowNameMatch[2] || flowNameMatch[3] || flowNameMatch[4] || '').trim();
      if (flowName && flowName.length < 100) {
        // Save previous flow
        if (currentFlow && currentFlowLines.length > 0) {
          currentFlow.steps = parseBulletStepFormat(currentFlowLines);
          saveCurrentFlow();
        }
        currentFlow = { name: flowName, steps: [] };
        currentFlowLines = [];
        continue;
      }
    }
    
    // Collect lines for the current flow
    if (currentFlow) {
      currentFlowLines.push(line);
    }
  }
  
  // Save last flow
  if (currentFlow && currentFlowLines.length > 0) {
    currentFlow.steps = parseBulletStepFormat(currentFlowLines);
    saveCurrentFlow();
  }
  
  return flows;
}

function extractJobsFromSections(
  sectionMap: SectionMap,
  summaryText: string,
  objectiveText: string,
  problemText: string
): Array<{
  job_id: string;
  description: string;
  trigger: string;
  success_outcome: string;
  priority: 'must' | 'should' | 'could';
}> {
  const jobs: Array<{
    job_id: string;
    description: string;
    trigger: string;
    success_outcome: string;
    priority: 'must' | 'should' | 'could';
  }> = [];

  const journeyPatterns = [/^\d+\.\d+\s+/, /user.*journey/i, /user.*segment/i, /use.*case/i, /scenario/i, /job.*to.*be.*done/i];

  for (const section of sectionMap.sections) {
    const isJourneySection = journeyPatterns.some(p => p.test(section.section_title));
    const hasUserGoal = /user\s*goal/i.test(section.raw_text);

    if (isJourneySection || hasUserGoal) {
      const rawText = section.raw_text;

      const userGoalMatch = rawText.match(/user\s*goal[:\s]*(.+?)(?:\n|$)/i);
      const currentStateMatch = rawText.match(/current\s*state[:\s]*(.+?)(?:\n|$)/i);
      const solutionMatch = rawText.match(/(?:mvp\s*)?solution[:\s]*(.+?)(?:\n|$)/i);

      const cleanTitle = section.section_title
        .replace(/^\d+\.\d+\s*/, '')
        .replace(/[*_#]/g, '')
        .trim();

      const userGoal = userGoalMatch?.[1]?.trim() || '';
      const trigger = currentStateMatch?.[1]?.trim() || `User needs to ${cleanTitle.toLowerCase()}`;
      const outcome = solutionMatch?.[1]?.trim() || userGoal || `${cleanTitle} is completed successfully`;

      jobs.push({
        job_id: `job_${section.section_id}`,
        description: userGoal || `Enable users to ${cleanTitle.toLowerCase()}`,
        trigger: trigger.length > 100 ? trigger.slice(0, 100) + '...' : trigger,
        success_outcome: outcome.length > 100 ? outcome.slice(0, 100) + '...' : outcome,
        priority: 'must',
      });
    }
  }

  // If no explicit journey sections found, derive jobs from Summary/Objective/Problem
  if (jobs.length === 0) {
    // First, try to extract jobs from "We will" / "Proposed Solution" sections
    // Note: Use find with raw_text check to skip empty sections
    const solutionSection = sectionMap.sections.find(s => 
      s.raw_text && s.raw_text.length > 50 && (
        /^we\s*will$/i.test(s.section_title) ||
        /proposed\s*solution/i.test(s.section_title) ||
        /phases/i.test(s.section_title)
      )
    );
    
    if (solutionSection?.raw_text) {
      const lines = solutionSection.raw_text.split('\n');
      let lastPhaseNumber = 0; // Track the last seen top-level phase number
      
      for (const line of lines) {
        // Match numbered items that look like phases
        const lineMatch = line.match(/^\s*(\d+)\.\s+(.+)$/);
        if (lineMatch && lineMatch[1] && lineMatch[2]) {
          const num = parseInt(lineMatch[1], 10);
          const text = lineMatch[2].trim();
          
          // Check if this looks like a top-level phase (starts with action verb)
          const looksLikePhase = /^[A-Z][a-z]+\s/.test(text) && 
            /^(Onboard|Change|Run|Scale|Migrate|Build|Create|Design|Implement|Deploy|Launch|Decommission|Remove|Update|Enable|Configure|Integrate|Test|Validate)/i.test(text);
          
          // Only consider it a top-level phase if:
          // 1. Number is 1-9
          // 2. Looks like a phase (starts with action verb)
          // 3. Number is greater than the last phase number (ensures sequential phases)
          // 4. Haven't exceeded 6 phases
          if (num > 0 && num <= 9 && looksLikePhase && num > lastPhaseNumber && jobs.length < 6) {
            lastPhaseNumber = num;
            jobs.push({
              job_id: `job_phase_${num}`,
              description: text.slice(0, 200),
              trigger: problemText.slice(0, 100) || 'Business need identified',
              success_outcome: `${text.split('/')[0]?.trim() ?? text} completed successfully`,
              priority: jobs.length === 0 ? 'must' : 'should',
            });
          }
        }
      }
    }
    
    // If still no jobs from phases, try summary/objective
    if (jobs.length === 0) {
      // Extract job from Summary (first sentence is usually the main job)
      const summaryFirstSentence = summaryText.split(/[.!?]/)[0]?.trim() || '';
      
      // Extract objective if available
      const objectiveMatch = objectiveText.match(/^(?:Objective[:\s]*)?(.+?)(?:\s*Key Result|$)/i);
      const objectiveDesc = objectiveMatch?.[1]?.trim() || '';
      
      // Extract key results as separate jobs
      const keyResultMatches = objectiveText.matchAll(/Key Result \d+[:\s]*([^\n]+)/gi);
      let krIndex = 0;
      for (const match of keyResultMatches) {
        if (match[1]) {
          krIndex++;
          jobs.push({
            job_id: `job_key_result_${krIndex}`,
            description: match[1].trim(),
            trigger: problemText.slice(0, 100) || 'Current process has friction or gaps',
            success_outcome: match[1].trim(),
            priority: krIndex === 1 ? 'must' : 'should',
          });
        }
      }
      
      // Add primary job from summary/objective if no key results found or as main job
      if (summaryFirstSentence || objectiveDesc) {
        const mainDesc = objectiveDesc || summaryFirstSentence;
        const mainTrigger = problemText ? problemText.split('\n')[0]?.slice(0, 150) || '' : 'Business need identified';
        
        jobs.unshift({
          job_id: 'job_primary',
          description: mainDesc.slice(0, 200),
          trigger: mainTrigger,
          success_outcome: mainDesc.slice(0, 150),
          priority: 'must',
        });
      }
    }
  }

  // Fallback if still no jobs
  if (jobs.length === 0) {
    jobs.push({
      job_id: 'job_primary_goal',
      description: 'Achieve the primary outcome defined in the PRD',
      trigger: 'User needs the capability described in the PRD',
      success_outcome: 'The primary goal is achieved',
      priority: 'must',
    });
  }

  return jobs;
}

/**
 * Determines the best actor for an action based on keywords
 */
function determineActor(action: string, context: string): string {
  const actionLower = action.toLowerCase();
  const contextLower = context.toLowerCase();
  
  // System/automated actions
  if (/\b(system|automatically|scheduled|batch|pipeline|cron|trigger|ingest|etl)\b/i.test(actionLower)) {
    return 'System';
  }
  
  // Admin actions
  if (/\b(configure|setup|admin|permission|access|deploy|infrastructure)\b/i.test(actionLower)) {
    return 'System Admin';
  }
  
  // Finance-specific actions
  if (/\b(royalty|revenue|payment|invoice|settlement|calculation|mlc|billing|finance)\b/i.test(actionLower + contextLower)) {
    return 'Finance User';
  }
  
  // Data/analytics actions
  if (/\b(report|analytics|dashboard|metric|kpi|insight)\b/i.test(actionLower)) {
    return 'Analyst';
  }
  
  // Operations
  if (/\b(monitor|review|approve|validate|verify|audit)\b/i.test(actionLower)) {
    return 'Operations User';
  }
  
  return 'User';
}

/**
 * Creates a well-structured action statement with a strong verb
 */
function createActionStatement(rawAction: string, stepType: string): string {
  const actionLower = rawAction.toLowerCase();
  
  // Map common patterns to better action statements
  const verbPatterns: Array<{ pattern: RegExp; template: (match: RegExpMatchArray) => string }> = [
    { pattern: /ingest.*from\s+(.+)/i, template: (m) => `Connect to ${m[1]} and configure data ingestion parameters` },
    { pattern: /trigger.*calculation/i, template: () => `Select calculation period and trigger calculation job` },
    { pattern: /trigger.*report/i, template: () => `Select report type and date range, then trigger report generation` },
    { pattern: /trigger.*delivery/i, template: () => `Select recipients and delivery method, then initiate delivery` },
    { pattern: /process.*data/i, template: () => `Execute data processing and transformation pipeline` },
    { pattern: /store.*data/i, template: () => `Persist processed data to designated storage` },
    { pattern: /validate.*data/i, template: () => `Review data quality metrics and validate input data` },
    { pattern: /review.*result/i, template: () => `Examine results and flag any discrepancies` },
    { pattern: /approve/i, template: () => `Review and approve for next stage` },
    { pattern: /send|deliver/i, template: () => `Confirm delivery settings and send to recipients` },
  ];
  
  for (const { pattern, template } of verbPatterns) {
    const match = actionLower.match(pattern);
    if (match) {
      return template(match);
    }
  }
  
  // If no pattern matched, try to improve the action with a strong verb
  if (!/^(select|click|navigate|enter|configure|review|submit|trigger|approve|validate|process|store)/i.test(rawAction)) {
    // Add appropriate verb based on step type
    if (stepType === 'input') return `Configure ${rawAction}`;
    if (stepType === 'process') return `Execute ${rawAction}`;
    if (stepType === 'output') return `Generate ${rawAction}`;
    if (stepType === 'deliver') return `Deliver ${rawAction}`;
  }
  
  return rawAction;
}

/**
 * Creates a meaningful result statement
 */
function createResultStatement(action: string, rawResult: string, isLastStep: boolean): string {
  const actionLower = action.toLowerCase();
  
  // Generate result based on action type
  if (/ingest|import|connect|fetch/i.test(actionLower)) {
    return 'Data validated and staged for processing';
  }
  if (/calculate|process|transform/i.test(actionLower)) {
    return 'Processing complete, results ready for review';
  }
  if (/validate|review/i.test(actionLower)) {
    return 'Validation passed, ready to proceed';
  }
  if (/approve/i.test(actionLower)) {
    return 'Approved and ready for next stage';
  }
  if (/store|save|persist/i.test(actionLower)) {
    return 'Data persisted and available for consumption';
  }
  if (/report|generate/i.test(actionLower)) {
    return 'Report generated and ready for delivery';
  }
  if (/send|deliver/i.test(actionLower)) {
    return 'Successfully delivered to recipients';
  }
  if (/trigger|initiate|start/i.test(actionLower)) {
    return 'Job submitted and processing started';
  }
  
  // Use raw result if meaningful
  if (rawResult && rawResult.length > 10 && !/step|done|complete/i.test(rawResult)) {
    return rawResult;
  }
  
  return isLastStep ? 'Process completed successfully' : 'Ready for next step';
}

/**
 * Generates smart flows for data/calculation initiatives
 */
function generateDataProcessingFlows(
  _sectionMap: SectionMap,
  problemText: string,
  summaryText: string,
  jobs: Array<{ job_id: string; description: string }>
): Array<{
  flow_id: string;
  name: string;
  type: string;
  actors: string[];
  steps: Array<{ step_id: string; actor_id: string; action: string; result: string }>;
  linked_jobs: string[];
}> {
  const flows: Array<{
    flow_id: string;
    name: string;
    type: string;
    actors: string[];
    steps: Array<{ step_id: string; actor_id: string; action: string; result: string }>;
    linked_jobs: string[];
  }> = [];
  
  const allText = (problemText + ' ' + summaryText).toLowerCase();
  
  // Detect external systems mentioned
  const externalSystems: string[] = [];
  const systemPatterns = [
    { pattern: /iron\s*throne/i, name: 'Iron Throne' },
    { pattern: /pocket\s*calculator/i, name: 'Pocket Calculator' },
    { pattern: /netsuite/i, name: 'NetSuite' },
    { pattern: /settlement/i, name: 'Settlement System' },
    { pattern: /cuttlefish/i, name: 'Cuttlefish' },
  ];
  
  for (const { pattern, name } of systemPatterns) {
    if (pattern.test(allText)) {
      externalSystems.push(name);
    }
  }
  
  // Detect if this is a calculation/reporting workflow
  const isCalculation = /mlc|calculation|royalty|revenue|payment/i.test(allText);
  const hasReporting = /report|reporting|delivery|send/i.test(allText);
  
  if (isCalculation) {
    // Flow 1: Data Ingestion
    const ingestionSteps: Array<{ step_id: string; actor_id: string; action: string; result: string }> = [];
    
    if (externalSystems.length > 0) {
      externalSystems.slice(0, 3).forEach((system, idx) => {
        ingestionSteps.push({
          step_id: `step_${String(idx + 1).padStart(2, '0')}`,
          actor_id: 'System Admin',
          action: `Connect to ${system} data source and configure ingestion parameters`,
          result: `${system} data validated and ready`,
        });
      });
    } else {
      ingestionSteps.push(
        { step_id: 'step_01', actor_id: 'System Admin', action: 'Configure primary data source connection', result: 'Connection established' },
        { step_id: 'step_02', actor_id: 'System Admin', action: 'Configure secondary data source connection', result: 'Connection established' },
      );
    }
    
    ingestionSteps.push({
      step_id: `step_${String(ingestionSteps.length + 1).padStart(2, '0')}`,
      actor_id: 'System Admin',
      action: 'Review combined data inputs and confirm data quality',
      result: 'All input data staged for calculation',
    });
    
    flows.push({
      flow_id: 'flow_data_ingestion',
      name: 'Data Ingestion',
      type: 'system_process',
      actors: ['System Admin', 'System'],
      steps: ingestionSteps,
      linked_jobs: jobs.slice(0, 1).map(j => j.job_id),
    });
    
    // Flow 2: Calculation
    const calcSteps: Array<{ step_id: string; actor_id: string; action: string; result: string }> = [
      {
        step_id: 'step_01',
        actor_id: 'Finance User',
        action: 'Select calculation period and trigger calculation job',
        result: 'Calculation job submitted',
      },
      {
        step_id: 'step_02',
        actor_id: 'System',
        action: 'Process and transform ingested data through calculation engine',
        result: 'Calculations complete',
      },
      {
        step_id: 'step_03',
        actor_id: 'Finance User',
        action: 'Review calculation results and approve or flag discrepancies',
        result: 'Calculation results stored and available',
      },
    ];
    
    flows.push({
      flow_id: 'flow_calculation',
      name: 'Calculation Processing',
      type: 'user_journey',
      actors: ['Finance User', 'System'],
      steps: calcSteps,
      linked_jobs: jobs.slice(0, 2).map(j => j.job_id),
    });
    
    // Flow 3: Reporting (if detected)
    if (hasReporting) {
      const reportSteps: Array<{ step_id: string; actor_id: string; action: string; result: string }> = [
        {
          step_id: 'step_01',
          actor_id: 'Finance User',
          action: 'Select report type, date range, and trigger report generation',
          result: 'Report generated and ready for review',
        },
        {
          step_id: 'step_02',
          actor_id: 'Finance User',
          action: 'Preview report, make adjustments, and approve for delivery',
          result: 'Report approved for delivery',
        },
        {
          step_id: 'step_03',
          actor_id: 'Finance User',
          action: 'Select recipients and delivery method, then trigger delivery',
          result: 'Reports delivered to stakeholders',
        },
      ];
      
      flows.push({
        flow_id: 'flow_reporting',
        name: 'Report Generation & Delivery',
        type: 'user_journey',
        actors: ['Finance User'],
        steps: reportSteps,
        linked_jobs: jobs.slice(0, 2).map(j => j.job_id),
      });
    }
  }
  
  return flows;
}

/**
 * Extracts flows from "Proposed Solution" / "We will" sections with numbered items
 */
function extractFlowsFromProposedSolution(
  sectionMap: SectionMap,
  jobs: Array<{ job_id: string; description: string }>
): Array<{
  flow_id: string;
  name: string;
  type: string;
  actors: string[];
  steps: Array<{ step_id: string; actor_id: string; action: string; result: string }>;
  linked_jobs: string[];
}> {
  const flows: Array<{
    flow_id: string;
    name: string;
    type: string;
    actors: string[];
    steps: Array<{ step_id: string; actor_id: string; action: string; result: string }>;
    linked_jobs: string[];
  }> = [];

  // Find "We will", "Proposed Solution", or "Phases" sections
  // Note: Use find with raw_text check to skip empty sections
  const solutionSection = sectionMap.sections.find(s => 
    s.raw_text && s.raw_text.length > 50 && (
      /^we\s*will$/i.test(s.section_title) ||
      /proposed\s*solution/i.test(s.section_title) ||
      /phases/i.test(s.section_title)
    )
  );

  if (!solutionSection || !solutionSection.raw_text) return flows;

  const rawText = solutionSection.raw_text;
  
  // Parse numbered items: "1. Item title" or "1) Item title"
  // Match top-level numbered items (single digit followed by period/paren)
  // Note: In some PRDs, items 2, 3, 4, 5 may have leading whitespace due to copy-paste from docs
  const topLevelItems: Array<{ number: number; title: string; content: string }> = [];
  
  // Use line-by-line parsing (more compatible than multiline regex)
  {
    const lines = rawText.split('\n');
    let currentItem: { number: number; title: string; content: string[]; indentLevel: number } | null = null;
    let lastPhaseNumber = 0; // Track sequential phase numbers
    
    for (const line of lines) {
      // Match numbered items with optional leading whitespace
      const lineMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
      if (lineMatch && lineMatch[2] && lineMatch[3]) {
        const indent = lineMatch[1]?.length ?? 0;
        const num = parseInt(lineMatch[2], 10);
        const text = lineMatch[3].trim();
        
        // Consider it a top-level phase if:
        // 1. Number is 1-9 (single digit)
        // 2. Text starts with capital letter and looks like a verb phrase (action)
        // 3. Number is greater than the last phase number (ensures sequential order)
        const looksLikePhase = /^[A-Z][a-z]+\s/.test(text) && 
          /^(Onboard|Change|Run|Scale|Migrate|Build|Create|Design|Implement|Deploy|Launch|Decommission|Remove|Update|Enable|Configure|Integrate|Test|Validate)/i.test(text);
        
        const isTopLevel = num > 0 && num <= 9 && looksLikePhase && num > lastPhaseNumber;
        
        if (isTopLevel) {
          if (currentItem) {
            topLevelItems.push({
              number: currentItem.number,
              title: currentItem.title,
              content: currentItem.content.join('\n')
            });
          }
          lastPhaseNumber = num;
          currentItem = { number: num, title: text, content: [], indentLevel: indent };
        } else if (currentItem) {
          currentItem.content.push(line);
        }
      } else if (currentItem) {
        currentItem.content.push(line);
      }
    }
    
    // Don't forget the last item
    if (currentItem) {
      topLevelItems.push({
        number: currentItem.number,
        title: currentItem.title,
        content: currentItem.content.join('\n')
      });
    }
  }

  // Convert items to flows
  for (const item of topLevelItems) {
    // Skip items that are too short or look like noise
    if (item.title.length < 10) continue;
    
    // Determine actor based on content
    const allContent = item.title + ' ' + item.content;
    const actor = determineActor(allContent, item.title);
    
    // Parse sub-items as steps
    const steps: Array<{ step_id: string; actor_id: string; action: string; result: string }> = [];
    
    // Look for sub-numbered items in content (1. 2. 3. or a. b. c. or bullets)
    const subItems = item.content.match(/(?:^\s*(?:\d+|[a-z])\.\s+.+$)|(?:^\s*[*\-•]\s+.+$)/gm) ?? [];
    
    if (subItems.length > 0) {
      subItems.slice(0, 5).forEach((subItem, idx) => {
        const cleanSubItem = subItem.replace(/^\s*(?:\d+|[a-z])\.\s+/, '').replace(/^\s*[*\-•]\s+/, '').trim();
        if (cleanSubItem.length > 10) {
          const stepActor = determineActor(cleanSubItem, item.title);
          steps.push({
            step_id: `step_${String(idx + 1).padStart(2, '0')}`,
            actor_id: stepActor,
            action: cleanSubItem.slice(0, 120),
            result: idx === subItems.length - 1 ? `${item.title} completed` : 'Step completed successfully'
          });
        }
      });
    }
    
    // If no sub-items found, create a single step from the title
    if (steps.length === 0) {
      steps.push({
        step_id: 'step_01',
        actor_id: actor,
        action: item.title.slice(0, 120),
        result: `${item.title.split(/[/\-–]/)[0]?.trim() ?? item.title} completed`
      });
    }

    const flowId = `flow_phase_${item.number}`;
    const flowName = item.title.slice(0, 80);

    flows.push({
      flow_id: flowId,
      name: flowName,
      type: 'implementation_phase',
      actors: [...new Set(steps.map(s => s.actor_id))],
      steps,
      linked_jobs: jobs.slice(0, 2).map(j => j.job_id),
    });
  }

  return flows;
}

function extractFlowsFromSections(
  sectionMap: SectionMap,
  jobs: Array<{ job_id: string; description: string }>,
  summaryText: string,
  initiativeType: 'ui' | 'data' | 'backend' | 'hybrid'
): Array<{
  flow_id: string;
  name: string;
  type: string;
  actors: string[];
  steps: Array<{ step_id: string; actor_id: string; action: string; result: string }>;
  linked_jobs: string[];
}> {
  const flows: Array<{
    flow_id: string;
    name: string;
    type: string;
    actors: string[];
    steps: Array<{ step_id: string; actor_id: string; action: string; result: string }>;
    linked_jobs: string[];
  }> = [];

  const journeyPatterns = [/^\d+\.\d+\s+/, /user.*journey/i, /user.*segment/i, /workflow/i, /process/i];

  // Extract problem text for context
  const problemSection = sectionMap.sections.find(s => /problem|opportunity/i.test(s.section_title));
  const problemText = problemSection?.raw_text ?? summaryText;
  
  // First, try to extract flows from "Proposed Solution" / "We will" sections
  const proposedSolutionFlows = extractFlowsFromProposedSolution(sectionMap, jobs);
  if (proposedSolutionFlows.length > 0) {
    return proposedSolutionFlows;
  }

  for (const section of sectionMap.sections) {
    const isJourneySection = journeyPatterns.some(p => p.test(section.section_title));
    const hasUserGoal = /user\s*goal/i.test(section.raw_text);

    if (isJourneySection || hasUserGoal) {
      const rawText = section.raw_text;

      const cleanTitle = section.section_title
        .replace(/^\d+\.\d+\s*/, '')
        .replace(/[*_#]/g, '')
        .trim();

      const lines = rawText.split('\n');
      const steps: Array<{ step_id: string; actor_id: string; action: string; result: string }> = [];

      let stepIdx = 0;
      for (const line of lines) {
        const bulletMatch = line.match(/^[*\-•]\s*(.+?):\s*(.+)$/);
        if (bulletMatch && bulletMatch[1] && bulletMatch[2]) {
          const label = bulletMatch[1].trim().toLowerCase();
          const content = bulletMatch[2].trim();

          if (label === 'user goal' || label === 'current state') continue;

          stepIdx++;
          const rawAction = `${bulletMatch[1]}: ${content}`;
          const actor = determineActor(rawAction, cleanTitle);
          const action = createActionStatement(rawAction, stepIdx === 1 ? 'input' : 'process');
          
          steps.push({
            step_id: `step_${String(stepIdx).padStart(2, '0')}`,
            actor_id: actor,
            action: action.slice(0, 120),
            result: createResultStatement(action, content, false),
          });
        }
      }

      if (steps.length === 0) {
        const actor = determineActor(cleanTitle, problemText);
        steps.push({
          step_id: 'step_01',
          actor_id: actor,
          action: `Navigate to ${cleanTitle} and review current status`,
          result: `${cleanTitle} interface displayed with current data`,
        });
        steps.push({
          step_id: 'step_02',
          actor_id: actor,
          action: `Configure options and execute ${cleanTitle.toLowerCase()} operation`,
          result: 'Operation completed successfully',
        });
      }

      // Update last step result
      const lastStep = steps[steps.length - 1];
      if (lastStep) {
        lastStep.result = createResultStatement(
          lastStep.action,
          lastStep.result,
          true
        );
      }

      const linkedJob = jobs.find(j => j.job_id.includes(section.section_id));

      flows.push({
        flow_id: `flow_${section.section_id}`,
        name: cleanTitle,
        type: 'user_journey',
        actors: [...new Set(steps.map(s => s.actor_id))],
        steps,
        linked_jobs: linkedJob ? [linkedJob.job_id] : [],
      });
    }
  }

  // If no explicit journey sections found, derive flows based on initiative type
  if (flows.length === 0) {
    const isDataOrBackend = initiativeType === 'data' || initiativeType === 'backend' || initiativeType === 'hybrid';
    
    if (isDataOrBackend) {
      // Use smart data processing flow generator
      const dataFlows = generateDataProcessingFlows(sectionMap, problemText, summaryText, jobs);
      
      if (dataFlows.length > 0) {
        flows.push(...dataFlows);
      } else {
        // Fallback to generic data flow
        const flowName = summaryText.split(/[.!?]/)[0]?.trim().slice(0, 60) || 'Data Processing Flow';
        
        flows.push({
          flow_id: 'flow_data_process',
          name: flowName,
          type: 'system_process',
          actors: ['System Admin', 'System'],
          steps: [
            { step_id: 'step_01', actor_id: 'System Admin', action: 'Configure data source connections and ingestion parameters', result: 'Data sources connected and validated' },
            { step_id: 'step_02', actor_id: 'System', action: 'Execute data ingestion and transformation pipeline', result: 'Data processed and transformed' },
            { step_id: 'step_03', actor_id: 'System', action: 'Store processed data to destination', result: 'Data available for consumption' },
          ],
          linked_jobs: jobs.map(j => j.job_id),
        });
      }
    } else {
      // Default UI flow with better structure
      const primaryJob = jobs[0]?.description ?? 'complete the primary task';
      const actor = determineActor(primaryJob, summaryText);
      
      flows.push({
        flow_id: 'flow_primary',
        name: 'Primary User Flow',
        type: 'user_journey',
        actors: [actor],
        steps: [
          { step_id: 'step_01', actor_id: actor, action: 'Access the system and navigate to main dashboard', result: 'Dashboard displayed with current status' },
          { step_id: 'step_02', actor_id: actor, action: `Configure options and initiate ${primaryJob.slice(0, 50)}`, result: 'Operation initiated successfully' },
          { step_id: 'step_03', actor_id: actor, action: 'Review results and confirm completion', result: 'Task completed successfully' },
        ],
        linked_jobs: jobs.map(j => j.job_id),
      });
    }
  }

  return flows;
}

function subsectionOrSectionText(args: {
  section: SectionMap['sections'][number] | undefined;
  subsectionTitles: string[];
}): string {
  const sub = pickSubsectionAny(args.section, args.subsectionTitles);
  const subText = (sub?.text ?? '').trim();
  if (subText.length > 0) return subText;
  return sectionRawText(args.section);
}

function bulletLines(text: string): string[] {
  const raw = (text ?? '').replace(/\r\n/g, '\n');
  const lines = raw
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  const bullet = lines.filter(l => /^[•*-]\s+/.test(l)).map(l => l.replace(/^[•*-]\s+/, '').trim());

  if (bullet.length > 0) return bullet;

  const numbered = lines.filter(l => /^\d+[\.\)]\s+/.test(l)).map(l => l.replace(/^\d+[\.\)]\s+/, '').trim());

  if (numbered.length > 0) return numbered;

  return lines;
}

function extractUrls(text: string): string[] {
  const raw = text ?? '';
  const matches = raw.match(/https?:\/\/[^\s)]+/g) ?? [];
  return Array.from(new Set(matches));
}

function firstNonEmpty(text: string): string {
  const lines = (text ?? '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  return lines[0] ?? '';
}

function guessInitiativeType(map: SectionMap): { type: 'ui' | 'data' | 'backend' | 'hybrid'; signals: any[] } {
  const all = map.sections.map(s => s.raw_text ?? '').join('\n');
  const t = norm(all);

  const signals: any[] = [];

  const hasUi = t.includes('figma') || t.includes('screen') || t.includes('ui') || t.includes('prototype') || t.includes('clickable');

  const hasData = t.includes('dataset') || t.includes('pipeline') || t.includes('schema') || t.includes('etl') || t.includes('data flow');

  const hasBackend = t.includes('api') || t.includes('service') || t.includes('endpoint') || t.includes('architecture') || t.includes('backend');

  if (hasUi) signals.push({ signal: 'screens', evidence: 'PRD mentions UI or prototypes' });
  if (hasData) signals.push({ signal: 'pipeline', evidence: 'PRD mentions data pipelines or schemas' });
  if (hasBackend) signals.push({ signal: 'api_service', evidence: 'PRD mentions services or APIs' });

  const count = Number(hasUi) + Number(hasData) + Number(hasBackend);
  if (count >= 2) return { type: 'hybrid', signals };
  if (hasData) return { type: 'data', signals };
  if (hasBackend) return { type: 'backend', signals };
  return { type: 'ui', signals };
}

export function extractCpm(args: { sectionMap: SectionMap; runId: string; schemaVersion?: string }): Cpm {
  const { sectionMap, runId } = args;
  const schemaVersion = args.schemaVersion ?? '1.0.0';

  const summary = pickSection(sectionMap, 'summary');
  const keyOutcomes = pickSection(sectionMap, 'key outcomes');
  const understand = pickSection(sectionMap, 'understand it');
  const think = pickSection(sectionMap, 'think it');
  const overview = pickSection(sectionMap, 'overview');

  const understandRaw = sectionRawText(understand);
  const overviewRaw = sectionRawText(overview);
  const currentState = pickSection(sectionMap, 'current state');
  const currentStateRaw = sectionRawText(currentState);

  // Extract problem statement - prioritize explicit problem sections
  // Step 1: Try to extract from explicit problem sections (Problem, Why now, Current state, etc.)
  const explicitProblemContent = extractExplicitProblemContent(sectionMap);
  
  // Step 2: Extract from various heading patterns
  const problemFromHeading = extractContentAfterHeading(understandRaw, ['problem/opportunity', 'problem opportunity', 'problem']);
  const problemFromOverview = extractContentAfterHeading(overviewRaw, ['problem']);
  const whyNowSection = pickSection(sectionMap, 'why now');
  const whyNowContent = sectionRawText(whyNowSection);

  // Look for problem sections as TOP-LEVEL sections (common in PRD format)
  const problemOpportunitySection = pickSection(sectionMap, 'problem/opportunity') || pickSection(sectionMap, 'problem opportunity');
  const problemSection = pickSection(sectionMap, 'problem');
  const challengeSection = pickSection(sectionMap, 'challenge');
  const backgroundSection = pickSection(sectionMap, 'background');
  const userProblem = pickSection(sectionMap, 'user problem');
  const businessProblem = pickSection(sectionMap, 'business compliance problem') || pickSection(sectionMap, 'business problem');
  const financialImpact = pickSection(sectionMap, 'financial impact');
  
  // Product brief format: "Creators:" and "Business:" as TOP-LEVEL sections
  const creatorsSection = pickSection(sectionMap, 'creators');
  const businessSection = pickSection(sectionMap, 'business');
  
  // Also look for Problem as subsection under Overview
  const problemSubsection = pickSubsection(overview, 'problem');
  
  // Combine multiple problem sections if they exist
  const combinedProblemParts: string[] = [];
  
  // Priority 1: Use explicit problem content from known sections
  if (explicitProblemContent.length > 30) {
    combinedProblemParts.push(explicitProblemContent);
  }
  
  // Priority 2: Check if Creators/Business are top-level sections (product brief format)
  if (combinedProblemParts.length === 0) {
    if (creatorsSection?.raw_text && creatorsSection.raw_text.trim().length > 20) {
      combinedProblemParts.push(`Creators: ${creatorsSection.raw_text.trim()}`);
    }
    if (businessSection?.raw_text && businessSection.raw_text.trim().length > 20) {
      combinedProblemParts.push(`Business: ${businessSection.raw_text.trim()}`);
    }
  }
  
  // Priority 3: Try to extract from product brief format within other sections
  if (combinedProblemParts.length === 0) {
    const overviewOrProblemText = (overview?.raw_text ?? '') + '\n' + (problemSection?.raw_text ?? '');
    const productBriefProblem = extractProblemFromProductBrief(overviewOrProblemText);
    
    if (productBriefProblem.length > 50) {
      combinedProblemParts.push(productBriefProblem);
    }
  }
  
  // Priority 4: Try other problem section formats
  if (combinedProblemParts.length === 0) {
    // Check for Problem subsection under Overview
    if (problemSubsection?.text && problemSubsection.text.trim().length > 20) {
      combinedProblemParts.push(problemSubsection.text.trim());
    }
    
    // Check for standalone Problem section
    if (combinedProblemParts.length === 0 && problemSection?.raw_text && problemSection.raw_text.trim().length > 20) {
      combinedProblemParts.push(problemSection.raw_text.trim());
    }
    
    // Check for Challenge section (common in strategy/scope docs)
    if (combinedProblemParts.length === 0 && challengeSection?.raw_text && challengeSection.raw_text.trim().length > 20) {
      combinedProblemParts.push(challengeSection.raw_text.trim());
    }
    
    // Check for Background section (strategy/scope docs)
    if (combinedProblemParts.length === 0 && backgroundSection?.raw_text && backgroundSection.raw_text.trim().length > 20) {
      combinedProblemParts.push(backgroundSection.raw_text.trim());
    }
    
    // Check for the main Problem/Opportunity section
    if (combinedProblemParts.length === 0 && problemOpportunitySection?.raw_text && problemOpportunitySection.raw_text.trim().length > 20) {
      combinedProblemParts.push(problemOpportunitySection.raw_text.trim());
    }
    
    // Check for problem extracted from Overview heading
    if (combinedProblemParts.length === 0 && problemFromOverview.length > 20) {
      combinedProblemParts.push(problemFromOverview);
    }
    
    // Check for Why Now section (often contains problem context)
    if (combinedProblemParts.length === 0 && whyNowContent.length > 30) {
      combinedProblemParts.push(whyNowContent);
    }
  }
  
  // Priority 5: Check for specific sub-problem sections
  if (combinedProblemParts.length === 0) {
    if (userProblem?.raw_text) {
      combinedProblemParts.push(`User Problem: ${userProblem.raw_text.trim()}`);
    }
    if (businessProblem?.raw_text) {
      combinedProblemParts.push(`Business Problem: ${businessProblem.raw_text.trim()}`);
    }
    if (financialImpact?.raw_text) {
      combinedProblemParts.push(`Financial Impact: ${financialImpact.raw_text.trim()}`);
    }
  }
  
  // Priority 6: Fallback to extracting from Understand It section using heuristics
  let rawProblemText = combinedProblemParts.length > 0 
    ? combinedProblemParts.join('\n\n')
    : firstText(
        { text: problemFromHeading },
        { text: problemFromOverview },
        { text: pickSubsectionAny(understand, ['problem opportunity', 'problem and opportunity', 'problem', 'opportunity'])?.text ?? '' },
        { text: pickSubsectionAny(summary, ['problem opportunity', 'problem', 'opportunity'])?.text ?? '' }
      );
  
  // Priority 7: Ultimate fallback - use first paragraph of Understand It
  if (!rawProblemText.trim() && understandRaw.length > 30) {
    const firstParagraph = understandRaw.split(/\n\n/)[0] ?? understandRaw;
    rawProblemText = firstParagraph.replace(/\n/g, ' ').trim();
  }

  // Synthesize and clean the problem statement
  const problemText = synthesizeProblemStatement(rawProblemText);

  // Extract outcome/goals - prioritize outcome-focused sections over requirements
  const goalsFromCurrentState = extractContentAfterHeading(currentStateRaw, ['primary goals', 'goals/benefits', 'goals']);
  const goalsFromUnderstand = extractContentAfterHeading(understandRaw, ['primary goals', 'goals/benefits', 'goals', 'key outcomes', 'objective']);

  // Look for outcome-focused sections (prioritize these for primary_outcome)
  const outcomeSection = pickSection(sectionMap, 'outcome') || pickSection(sectionMap, 'outcomes');
  const opportunitySection = pickSection(sectionMap, 'opportunity');
  const whyThisMattersSection = pickSection(sectionMap, 'why this matters') || pickSection(sectionMap, 'why it matters');
  const impactSection = pickSection(sectionMap, 'impact');
  const valueSection = pickSection(sectionMap, 'value proposition') || pickSection(sectionMap, 'value');
  
  // Look for Goals/Benefits section as TOP-LEVEL section (common in PRD format)
  const goalsBenefitsSection = pickSection(sectionMap, 'goals/benefits') || pickSection(sectionMap, 'goals benefits') || pickSection(sectionMap, 'goals_benefits');
  const goalsSection = pickSection(sectionMap, 'goals');
  const benefitsSection = pickSection(sectionMap, 'benefits');
  const objectiveSection = pickSection(sectionMap, 'objective');
  
  // Look for Proposed Solution section (common in product briefs)
  const proposedSolutionSection = pickSection(sectionMap, 'proposed solution') || pickSection(sectionMap, 'solution');
  
  // Look for TL;DR or Summary section (often contains primary outcome)
  const tldrSection = pickSection(sectionMap, 'tl;dr') || pickSection(sectionMap, 'tldr');
  const tldrText = sectionRawText(tldrSection);
  
  // Look for Success Metrics section (common in product briefs)
  const successMetricsSection = pickSection(sectionMap, 'success metrics');
  
  // Extract "North Star" or primary metric from Success Metrics
  const successMetricsRaw = sectionRawText(successMetricsSection);
  const northStarMatch = successMetricsRaw.match(/North Star[:\s]*([^\n]+(?:\n(?![A-Z][a-z]+:)[^\n]+)*)/i);
  const northStarText = northStarMatch?.[1]?.trim() ?? '';
  
  // Also extract from Preamble (document intro often has TL;DR)
  const preambleSection = pickSection(sectionMap, 'preamble');
  const preambleRaw = sectionRawText(preambleSection);
  // Extract TL;DR from preamble (handle multiline by splitting)
  const tldrMatch = preambleRaw.match(/tl[;:]?\s*dr[;:]?\s*([^\n]+)/i);
  const tldrFromPreamble = tldrMatch?.[1]?.trim() ?? '';
  
  // Extract Key Results from the full text (for legacy compatibility)
  const allUnderstandText = sectionMap.sections
    .filter(s => s.section_id.includes('understand') || s.section_title.toLowerCase().includes('goal') || s.section_title.toLowerCase().includes('benefit') || s.section_title.toLowerCase().includes('objective'))
    .map(s => s.raw_text)
    .join('\n');
  
  const keyResultsMatch = allUnderstandText.match(/Key Result \d+[:\s]*([\s\S]*?)(?=Key Result \d+|$)/gi);
  const keyResultsText = keyResultsMatch ? keyResultsMatch.map(kr => kr.trim()).join('\n') : '';
  
  // Extract the first numbered item from Proposed Solution as the primary goal (legacy)
  const proposedSolutionRaw = sectionRawText(proposedSolutionSection);
  const solutionFirstItem = proposedSolutionRaw.match(/^\s*1\.\s*(.+?)(?=\n\s*(?:\d+\.|[a-z]\.)|\n\n|$)/im)?.[1]?.trim() ?? '';

  // Build outcome content prioritizing organizational outcome sections
  const rawOutcomeText = firstText(
    // Priority 1: Explicit outcome/opportunity/impact sections (organizational level)
    { text: sectionRawText(outcomeSection) },
    { text: sectionRawText(opportunitySection) },
    { text: sectionRawText(whyThisMattersSection) },
    { text: sectionRawText(impactSection) },
    { text: sectionRawText(valueSection) },
    // Priority 2: Benefits section (often contains outcome-level content)
    { text: benefitsSection?.raw_text ?? '' },
    // Priority 3: Goals/Benefits combined section
    { text: goalsBenefitsSection?.raw_text ?? '' },
    // Priority 4: TL;DR (often contains primary outcome)
    { text: tldrText },
    { text: tldrFromPreamble },
    // Priority 5: North Star metric (organizational level)
    { text: northStarText },
    // Priority 6: Goals section
    { text: goalsSection?.raw_text ?? '' },
    { text: objectiveSection?.raw_text ?? '' },
    // Priority 7: Subsections
    { text: pickSubsectionAny(understand, ['outcome', 'outcomes', 'benefits', 'value', 'impact', 'opportunity'])?.text ?? '' },
    { text: pickSubsectionAny(understand, ['goals', 'goals/benefits', 'key outcomes', 'primary goals', 'objective'])?.text ?? '' },
    { text: pickSubsectionAny(keyOutcomes, ['key outcomes', 'outcomes', 'goals'])?.text ?? '' },
    { text: pickSubsectionAny(summary, ['goals', 'key outcomes', 'outcomes', 'benefits'])?.text ?? '' },
    // Priority 8: Extracted from headings
    { text: goalsFromCurrentState },
    { text: goalsFromUnderstand },
    // Priority 9: Fallback to key results and solution items (less preferred)
    { text: keyResultsText },
    { text: solutionFirstItem },
    { text: proposedSolutionRaw.slice(0, 500) }
  );

  // Extract benefits text for fallback synthesis
  const benefitsTextForOutcome = firstText(
    { text: benefitsSection?.raw_text ?? '' },
    pickSubsectionAny(understand, ['benefits', 'value', 'impact']),
    pickSubsectionAny(keyOutcomes, ['benefits', 'value', 'impact'])
  );

  // Use new synthesizeOutcome function for primary_outcome
  const outcomeText = synthesizeOutcome(rawOutcomeText, problemText, benefitsTextForOutcome);
  
  // Keep legacy goalsText for other uses (e.g., jobs extraction)
  const rawGoalsText = rawOutcomeText;
  const goalsText = synthesizeGoals(rawGoalsText);

  const requirementsText = firstText({ text: subsectionOrSectionText({ section: think, subsectionTitles: ['requirements'] }) }, { text: subsectionOrSectionText({ section: summary, subsectionTitles: ['requirements'] }) });

  const workflowText = firstText({ text: subsectionOrSectionText({ section: think, subsectionTitles: ['workflow', 'workflows'] }) }, { text: subsectionOrSectionText({ section: summary, subsectionTitles: ['workflow', 'workflows'] }) });

  const benefitsText = firstText(pickSubsectionAny(understand, ['benefits', 'value', 'impact']), pickSubsectionAny(keyOutcomes, ['benefits', 'value', 'impact']));

  const metricsText = firstText(
    pickSubsectionAny(understand, ['metrics evaluation', 'metrics', 'success metrics', 'evaluation']),
    pickSubsectionAny(keyOutcomes, ['metrics', 'success metrics']),
    pickSubsectionAny(summary, ['metrics', 'success metrics'])
  );

  const risksText = firstText(pickSubsectionAny(understand, ['key risks', 'risks']), pickSubsectionAny(summary, ['risks']));

  // Look for effort estimates in multiple places including tables
  const effortSection = pickSection(sectionMap, 'effort estimate');
  const effortText = firstText(
    { text: effortSection?.raw_text ?? '' },
    pickSubsectionAny(understand, ['effort estimates', 'effort estimate', 'effort']),
    pickSubsectionAny(think, ['effort estimates', 'effort estimate', 'effort']),
    pickSubsectionAny(summary, ['effort', 'estimates'])
  );

  // Extract actual open questions from PRD text
  const extractedOpenQuestions: string[] = [];
  
  // Look for "Open questions" sections throughout the PRD
  const allText = sectionMap.sections.map(s => s.raw_text ?? '').join('\n');
  
  // Pattern to find questions in table format (common in PRDs)
  // Look for lines that contain "?" or start with common question patterns
  const openQuestionsSection = pickSection(sectionMap, 'open questions');
  const openQuestionsThink = pickSubsectionAny(think, ['open questions']);
  const openQuestionsUnderstand = pickSubsectionAny(understand, ['open questions']);
  
  const openQuestionsText = [
    openQuestionsSection?.raw_text ?? '',
    openQuestionsThink?.text ?? '',
    openQuestionsUnderstand?.text ?? '',
  ].join('\n');
  
  // Extract questions from the open questions sections
  if (openQuestionsText.trim()) {
    const lines = openQuestionsText.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip header rows, empty lines, and column separators
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('|---') || trimmed === '|') continue;
      // Look for question-like content (contains "?" or starts with question words)
      if (trimmed.includes('?') || /^(should|how|what|when|where|why|is|are|will|can|do|does|for\s)/i.test(trimmed)) {
        // Clean up table formatting
        let question = trimmed
          .replace(/^\|?\s*\d*\s*\|?\s*/, '') // Remove leading table cells with numbers
          .replace(/\|\s*$/, '') // Remove trailing pipes
          .replace(/^\|/, '') // Remove leading pipe
          .replace(/\s*\|\s*/g, ' - ') // Replace middle pipes with dashes
          .trim();
        
        // Only add if it looks like a real question (not just metadata)
        if (question.length > 10 && !question.toLowerCase().startsWith('answer') && !question.toLowerCase().startsWith('owner') && !question.toLowerCase().startsWith('poc') && !question.toLowerCase().startsWith('eta')) {
          extractedOpenQuestions.push(question);
        }
      }
    }
  }
  
  // Also search for questions marked with specific patterns in the full text
  const questionPatterns = [
    /(?:^|\n)\s*(?:\d+\.?\s*)?(?:For\s+\w+:?\s*)?([^.!?\n]*\?)/gim,
  ];
  for (const pattern of questionPatterns) {
    const matches = allText.matchAll(pattern);
    for (const match of matches) {
      const question = match[1]?.trim();
      if (question && question.length > 15 && question.length < 300) {
        // Avoid duplicates
        if (!extractedOpenQuestions.some(q => q.toLowerCase().includes(question.toLowerCase().slice(0, 30)))) {
          extractedOpenQuestions.push(question);
        }
      }
    }
  }

  // Start with extracted questions, then add missing content warnings
  const openQuestions: string[] = [...extractedOpenQuestions];
  
  if (!firstNonEmpty(problemText)) openQuestions.push('Problem statement is missing in PRD sections we searched.');
  if (!firstNonEmpty(goalsText)) openQuestions.push('Goals or key outcomes are missing in PRD sections we searched.');
  if (!firstNonEmpty(requirementsText)) openQuestions.push('Requirements are missing in PRD sections we searched.');
  if (!firstNonEmpty(workflowText)) openQuestions.push('Workflow is missing in PRD sections we searched.');
  if (!firstNonEmpty(metricsText)) openQuestions.push('Success metrics and evaluation are missing in PRD sections we searched.');
  if (!firstNonEmpty(risksText)) openQuestions.push('Key risks are missing in PRD sections we searched.');
  if (!firstNonEmpty(effortText)) openQuestions.push('Effort estimates are missing in PRD sections we searched.');

  const urls = extractUrls(allText);
  const figmaWorkflow = urls.find(u => u.includes('figma.site') || u.includes('figma.com'));
  if (figmaWorkflow) {
    openQuestions.push(`Workflow is referenced via external link and was not extracted. Please summarize the workflow steps into the PRD text or add them under Think It. Link found: ${figmaWorkflow}`);
  }

  const initiative = guessInitiativeType(sectionMap);

  const signals = initiative.signals.map(s => ({
    ...s,
    source_section_id: understand?.section_id ?? undefined,
  }));

  // Use the new outcome-focused text for primary_outcome, with fallback to legacy goals
  const goalOutcome = firstNonEmpty(outcomeText) || firstNonEmpty(goalsText) || 'Enable early validation of solution understanding from PRDs.';
  const inScope = ['PRD ingestion', 'CPM generation', 'UI data backend and hybrid classification', 'Low to medium fidelity prototypes'];
  const outOfScope = ['Production implementation', 'High fidelity final design', 'Full automation without human review'];

  // Extract summary text for jobs/flows derivation
  const summaryText = sectionRawText(summary);
  
  // Extract jobs and flows from PRD
  // Priority 1: Try to extract from explicit "Jobs to be Done" section (verbatim)
  const jtbdResult = extractJobsFromJtbdSection(sectionMap, openQuestions);
  
  // Priority 2: Try to extract from User Stories / Use Cases sections
  const userStoriesResult = !jtbdResult.found 
    ? extractJobsFromUserStoriesSection(sectionMap, openQuestions)
    : { jobs: [], found: false };
  
  // Priority 2.5: Try to extract from "Definitions of Done" sections (strategy/scope docs)
  const strategyCtx = extractStrategyContext(sectionMap);
  const dodResult = (!jtbdResult.found && !userStoriesResult.found)
    ? extractJobsFromDoDSection(sectionMap, openQuestions, strategyCtx)
    : { jobs: [], found: false };
  
  // Priority 3: Fall back to deriving jobs from other sections
  let jobs = jtbdResult.found 
    ? jtbdResult.jobs 
    : userStoriesResult.found
      ? userStoriesResult.jobs
      : dodResult.found
        ? dodResult.jobs
        : extractJobsFromSections(sectionMap, summaryText, rawGoalsText, problemText);
  
  // FR3-style requirements (PRDs with FR3.0, FR3.1, etc.)
  // User Stories = Jobs to be Done — each User Story becomes a job with detailed step-by-step flow
  const fr3Jobs = extractJobsFromFr3StyleRequirements(sectionMap, jobs);
  if (fr3Jobs.length >= 3) {
    const nonTableJobs = jobs.filter(j => !j.job_id.startsWith('job_req_tab') && !j.job_id.startsWith('job_req_effort'));
    const nonReqAndNonGeneric = nonTableJobs.filter(
      j => !j.job_id.startsWith('job_req_') && j.job_id !== 'job_primary_goal' && j.job_id !== 'job_primary'
    );
    jobs = [...nonReqAndNonGeneric, ...fr3Jobs];
  } else if (fr3Jobs.length > 0) {
    jobs = [...jobs, ...fr3Jobs];
  }

  // Standalone User Stories (As a X, I want to Y, so that Z) — capture any not in FR3 blocks
  const standaloneUserStoryJobs = extractStandaloneUserStoriesAsJobs(sectionMap, jobs);
  if (standaloneUserStoryJobs.length > 0) {
    jobs = [...jobs, ...standaloneUserStoryJobs];
  }

  // Additionally, extract requirements and add as supplementary jobs
  const requirementsJobs = extractJobsFromRequirementsSection(sectionMap, jobs);
  if (requirementsJobs.length > 0) {
    jobs = [...jobs, ...requirementsJobs];
  }
  
  // Also extract jobs from domain-specific requirement sections (financial/ERP)
  const domainJobs = extractJobsFromDomainSections(sectionMap, jobs);
  if (domainJobs.length > 0) {
    jobs = [...jobs, ...domainJobs];
  }
  
  // Apply methodology-based extraction: scan all sections for purpose statements,
  // pain signals, and named artifacts to derive high-leverage JTBDs
  const methodologyJobs = extractJobsFromPrdMethodology(sectionMap, jobs);
  if (methodologyJobs.length >= 3) {
    // When we have 3+ purpose-derived JTBDs, they become the primary jobs.
    // Table-row items (job_req_tab, job_req_effort) are implementation tasks, not JTBDs --
    // keep only non-table jobs and add the methodology jobs.
    const nonTableJobs = jobs.filter(j => !j.job_id.startsWith('job_req_tab') && !j.job_id.startsWith('job_req_effort'));
    jobs = [...nonTableJobs, ...methodologyJobs];
  } else if (methodologyJobs.length > 0) {
    jobs = [...jobs, ...methodologyJobs];
  }
  
  // Priority 1: Try to extract from explicit "User Flows" section (verbatim)
  const userFlowsResult = extractFlowsFromUserFlowsSection(sectionMap, jobs);
  
  // Priority 2: Create flows from user story jobs
  const userStoryFlows = createFlowsFromUserStoryJobs(jobs);
  
  // Priority 2.5: Create flows from requirement jobs (when user stories don't produce flows)
  const requirementFlows = createFlowsFromRequirementsJobs(jobs);
  
  // Priority 2.75: Create flows from DoD jobs (strategy/scope docs)
  const dodFlows = createFlowsFromDoDJobs(jobs);
  
  // Priority 3: Fall back to deriving flows from other sections
  let flows = userFlowsResult.found
    ? userFlowsResult.flows
    : userStoryFlows.length > 0
      ? userStoryFlows
      : dodFlows.length > 0
        ? dodFlows
        : requirementFlows.length > 0
          ? requirementFlows
          : extractFlowsFromSections(sectionMap, jobs, summaryText, initiative.type);
  
  // If we have user story flows but also requirement flows, merge them
  if (userStoryFlows.length > 0 && requirementFlows.length > 0 && !userFlowsResult.found) {
    flows = [...userStoryFlows, ...requirementFlows];
  }
  
  // If we have DoD flows alongside other flow sources, merge them
  if (dodFlows.length > 0 && flows !== dodFlows) {
    const existingFlowIds = new Set(flows.map(f => f.flow_id));
    const newDodFlows = dodFlows.filter(f => !existingFlowIds.has(f.flow_id));
    if (newDodFlows.length > 0) {
      flows = [...flows, ...newDodFlows];
    }
  }
  
  // Enhance flows: add persistence steps where PRD implies historical reuse,
  // and normalize actors to typed format (User/System/Logic)
  flows = enhanceFlowsWithPersistence(flows, sectionMap);
  
  // Extract structured requirements and link them to flows
  const structuredRequirements = extractStructuredRequirements(sectionMap);
  if (structuredRequirements.length > 0) {
    // Link requirements to flows (adds preconditions, constraints)
    flows = linkRequirementsToFlows(flows, structuredRequirements);
    // Add validation steps for access control requirements
    flows = addValidationStepsToFlows(flows, structuredRequirements);
  }

  const cpm: Cpm = {
    meta: {
      cpm_version: schemaVersion,
      cpm_id: runId,
      created_at: new Date().toISOString(),
      source: {
        document_name: sectionMap.document_name ?? 'prd.txt',
        document_type: 'prd',
      },
      traceability: {
        section_index: sectionMap.sections.map(s => ({
          section_id: s.section_id,
          section_title: s.section_title,
        })),
      },
    },
    classification: {
      initiative_type: initiative.type,
      confidence: openQuestions.length > 0 ? 'low' : 'medium',
      signals,
    },
    intent: {
      problem: {
        statement: problemText.trim() || 'Problem statement not found in PRD text.',
      },
      goal: {
        primary_outcome: goalOutcome,
        success_metrics: bulletLines(metricsText)
          .slice(0, 6)
          .map(m => ({
            metric: m,
            direction: 'increase',
          })),
      },
      scope: {
        in_scope: inScope,
        out_of_scope: outOfScope,
        assumptions: bulletLines(benefitsText).slice(0, 6),
      },
    },
    actors: {
      primary: {
        actor_id: 'actor_product_manager',
        type: 'human',
        name: 'Product manager',
        description: 'Owns the PRD and validates shared understanding early.',
      },
      secondary: [],
    },
    // Strip hidden metadata fields from jobs before output
    jobs: jobs.map((j) => ({
      job_id: j.job_id,
      description: j.description,
      trigger: j.trigger,
      success_outcome: j.success_outcome,
      priority: j.priority,
    })),
    flows,
    requirements: structuredRequirements.length > 0 ? structuredRequirements : undefined,
    data: { entities: [] },
    systems: { in_scope: [], external: [] },
    constraints: {
      quality: { reliability: 'important' },
    },
    prototype: {
      strategy: {
        recommended_type:
          initiative.type === 'data'
            ? 'data_flow_diagram'
            : initiative.type === 'backend'
              ? 'architecture_diagram'
              : initiative.type === 'hybrid'
                ? 'hybrid_bundle'
                : 'clickable_ui',
        fidelity: 'low',
        visualize: bulletLines(requirementsText).slice(0, 8),
        avoid: openQuestions.slice(0, 8),
      },
      render_targets: [{ target_type: 'json', tool: 'local', notes: 'CPM JSON for review' }],
    },
    review: {
      review_required: true,
      review_focus: ['intent', 'jobs', 'flows', 'classification'],
      open_questions: openQuestions,
    },
  };

  return cpm;
}

