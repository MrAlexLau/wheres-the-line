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
  // or /api/data/bulk/<action>/<table>, e.g. /api/data/bulk/create/deck_cards
  const segments = url.pathname.replace(/^\/api\/data\//, '').split('/').filter(Boolean);
  const isBulk = segments[0] === 'bulk';
  const action = isBulk ? `${segments[0]}/${segments[1]}` : segments[0];
  const table = isBulk ? segments[2] : segments[1];
  const baseAction = isBulk ? segments[1] : segments[0];
  // update/delete take the record id as a path segment after the table, e.g.
  // /api/data/update/rooms/42 — read uses ?id= instead (see api.js).
  const recordId = isBulk ? undefined : segments[2];

  // Upstream's real method per action (create=POST, read=GET, update=PUT,
  // delete=DELETE — the integration guide's "cheat sheet" says POST for all
  // three writes, but the actual swagger spec disagrees; swagger wins).
  const UPSTREAM_METHOD = { read: 'GET', create: 'POST', update: 'PUT', delete: 'DELETE' };
  if (!(baseAction in UPSTREAM_METHOD)) {
    return json({ error: `Unknown action "${action}"` }, 400);
  }
  if (!ALLOWED_TABLES.has(table)) {
    return json({ error: `Unknown table "${table}"` }, 400);
  }

  const upstreamPath = recordId ? `${action}/${table}/${recordId}` : `${action}/${table}`;
  const upstream = new URL(`${NCB_DATA_API_URL}/${upstreamPath}`);
  upstream.searchParams.set('instance', NCB_INSTANCE);
  url.searchParams.forEach((value, key) => {
    if (key.toLowerCase() !== 'instance') upstream.searchParams.append(key, value);
  });

  const body = baseAction === 'read' ? undefined : await request.text();
  // bulk/create and bulk/update use PUT/POST per-collection; single-record
  // create/update/delete use the upstream method table above.
  const method = isBulk
    ? segments[1] === 'delete'
      ? 'DELETE'
      : segments[1] === 'update'
        ? 'PUT'
        : 'POST'
    : UPSTREAM_METHOD[baseAction];

  const upstreamRes = await fetch(upstream.toString(), {
    method,
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
