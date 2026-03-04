import { describe, it, expect } from 'vitest';
import { planBlueprint, renderBlueprint } from '../prototypeBlueprint';

const ENTERPRISE_THEME = { name: 'enterprise', description: 'Enterprise dark' };

describe('planBlueprint', () => {
  it('produces overview screen for empty CPM without enterprise theme', () => {
    const blueprint = planBlueprint({ cpm: {} });
    expect(blueprint.appName).toBe('Prototype');
    expect(blueprint.screens).toBeDefined();
    expect(Array.isArray(blueprint.screens)).toBe(true);
    expect(blueprint.screens.length).toBeGreaterThan(0);
    expect(blueprint.screens[0]).toMatchObject({ id: 'overview', title: 'Overview', route: '/overview' });
  });

  it('produces overview screen for empty CPM with enterprise theme', () => {
    const blueprint = planBlueprint({ cpm: {}, theme: ENTERPRISE_THEME });
    expect(blueprint.screens[0]).toMatchObject({ id: 'overview', title: 'Overview', route: '/overview' });
  });

  it('produces calculation screen when flow mentions data calculation', () => {
    const blueprint = planBlueprint({
      cpm: {
        meta: { source: { document_name: 'Enterprise PRD.md' } },
        flows: [
          {
            name: 'Run data calculation end to end',
            steps: [
              { actor_id: 'User', action: 'Open Enterprise Platform', result: 'Calculation workspace visible' },
              { actor_id: 'User', action: 'Click Run Calculation', result: 'Run created' },
            ],
          },
        ],
      },
      theme: ENTERPRISE_THEME,
    });
    expect(blueprint.appName).toBe('Enterprise PRD');
    const calcScreen = blueprint.screens.find((s) => s.id === 'run-data-calculation-end-to-end');
    expect(calcScreen).toBeDefined();
    expect(calcScreen?.title).toBe('Run data calculation end to end');
    expect((calcScreen as { flowType?: string })?.flowType).toBe('calculation');
  });

  it('produces contract screen when flow mentions contracts', () => {
    const blueprint = planBlueprint({
      cpm: {
        flows: [
          {
            name: 'Manage contracts',
            steps: [{ actor_id: 'User', action: 'View contract', result: 'Details visible' }],
          },
        ],
      },
      theme: ENTERPRISE_THEME,
    });
    const contractScreen = blueprint.screens.find((s) => s.id === 'manage-contracts');
    expect(contractScreen).toBeDefined();
    expect((contractScreen as { flowType?: string })?.flowType).toBe('contract');
  });
});

describe('renderBlueprint', () => {
  it('produces valid HTML string', () => {
    const blueprint = planBlueprint({
      cpm: {
        meta: { source: { document_name: 'Test.md' } },
        flows: [
          {
            name: 'Run data calculation',
            steps: [{ actor_id: 'User', action: 'Click Run', result: 'Done' }],
          },
        ],
      },
      theme: ENTERPRISE_THEME,
    });
    const html = renderBlueprint(blueprint);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html>');
    expect(html).toContain('</html>');
    expect(html).toContain('Test');
    expect(html).toContain('Run data calculation');
    expect(html).toContain('go(');
    expect(html).toContain('switchTab(');
    expect(html).toContain('openDetail(');
    expect(html).toContain('filterTable(');
    expect(html).toContain('sortTable(');
  });

  it('uses token variables in CSS', () => {
    const blueprint = planBlueprint({ cpm: {} });
    const html = renderBlueprint(blueprint);
    expect(html).toContain('--bp-sidebar');
    expect(html).toContain('--bp-bg');
    expect(html).toContain('--bp-accent');
  });

  it('includes flowsJson for step modal', () => {
    const blueprint = planBlueprint({
      cpm: {
        flows: [{ name: 'Flow 1', steps: [{ actor_id: 'U', action: 'A', result: 'R' }] }],
      },
    });
    const html = renderBlueprint(blueprint, null, JSON.stringify([{ n: 'Flow 1', s: [{ a: 'U', x: 'A', r: 'R' }] }]));
    expect(html).toContain('"n":"Flow 1"');
    expect(html).toContain('"a":"U"');
  });
});
