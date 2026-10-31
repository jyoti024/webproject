let token = localStorage.getItem('token');
let onUnauthorized = () => {};

export const isLoggedIn = () => !!token;
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export function setToken(t) {
  token = t;
  if (t) localStorage.setItem('token', t);
  else localStorage.removeItem('token');
}

async function send(path, method = 'GET', body) {
  try {
    return await fetch('/api' + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    const e = new Error('Cannot reach the server. Start the backend (npm start in the backend folder).');
    e.status = 0;
    throw e;
  }
}

export async function api(path, method = 'GET', body) {
  const res = await send(path, method, body);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token && !path.startsWith('/login')) {
    setToken(null);
    onUnauthorized();
  }
  if (!res.ok) {
    const e = new Error(data.error || 'Request failed');
    e.status = res.status;
    throw e;
  }
  return data;
}

// Downloads a file that needs the sign-in token (e.g. the Excel workbook).
export async function download(path, filename) {
  const res = await send(path);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Download failed');
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
