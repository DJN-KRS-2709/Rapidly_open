import { describe, it, expect } from 'vitest';

import {
  inferStepComponentType,
  extractEntitiesFromCorpus,
  stepToFigmaDescription,
  toUserFacingCopy,
} from '../prototypeInference';
import { generatePrototypeHtml } from '../prototypeHtml';

describe('toUserFacingCopy', () => {
  it('converts JTBD to user-facing copy', () => {
    const play = toUserFacingCopy('As a user I can play workout videos at my own speed');
    expect(play).toMatch(/Play.*workout.*at your own pace/i);
    expect(play).not.toMatch(/As a user|I can/);

    const track = toUserFacingCopy('As a premium user I can track my streak and stay motivated');
    expect(track).toMatch(/Track your streak/);
    expect(track).toMatch(/keep going/);
  });

  it('handles text without JTBD prefix', () => {
    expect(toUserFacingCopy('Discover fitness videos')).toBe('Discover fitness videos');
  });
});

describe('inferStepComponentType', () => {
  it('infers content_grid for discover + content type', () => {
    expect(
      inferStepComponentType(
        'As a user I can discover fitness videos',
        'organized by category'
      )
    ).toBe('content_grid');
    expect(
      inferStepComponentType('Browse playlists', 'and find new music')
    ).toBe('content_grid');
  });

  it('infers category_grid for browse/category without content type', () => {
    expect(
      inferStepComponentType('Browse by category', 'organized in sections')
    ).toBe('category_grid');
  });

  it('infers media_player for play/watch with speed', () => {
    expect(
      inferStepComponentType('Play workout videos', 'at my own speed')
    ).toBe('media_player');
    expect(
      inferStepComponentType('Watch guided sessions', 'with audio')
    ).toBe('media_player');
  });

  it('infers search for search/query steps', () => {
    expect(
      inferStepComponentType('Search for content', 'and see results')
    ).toBe('search');
  });

  it('infers access_gate for premium/subscribe steps', () => {
    expect(
      inferStepComponentType('As a free user', 'I see upgrade upsell')
    ).toBe('access_gate');
  });

  it('infers recommendations for recommend/suggest steps', () => {
    expect(
      inferStepComponentType('Get recommended workouts', 'based on history')
    ).toBe('recommendations');
  });

  it('infers progress_tracker for streak/habit/goal steps', () => {
    expect(
      inferStepComponentType('Track my streak', 'and stay motivated')
    ).toBe('progress_tracker');
  });

  it('infers approval for approve/reject steps', () => {
    expect(
      inferStepComponentType('Approve the request', 'or reject with comment')
    ).toBe('approval');
  });

  it('infers feature_card as fallback', () => {
    expect(
      inferStepComponentType('Do something generic', 'with a result')
    ).toBe('feature_card');
  });
});

describe('extractEntitiesFromCorpus', () => {
  it('extracts content items from discover/browse patterns', () => {
    const corpus = 'Users can discover fitness videos and browse workout sessions';
    const entities = extractEntitiesFromCorpus(corpus);
    expect(entities.contentItems.length).toBeGreaterThan(0);
    expect(entities.contentUnit).toBe('video');
    expect(entities.itemLabel).toBe('session');
  });

  it('extracts categories from capitalized terms', () => {
    const corpus = 'Categories: Yoga, HIIT, Strength Training, Cardio';
    const entities = extractEntitiesFromCorpus(corpus);
    expect(entities.categories.length).toBeGreaterThan(0);
  });
});

describe('stepToFigmaDescription', () => {
  it('produces content grid description with entities', () => {
    const desc = stepToFigmaDescription(
      'content_grid',
      { action: 'Discover videos', result: 'browse by category' },
      {
        categories: ['Yoga', 'HIIT'],
        contentItems: ['fitness videos'],
        contentUnit: 'video',
        itemLabel: 'session',
      },
      'Launch Fitness'
    );
    expect(desc).toContain('Content Grid');
    expect(desc).toContain('Launch Fitness');
    expect(desc).toContain('session');
  });

  it('includes speed control for media_player when step mentions speed', () => {
    const desc = stepToFigmaDescription(
      'media_player',
      { action: 'Play at my speed', result: '0.5x to 2x' },
      { categories: [], contentItems: [], contentUnit: 'video', itemLabel: 'video' },
      'App'
    );
    expect(desc).toContain('Speed control');
    expect(desc).toContain('0.5×');
  });
});

