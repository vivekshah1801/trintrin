export function load(key, fallback) {
  try {
    var raw = localStorage.getItem('trintrin.' + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

export function store(key, value) {
  try {
    localStorage.setItem('trintrin.' + key, JSON.stringify(value));
  } catch (e) {
    /* ignore quota or serialization errors */
  }
}

if (typeof window !== 'undefined') {
  window.TrintrinStorage = { load: load, store: store };
}
