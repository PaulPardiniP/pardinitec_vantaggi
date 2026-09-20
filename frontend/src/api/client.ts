export class ApiError extends Error {
  status: number;
  errors?: Record<string, string[]>;
  retryAfter?: number;

  constructor(message: string, status: number, errors?: Record<string, string[]>, retryAfter?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
    this.retryAfter = retryAfter;
  }
}

let cachedCsrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  cachedCsrfToken = token;
}

export function getCsrfToken(): string | null {
  return cachedCsrfToken;
}

export function generateOperationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'op_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();
}

export async function fetchCsrfToken(): Promise<string> {
  try {
    const res = await fetch('/api/v1/auth/csrf', {
      method: 'GET',
      credentials: 'include',
    });
    if (!res.ok) {
      throw new ApiError('Impossibile ottenere il token CSRF', res.status);
    }
    const data = await res.json();
    const token = data.data?.csrf_token || data.csrf_token || '';
    cachedCsrfToken = token;
    return token;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('Errore di rete durante la richiesta del token CSRF', 0);
  }
}

export interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

export async function apiRequest<T = any>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});

  // Gestione automatica del token CSRF per richieste mutative
  const isMutative = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  if (isMutative) {
    let token = cachedCsrfToken;
    if (!token) {
      try {
        token = await fetchCsrfToken();
      } catch {
        // Se non autenticato o endpoint non richiede CSRF, procedere
      }
    }
    if (token) {
      headers.set('X-CSRF-Token', token);
    }
  }

  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Costruzione query params
  let url = endpoint;
  if (options.params) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined && value !== null && value !== '') {
        query.append(key, String(value));
      }
    }
    const qs = query.toString();
    if (qs) {
      url += (url.includes('?') ? '&' : '?') + qs;
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      method,
      headers,
      credentials: 'include', // Obbligatorio per cookie di sessione
    });
  } catch (netErr: any) {
    throw new ApiError(netErr.message || 'Errore di connessione al server', 0);
  }

  // Parsing JSON o testo
  let data: any = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const retryAfter = response.headers.get('Retry-After')
      ? parseInt(response.headers.get('Retry-After') || '0', 10)
      : undefined;

    const message =
      (data && typeof data === 'object' && (data.error || data.message)) ||
      (typeof data === 'string' && data) ||
      `Errore HTTP ${response.status}`;

    const errors = data && typeof data === 'object' ? data.errors : undefined;

    // Se la risposta è 403 per CSRF scaduto, ripulire la cache e ritentare una volta
    if (response.status === 403 && typeof message === 'string' && message.toLowerCase().includes('csrf')) {
      cachedCsrfToken = null;
      try {
        const freshToken = await fetchCsrfToken();
        if (freshToken) {
          headers.set('X-CSRF-Token', freshToken);
          const retryRes = await fetch(url, {
            ...options,
            method,
            headers,
            credentials: 'include',
          });
          if (retryRes.ok) {
            const ct = retryRes.headers.get('content-type') || '';
            if (ct.includes('application/json')) {
              return (await retryRes.json()) as T;
            }
            return (await retryRes.text()) as unknown as T;
          }
        }
      } catch {
        // Fallback al messaggio di errore standard
      }
      throw new ApiError('Sessione scaduta. Accedi nuovamente.', 403, errors, retryAfter);
    }

    if (response.status === 401) {
      throw new ApiError('Sessione scaduta. Accedi nuovamente.', 401, errors, retryAfter);
    }

    throw new ApiError(message, response.status, errors, retryAfter);
  }

  return data;
}
