export async function api(path, { method = 'GET', body, formData } = {}) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (formData) {
    opts.body = formData;
  } else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, opts);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = new Error(data?.error || res.statusText || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const GET = (path) => api(path);
export const POST = (path, body) => api(path, { method: 'POST', body });
export const PATCH = (path, body) => api(path, { method: 'PATCH', body });
export const DEL = (path) => api(path, { method: 'DELETE' });
