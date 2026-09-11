import { localDate } from './dates.js';

export const planningSchema = { type: 'object', additionalProperties: false, properties: {
  priorities: { type: 'array', items: { type: 'object', additionalProperties: false,
    properties: {
      sourceId: { type: 'string' }, action: { type: 'string' }, reason: { type: 'string' }, suggestedDate: { type: 'string' },
      checks: { type: 'array', items: { type: 'string' } },
      steps: { type: 'array', items: { type: 'object', additionalProperties: false,
        properties: { text: { type: 'string' }, kind: { type: 'string', enum: ['suggested', 'required', 'optional'] }, quote: { type: 'string' } },
        required: ['text', 'kind', 'quote'] } },
    }, required: ['sourceId', 'action', 'reason', 'suggestedDate', 'checks', 'steps'],
  } },
}, required: ['priorities'] };

export function validatePriorities(result, evidence) {
  const sources = new Map([...evidence.items, ...(evidence.sources || [])].map(source => [source.id, source]));
  const seen = new Set();
  const text = (value, limit = 1000) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  if (!Array.isArray(result?.priorities) || result.priorities.length > 12) throw new Error('ChatGPT returned too many or invalid study suggestions.');
  for (const item of result.priorities) {
    const source = sources.get(item?.sourceId);
    if (!source || seen.has(item.sourceId)) throw new Error('ChatGPT returned suggestions without valid course references.');
    seen.add(item.sourceId);
    if (!text(item.action) || !text(item.reason) || !Array.isArray(item.steps) || item.steps.length < 1 || item.steps.length > 5
      || !Array.isArray(item.checks) || item.checks.length > 3 || item.checks.some(check => !text(check, 500))) throw new Error('ChatGPT returned incomplete preparation steps.');
    const suggested = Date.parse(`${item.suggestedDate}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.suggestedDate) || !Number.isFinite(suggested) || new Date(suggested).toISOString().slice(0, 10) !== item.suggestedDate
      || item.suggestedDate < evidence.week.today || item.suggestedDate > evidence.week.end) throw new Error('ChatGPT suggested a day outside the remaining guide week.');
    const limit = [source.dueAt, source.closesAt].filter(Boolean).sort()[0];
    if (limit) {
      const latest = [localDate(limit, evidence.timeZone), evidence.week.today].sort().at(-1);
      if (item.suggestedDate > latest) throw new Error('ChatGPT suggested preparation after the recorded deadline or closing date.');
    }
    const body = normalize(source.instructions || source.body);
    for (const step of item.steps) {
      if (!text(step.text, 500) || !['suggested', 'required', 'optional'].includes(step.kind) || typeof step.quote !== 'string' || step.quote.length > 300) throw new Error('ChatGPT returned an invalid preparation step.');
      if (source.authorUnverified && step.kind !== 'suggested') throw new Error('ChatGPT treated an unverified message as a course requirement.');
      if (step.kind !== 'suggested' && (normalize(step.quote).length < 12 || !body.includes(normalize(step.quote)))) throw new Error('ChatGPT labeled a course requirement without a matching source quote.');
      if (step.kind === 'suggested' && step.quote !== '') throw new Error('ChatGPT mixed suggested preparation with a source claim.');
    }
  }
  return result.priorities;
}
