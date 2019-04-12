export const supportedNodeTypes = new Set(['text', 'button', 'quick_replies']);

export function parseVar(str = '') {
  return str.replace(/%/g, '');
}

export function toDashCase(str = '') {
  return str
    .toLowerCase()
    .replace(/\s/g, '-')
    .replace(/_/g, '');
}
