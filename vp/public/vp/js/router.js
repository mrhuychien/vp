// Minimal hash router with :param + ?query support.
let ROUTES = [];
let onRouteCb = null;

function compile(pattern) {
  // '#/vanban/:name' -> regex + param names
  const names = [];
  const rx = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\/:([\w]+)/g, (_, n) => { names.push(n); return '/([^/]+)'; });
  return { rx: new RegExp('^' + rx + '$'), names };
}

export function defineRoutes(defs) {
  // defs: [{ pattern, load }]  where load() returns a module with render()
  ROUTES = defs.map((d) => ({ ...d, ...compile(d.pattern) }));
}

export function parseHash() {
  let h = location.hash || '#/';
  if (!h.startsWith('#')) h = '#' + h;
  const raw = h.slice(1); // '/vanban?kw=abc'
  const [path, qs] = raw.split('?');
  const query = {};
  if (qs) {
    for (const pair of qs.split('&')) {
      if (!pair) continue;
      const [k, v] = pair.split('=');
      query[decodeURIComponent(k)] = decodeURIComponent(v || '');
    }
  }
  return { path: path || '/', query };
}

export function match(path) {
  for (const r of ROUTES) {
    const m = path.match(r.rx);
    if (m) {
      const params = {};
      r.names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
      return { route: r, params };
    }
  }
  return null;
}

export function navigate(hash) {
  if (location.hash === hash) { dispatch(); }
  else location.hash = hash;
}

// Update the URL query without triggering a re-render (in-view state sync).
export function replaceQuery(path, query) {
  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const hash = '#' + path + (qs ? '?' + qs : '');
  history.replaceState(null, '', hash);
}

async function dispatch() {
  const { path, query } = parseHash();
  const found = match(path);
  if (onRouteCb) await onRouteCb({ path, query, found });
}

export function initRouter(cb) {
  onRouteCb = cb;
  window.addEventListener('hashchange', dispatch);
  if (!location.hash) location.hash = '#/';
  else dispatch();
}
