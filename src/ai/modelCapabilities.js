// Explicit capabilities: unknown models only expose the provider default.
export const ADAPTER_VERSION = 2;
export function effortOptions(provider, model = '') {
  const name = model.replace(/^models\//, '');
  if (provider === 'chatgpt') {
    if (/^gpt-(?:6-(?:luna|sol)|6\.1-terra|5\.6-(?:luna|terra))(?:$|-\d)/.test(name)) return ['default', 'none', 'low', 'medium', 'high', 'xhigh', 'max'];
    if (/^gpt-(?:6-astra|6\.1-sol)(?:$|-\d)/.test(name)) return ['default', 'low', 'medium', 'high', 'xhigh', 'max'];
  }
  return ['default'];
}
export function validateEffort(provider, model, effort = 'default') {
  if (!['jev', 'chatgpt'].includes(provider)) throw Object.assign(new Error('Unsupported AI provider'), { code: 'provider-unsupported', status: 400 });
  if (!effortOptions(provider, model).includes(effort)) throw Object.assign(new Error('Unsupported reasoning effort for this model'), { code: 'effort', status: 400 });
  return effort;
}
export function reasoningParameters(provider, model, effort = 'default') {
  validateEffort(provider, model, effort);
  if (effort === 'default') return {};
  if (provider === 'chatgpt') return { reasoning: { effort } };
  return {};
}
export const providerModel = (settings, protocol) => settings.provider === 'chatgpt' ? settings.chatgptModel :
  protocol.aiConfig?.model || 'jev-1.13.0';
export const selectedEffort = (settings, model) => settings.effortByModel?.[`${settings.provider || 'jev'}:${model}`] || 'default';
export const requiresReevaluation = suggestion => !!suggestion?.provider && suggestion.provider !== 'jev' && (suggestion.provider !== 'chatgpt' || suggestion.adapterVersion !== ADAPTER_VERSION);
