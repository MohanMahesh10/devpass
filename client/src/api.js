// Small fetch wrapper. Uses REACT_APP_API_BASE if set (for split frontend/backend deployments),
// otherwise defaults to same-origin (works with CRA dev proxy and combined deployment).
const BASE = process.env.REACT_APP_API_BASE || '';

function url(path) {
  return `${BASE}${path}`;
}

async function handle(res) {
  let data = null;
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function apiGet(path, token) {
  const res = await fetch(url(path), {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  return handle(res);
}

export async function apiPost(path, body, token) {
  const res = await fetch(url(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body || {})
  });
  return handle(res);
}
