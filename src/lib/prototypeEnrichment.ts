/**
 * LLM-enriched mock data for HTML prototypes.
 * When enabled and API key is available, generates PRD-specific sample content.
 * Falls back to null on any failure (deterministic enrichment is used instead).
 */

export interface PrototypeMockData {
  tableRows?: Array<{
    entity: string;
    period: string;
    status: string;
    amount?: string;
    [key: string]: unknown;
  }>;
  metrics?: Array<{ label: string; value: string; change: string }>;
  recommendations?: Array<{ title: string; desc: string; priority: string }>;
}

/** Generate PRD-specific mock data via LLM. Returns null on failure or when disabled. */
export async function generatePrototypeMockData(cpm: any, forceEnrich?: boolean): Promise<PrototypeMockData | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const enrich = forceEnrich || process.env.RAPIDLY_PROTOTYPE_ENRICH === 'true';
  if (!enrich) return null;

  const problem = cpm?.intent?.problem?.statement ?? '';
  const outcome = cpm?.intent?.goal?.primary_outcome ?? '';
  const jobs = cpm?.jobs ?? [];
  const entities = (cpm?.extraction?.entities ?? []).concat(
    jobs.flatMap((j: any) => (j?.description ?? '').match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) ?? [])
  );

  const prompt = `Given this product context, generate realistic sample data for an HTML prototype.

**Problem:** ${problem.slice(0, 300)}
**Outcome:** ${outcome.slice(0, 200)}
**Jobs:** ${jobs.map((j: any) => j?.description ?? '').slice(0, 100).join('; ')}
**Entities mentioned:** ${[...new Set(entities)].slice(0, 8).join(', ') || 'items'}

Return ONLY valid JSON matching this structure (no markdown, no explanation):
{
  "tableRows": [
    { "entity": "string", "period": "e.g. Jan 2026", "status": "Done|In Progress|Failed|Signed off", "amount": "optional" }
  ],
  "metrics": [
    { "label": "string", "value": "e.g. 124", "change": "e.g. +12%" }
  ],
  "recommendations": [
    { "title": "string", "desc": "string", "priority": "high|medium|low" }
  ]
}

Generate 4-6 table rows, 3-4 metrics, 2-3 recommendations. Use domain-appropriate terminology.`;

  try {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey });

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 800,
    });

    const raw = response.choices?.[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw) as PrototypeMockData;
    if (!parsed || typeof parsed !== 'object') return null;

    return {
      tableRows: Array.isArray(parsed.tableRows) ? parsed.tableRows.slice(0, 8) : undefined,
      metrics: Array.isArray(parsed.metrics) ? parsed.metrics.slice(0, 4) : undefined,
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 4) : undefined,
    };
  } catch {
    return null;
  }
}
