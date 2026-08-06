const csrfTokens = new Map<string, string>();

function normalizedBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.replace(/\/+$/, "");
}

export function apiUrl(apiBaseUrl: string, path: string): string {
  return `${normalizedBaseUrl(apiBaseUrl)}${path}`;
}

async function getCsrfToken(apiBaseUrl: string): Promise<string> {
  const key = normalizedBaseUrl(apiBaseUrl);
  const cached = csrfTokens.get(key);
  if (cached) return cached;

  const response = await fetch(apiUrl(apiBaseUrl, "/api/auth/csrf"), {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("The security token could not be created. Refresh the page and try again.");
  }

  const payload = (await response.json()) as { token: string };
  csrfTokens.set(key, payload.token);
  return payload.token;
}

export async function apiFetch(
  apiBaseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    headers.set("X-CSRF-TOKEN", await getCsrfToken(apiBaseUrl));
  }

  return fetch(apiUrl(apiBaseUrl, path), {
    ...init,
    method,
    headers,
    credentials: "include",
  });
}

export function clearCsrfToken(apiBaseUrl: string): void {
  csrfTokens.delete(normalizedBaseUrl(apiBaseUrl));
}