describe('generatePrototypeHtml (integration)', () => {
  it('produces app-style screens for fitness-style CPM (not Progress/Current Step)', () => {
    const cpm = {
      meta: { source: { document_name: 'Launch Fitness.md' } },
      jobs: [{ job_id: 'j1', description: 'Discover and use fitness content', trigger: 'User opens app' }],
      flows: [
        {
          name: 'Discover & Find Content',
          steps: [
            { action: 'As a user I can discover fitness videos', result: 'organized by category' },
            { action: 'Browse workout sessions', result: 'and filter by duration' },
          ],
        },
        {
          name: 'Use & Experience Content',
          steps: [
            { action: 'Play workout videos', result: 'at my own speed' },
          ],
        },
      ],
      intent: { problem: { statement: 'Users need fitness content' }, goal: { primary_outcome: 'Engage users' } },
    };
    const html = generatePrototypeHtml(cpm, { description: 'Music app', isDark: true });
    // Should produce valid app-style prototype with flow screens
    expect(html).toContain('Launch Fitness');
    expect(html).toContain('Discover');
    // Should NOT contain Progress/Current Step wizard text
    expect(html).not.toMatch(/●\s*Step\s+1.*○\s*Step\s+2/);
    expect(html).not.toContain('Current Step');
  });

  it('uses Enterprise Platform design library when document mentions Enterprise Platform (not strategy/media-player)', () => {
    const cpm = {
      meta: { source: { document_name: 'Enterprise PRD.md' } },
      jobs: [
        { job_id: 'j1', description: 'Run data processing in Enterprise Platform', trigger: 'Click Run Calculation' },
        { job_id: 'j2', description: 'Generate and deliver reports in Enterprise Platform', trigger: 'Click Generate Reports' },
      ],
      flows: [
        {
          name: 'Run data processing end to end',
          steps: [
            { action: 'Open Enterprise Platform and navigate to Calculations', result: 'Calculation workspace is visible' },
            { action: 'Click Run Calculation', result: 'A new run is created and status shows queued' },
          ],
        },
      ],
      intent: { problem: { statement: 'Data processing needs to run' }, goal: { primary_outcome: 'Accurate data runs' } },
    };
    const html = generatePrototypeHtml(cpm, { description: 'Enterprise Platform - Dark theme', isDark: true }, { isFinanceApp: true });
    // Should use enterprise blueprint: data tables, flow screens — NOT media player or play buttons
    expect(html).toContain('Enterprise PRD');
    expect(html).toContain('tbl');
    expect(html).not.toContain('media-player');
    expect(html).not.toContain('play-btn');
  });

  it('uses Enterprise Platform design library when content mentions it even if theme is generic', () => {
    const cpm = {
      meta: { source: { document_name: 'PRD.md' } },
      jobs: [{ job_id: 'j1', description: 'Complete compliance checks in Enterprise Platform', trigger: 'Open dashboard' }],
      flows: [{ name: 'Work compliance tasks', steps: [{ action: 'Open Enterprise Platform and navigate to Compliance Checks', result: 'Compliance dashboard loads' }] }],
      intent: { problem: { statement: 'Compliance checks' }, goal: { primary_outcome: 'Complete checks' } },
    };
    const html = generatePrototypeHtml(cpm, { description: 'Enterprise app', isDark: true }, { isFinanceApp: true });
    // Enterprise blueprint: flow screens, table layout — NOT media player
    expect(html).toContain('Work compliance tasks');
    expect(html).toContain('tbl');
    expect(html).not.toContain('media-player');
  });
});
