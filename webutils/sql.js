export function text(value) {
  return value === null || value === undefined ? '' : String(value);
}

export function quote(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}
if (typeof window !== 'undefined') {
  window.TrintrinSQL = { text: text, quote: quote };
}
