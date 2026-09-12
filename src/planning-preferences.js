import { redactCredentials } from './content.js';

export const DEFAULT_PLANNING_PREFERENCES = { includeWithAI: false, availability: '', priorities: '', detail: 'standard' };

export function validatePlanningPreferences(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.includeWithAI !== 'boolean'
    || !['brief', 'standard', 'detailed'].includes(value.detail)
    || ['availability', 'priorities'].some(key => typeof value[key] !== 'string' || value[key].length > 1500)) {
    throw new Error('Use up to 1,500 characters per study preference and choose a guide length.');
  }
  return { includeWithAI: value.includeWithAI, availability: value.availability.trim(), priorities: value.priorities.trim(), detail: value.detail };
}

export function sharedPlanningPreferences(value) {
  if (!value?.includeWithAI) return null;
  const valid = validatePlanningPreferences(value);
  return { availability: redactCredentials(valid.availability), priorities: redactCredentials(valid.priorities), detail: valid.detail };
}
