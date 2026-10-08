const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL ?? 'http://localhost:4100/api';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  token?: string | null;
  body?: unknown;
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  message?: string | string[];
}

interface RefreshedSession {
  accessToken: string;
  user?: unknown;
}

let currentAccessToken: string | null = null;
let refreshRequest: Promise<RefreshedSession> | null = null;
let accessTokenListener: ((token: string | null) => void) | null = null;

export function setApiAccessToken(token: string | null) {
  currentAccessToken = token;
  accessTokenListener?.(token);
}

export function subscribeToApiAccessToken(
  listener: (token: string | null) => void,
) {
  accessTokenListener = listener;
  return () => {
    if (accessTokenListener === listener) accessTokenListener = null;
  };
}

export function refreshApiSession<T extends RefreshedSession>(): Promise<T> {
  if (!refreshRequest) {
    refreshRequest = (async () => {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
      });
      const text = await response.text();
      const json: Envelope<RefreshedSession> | undefined = text
        ? JSON.parse(text)
        : undefined;

      if (!response.ok || !json?.success || !json.data?.accessToken) {
        const message = json?.message
          ? Array.isArray(json.message)
            ? json.message.join(', ')
            : json.message
          : `Session refresh failed with status ${response.status}`;
        throw new ApiError(message, response.status);
      }

      setApiAccessToken(json.data.accessToken);
      return json.data;
    })().finally(() => {
      refreshRequest = null;
    });
  }
  return refreshRequest as Promise<T>;
}

async function refreshAccessToken(): Promise<string> {
  const session = await refreshApiSession<{ accessToken: string }>();
  return session.accessToken;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { token, body, headers, ...rest } = options;
  const send = (accessToken: string | null) =>
    fetch(`${API_URL}${path}`, {
      ...rest,
      credentials: 'include',
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });

  const refreshExcluded =
    path === '/auth/refresh' || path === '/auth/login' || path === '/auth/logout';
  let res = await send(currentAccessToken ?? token ?? null);
  if (res.status === 401 && !refreshExcluded) {
    try {
      const freshToken = await refreshAccessToken();
      res = await send(freshToken);
    } catch (error) {
      setApiAccessToken(null);
      throw error;
    }
  }

  const text = await res.text();
  const json: Envelope<T> | undefined = text ? JSON.parse(text) : undefined;

  if (!res.ok || !json?.success) {
    const message = json?.message
      ? Array.isArray(json.message)
        ? json.message.join(', ')
        : json.message
      : `Request failed with status ${res.status}`;
    throw new ApiError(message, res.status);
  }

  return json.data as T;
}
