const TOKEN_KEY = 'sub_pdf_access_token';
const OFFLINE_CACHE = 'sub-pdf-offline-audio-v1';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  document.cookie = `${TOKEN_KEY}=${encodeURIComponent(token)}; path=/; SameSite=Lax`;
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0; SameSite=Lax`;
}

function formatValidationError(detail: unknown) {
  if (Array.isArray(detail)) {
    return detail.map((item: any) => {
      const loc = Array.isArray(item?.loc) ? item.loc.join('.') : 'field';
      return `${loc}: ${item?.msg || 'Invalid value'}`;
    }).join('; ');
  }
  if (typeof detail === 'string') return detail;
  return '';
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  const token = getToken();
  if (token) headers.set('X-Access-Token', token);
  if (!(options.body instanceof FormData) && options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    let message = response.statusText;
    try {
      const data = await response.json();
      message = formatValidationError(data.detail) || data.detail || message;
    } catch {}
    throw new Error(message);
  }
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json();
  return response as any;
}

export async function clearOfflineCaches() {
  if ('caches' in window) await caches.delete(OFFLINE_CACHE);
  navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_OFFLINE_CACHE', cacheName: OFFLINE_CACHE });
}
