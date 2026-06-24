// Thin fetch wrapper — returns { data } to match the axios interface used by pages

type Params = Record<string, string | number | boolean | undefined | null>;

async function request<T = unknown>(
  method: string,
  path: string,
  options?: { body?: unknown; params?: Params }
): Promise<{ data: T }> {
  let url = path;
  if (options?.params) {
    const filtered = Object.entries(options.params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, String(v)]);
    if (filtered.length > 0) url += "?" + new URLSearchParams(filtered);
  }

  const res = await fetch(url, {
    method,
    headers: options?.body ? { "Content-Type": "application/json" } : {},
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    const error = new Error(err.error || err.detail || "Request failed") as Error & {
      response?: { data: unknown; status: number };
    };
    error.response = { data: err, status: res.status };
    throw error;
  }

  const data = (await res.json()) as T;
  return { data };
}

const get = <T = unknown>(path: string, params?: Params) =>
  request<T>("GET", path, { params });
const post = <T = unknown>(path: string, body?: unknown) =>
  request<T>("POST", path, { body });
const patch = <T = unknown>(path: string, body?: unknown) =>
  request<T>("PATCH", path, { body });
const del = <T = unknown>(path: string) => request<T>("DELETE", path);

// Auth — handled directly by Supabase on the client; these are kept for compatibility
export const authApi = {
  demoCredentials: () => get("/api/demo-credentials"),
};

// Profile
export const usersApi = {
  me: () => get("/api/profile"),
  update: (data: object) => patch("/api/profile", data),
  changePassword: (_data: object) => Promise.resolve({ data: {} }),
};

// Households
export const householdsApi = {
  mine: () => get("/api/households"),
  update: (data: object) => patch("/api/households", data),
  invite: (data: object) => post("/api/households/invite", data),
  previewInvite: (token: string) => get(`/api/households/invite/${token}`),
};

// Accounts
export const accountsApi = {
  list: () => get("/api/accounts"),
  link: (data: object) => post("/api/accounts", data),
  update: (id: string, data: object) => patch(`/api/accounts/${id}`, data),
  disconnect: (id: string) => del(`/api/accounts/${id}`),
  netWorth: () => get("/api/accounts/net-worth"),
};

// Transactions
export const transactionsApi = {
  list: (params?: Params) => get("/api/transactions", params),
  update: (id: string, data: object) => patch(`/api/transactions/${id}`, data),
  summary: (startDate: string, endDate: string) =>
    get("/api/transactions/summary", { start_date: startDate, end_date: endDate }),
};

// Budgets
export const budgetsApi = {
  list: () => get("/api/budgets"),
  create: (data: object) => post("/api/budgets", data),
  progress: (id: string) => get(`/api/budgets/${id}/progress`),
  delete: (id: string) => del(`/api/budgets/${id}`),
};

// Goals
export const goalsApi = {
  list: () => get("/api/goals"),
  create: (data: object) => post("/api/goals", data),
  update: (id: string, data: object) => patch(`/api/goals/${id}`, data),
  contribute: (id: string, data: object) => post(`/api/goals/${id}/contribute`, data),
};

// Insights
export const insightsApi = {
  list: (params?: Params) => get("/api/insights", params),
  action: (id: string, action: string) => post(`/api/insights/${id}/action`, { action }),
  generate: () => post("/api/insights/generate"),
};

// Chat
export const chatApi = {
  threads: () => get("/api/chat/threads"),
  thread: (id: string) => get(`/api/chat/threads/${id}`),
  sendMessage: (message: string, threadId?: string) =>
    post("/api/chat", { message, thread_id: threadId }),
  deleteThread: (id: string) => del(`/api/chat/threads/${id}`),
};

// ETF
export const etfApi = {
  screen: (params?: Params) => get("/api/etf", params),
  featured: () => get("/api/etf/featured"),
  detail: (ticker: string) => get(`/api/etf/${ticker}`),
  watchlist: () => get("/api/etf/watchlist"),
  addToWatchlist: (ticker: string) => post(`/api/etf/watchlist/${ticker}`),
  removeFromWatchlist: (ticker: string) => del(`/api/etf/watchlist/${ticker}`),
};
