import { QueryClient, QueryFunction } from "@tanstack/react-query";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

// ============================================================
// Admin session storage — persists the logged-in admin id so admin
// API calls can attach an X-Admin-User-Id header automatically.
// ============================================================
const ADMIN_KEY = "cardscan.admin.userId";
export function setAdminUserId(id: number | null) {
  try {
    if (id) localStorage.setItem(ADMIN_KEY, String(id));
    else localStorage.removeItem(ADMIN_KEY);
  } catch {}
}
export function getStoredAdminUserId(): number | null {
  try {
    const v = localStorage.getItem(ADMIN_KEY);
    return v ? parseInt(v, 10) : null;
  } catch { return null; }
}

function adminHeadersFor(url: string): Record<string, string> {
  if (!url.startsWith("/api/admin")) return {};
  const id = getStoredAdminUserId();
  return id ? { "X-Admin-User-Id": String(id) } : {};
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {
    ...(data ? { "Content-Type": "application/json" } : {}),
    ...adminHeadersFor(url),
  };
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/");
    const res = await fetch(`${API_BASE}${url}`, {
      headers: adminHeadersFor(url),
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
