// Thin auth-injecting proxy to NoCodeBackend's Data API.
// No game rules live here — the client is host-authoritative (see docs/SPEC.md §8).
// This function's only job is keeping NCB_SECRET_KEY off the browser.

const ALLOWED_TABLES = new Set([
  'rooms',
  'players',
  'rounds',
  'submissions',
  'deck_cards',
  'judging_slots',
]);

export const config = { path: '/api/data/*' };

export default async (request) => {
  const { NCB_INSTANCE, NCB_DATA_API_URL, NCB_SECRET_KEY } = process.env;
  if (!NCB_INSTANCE || !NCB_DATA_API_URL || !NCB_SECRET_KEY) {
    return json({ error: 'Server misconfigured: missing NCB env vars' }, 500);
  }

  const url = new URL(request.url);
  // Path arrives as /api/data/<action>/<table>, e.g. /api/data/read/rooms
  const segments = url.pathname.replace(/^\/api\/data\//, '').split('/').filter(Boolean);
  const [action, table] = segments;

  if (!['read', 'create', 'update', 'delete'].includes(action)) {
    return json({ error: `Unknown action "${action}"` }, 400);
  }
  if (!ALLOWED_TABLES.has(table)) {
    return json({ error: `Unknown table "${table}"` }, 400);
  }
  if (action === 'read' && request.method !== 'GET') {
    return json({ error: 'read requires GET' }, 405);
  }
  if (action !== 'read' && request.method !== 'POST') {
    return json({ error: `${action} requires POST` }, 405);
  }

  const upstream = new URL(`${NCB_DATA_API_URL}/${action}/${table}`);
  upstream.searchParams.set('instance', NCB_INSTANCE);
  url.searchParams.forEach((value, key) => {
    if (key.toLowerCase() !== 'instance') upstream.searchParams.append(key, value);
  });

  const body = action === 'read' ? undefined : await request.text();

  const upstreamRes = await fetch(upstream.toString(), {
    method: request.method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${NCB_SECRET_KEY}`,
    },
    body,
  });

  const data = await upstreamRes.text();
  return new Response(data, {
    status: upstreamRes.status,
    headers: { 'Content-Type': 'application/json' },
  });
};

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
