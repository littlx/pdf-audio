import { DRAFT_PREFIX, LAST_AUDIO_KEY, OFFLINE_CACHE_NAME, TOKEN_KEY } from '../lib/storageKeys';

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || '';
}

export async function setToken(token: string) {
  const data = await api<{ ok: boolean; token: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ token }),
    skipAuth: true,
  });
  sessionStorage.setItem(TOKEN_KEY, data.token);
}

export async function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
  try {
    await api('/api/auth/logout', { method: 'POST', skipAuth: true });
  } catch {
    // Ignore logout network failures; local session state is already cleared.
  }
}

export function formatValidationError(detail: unknown) {
  if (Array.isArray(detail)) {
    return detail.map((item: any) => {
      const loc = Array.isArray(item?.loc) ? item.loc.join('.') : 'field';
      return `${loc}: ${item?.msg || 'Invalid value'}`;
    }).join('; ');
  }
  if (typeof detail === 'string') return detail;
  return '';
}

export function parseApiErrorMessage(responseText: string, fallback = '') {
  let message = fallback;
  try {
    const data = JSON.parse(responseText);
    message = formatValidationError(data.detail) || data.detail || message;
  } catch {}
  return String(message || '');
}

type ApiRequestInit = RequestInit & { skipAuth?: boolean };

export async function api<T>(path: string, options: ApiRequestInit = {}): Promise<T> {
  const { skipAuth, ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers || {});
  const token = getToken();
  if (token && !skipAuth) headers.set('X-Access-Token', token);
  if (!(fetchOptions.body instanceof FormData) && fetchOptions.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(path, { ...fetchOptions, headers, credentials: 'same-origin' });
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
  if ('caches' in window) await caches.delete(OFFLINE_CACHE_NAME);
  navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_OFFLINE_CACHE', cacheName: OFFLINE_CACHE_NAME });
}

export function clearLocalAppState() {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith(DRAFT_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
  localStorage.removeItem(LAST_AUDIO_KEY);
}
