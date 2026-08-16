// Thin client for the /api/data/* proxy (netlify/functions/data.js), which
// forwards to nocodebackend's Data API. No game rules here — see
// docs/SPEC.md §8 and host-engine.js for where those live.

const BASE = "/api/data";
const METHOD = { read: "GET", create: "POST", update: "PUT", delete: "DELETE" };

async function request(action, table, { id, query, body } = {}) {
  // NocodeBackend addresses an individual row with a path segment for every
  // action, including reads: /read/<table>/<id>.
  const path = id !== undefined ? `${action}/${table}/${id}` : `${action}/${table}`;
  const params = new URLSearchParams(query || {});
  const qs = params.toString();
  const url = `${BASE}/${path}${qs ? `?${qs}` : ""}`;

  const res = await fetch(url, {
    method: METHOD[action],
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let payload;
  try {
    payload = await res.json();
  } catch {
    throw new Error(`${action} ${table}: non-JSON response (${res.status})`);
  }
  if (!res.ok || payload.status === "error") {
    throw new Error(payload.error || payload.message || `${action} ${table} failed (${res.status})`);
  }
  return payload;
}

export const api = {
  /** Read many rows, optionally filtered — query is a plain {column: value} map (see NCB filter operators, e.g. {"score[gte]": 3}). */
  async read(table, query) {
    const { data } = await request("read", table, { query });
    return data || [];
  },
  async readOne(table, id) {
    const { data } = await request("read", table, { id });
    return (Array.isArray(data) ? data[0] : data) || null;
  },
  /** Returns the new row's id. */
  async create(table, fields) {
    const { id } = await request("create", table, { body: fields });
    return id;
  },
  async bulkCreate(table, records) {
    const path = `bulk/create/${table}`;
    const res = await fetch(`${BASE}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records }),
    });
    const payload = await res.json();
    if (!res.ok && res.status !== 207) {
      throw new Error(payload.error || `bulk create ${table} failed (${res.status})`);
    }
    return payload;
  },
  async update(table, id, fields) {
    return request("update", table, { id, body: fields });
  },
  async remove(table, id) {
    return request("delete", table, { id });
  },
};
