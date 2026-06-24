import type {
  User, Household, Account, NetWorthSummary,
  Transaction, SpendingSummary, Budget, BudgetProgress,
  Goal, Insight, ChatThread, ChatMessage, ETFSecurity,
} from "@/types";

type Params = Record<string, string | number | boolean | undefined | null>;

async function request<T>(
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

const get = <T>(path: string, params?: Params) => request<T>("GET", path, { params });
const post = <T>(path: string, body?: unknown) => request<T>("POST", path, { body });
const patch = <T>(path: string, body?: unknown) => request<T>("PATCH", path, { body });
const del = (path: string) => request<void>("DELETE", path);

export const authApi = {
  demoCredentials: () => get<{ demo_mode: boolean }>("/api/demo-credentials"),
};

export const usersApi = {
  me: () => get<User>("/api/profile"),
  update: (data: object) => patch<User>("/api/profile", data),
  changePassword: (_data: object) => Promise.resolve({ data: undefined as void }),
};

export const householdsApi = {
  mine: () => get<Household>("/api/households"),
  update: (data: object) => patch<Household>("/api/households", data),
  invite: (data: object) => post<{ id: string; invite_url: string }>("/api/households/invite", data),
  previewInvite: (token: string) => get<Household>(`/api/households/invite/${token}`),
};

export const accountsApi = {
  list: () => get<Account[]>("/api/accounts"),
  link: (data: object) => post<Account>("/api/accounts", data),
  update: (id: string, data: object) => patch<Account>(`/api/accounts/${id}`, data),
  disconnect: (id: string) => del(`/api/accounts/${id}`),
  netWorth: () => get<NetWorthSummary>("/api/accounts/net-worth"),
};

export const transactionsApi = {
  list: (params?: Params) => get<Transaction[]>("/api/transactions", params),
  update: (id: string, data: object) => patch<Transaction>(`/api/transactions/${id}`, data),
  summary: (startDate: string, endDate: string) =>
    get<SpendingSummary>("/api/transactions/summary", { start_date: startDate, end_date: endDate }),
};

export const budgetsApi = {
  list: () => get<Budget[]>("/api/budgets"),
  create: (data: object) => post<Budget>("/api/budgets", data),
  progress: (id: string) => get<BudgetProgress>(`/api/budgets/${id}/progress`),
  delete: (id: string) => del(`/api/budgets/${id}`),
};

export const goalsApi = {
  list: () => get<Goal[]>("/api/goals"),
  create: (data: object) => post<Goal>("/api/goals", data),
  update: (id: string, data: object) => patch<Goal>(`/api/goals/${id}`, data),
  contribute: (id: string, data: object) => post<Goal>(`/api/goals/${id}/contribute`, data),
};

export const insightsApi = {
  list: (params?: Params) => get<Insight[]>("/api/insights", params),
  action: (id: string, action: string) => post<void>(`/api/insights/${id}/action`, { action }),
  generate: () => post<void>("/api/insights/generate"),
};

export const chatApi = {
  threads: () => get<ChatThread[]>("/api/chat/threads"),
  thread: (id: string) => get<ChatThread>(`/api/chat/threads/${id}`),
  sendMessage: (message: string, threadId?: string) =>
    post<{ thread_id: string; message: ChatMessage }>("/api/chat", { message, thread_id: threadId }),
  deleteThread: (id: string) => del(`/api/chat/threads/${id}`),
};

export const etfApi = {
  screen: (params?: Params) => get<ETFSecurity[]>("/api/etf", params),
  featured: () => get<ETFSecurity[]>("/api/etf/featured"),
  detail: (ticker: string) => get<ETFSecurity>(`/api/etf/${ticker}`),
  watchlist: () => get<ETFSecurity[]>("/api/etf/watchlist"),
  addToWatchlist: (ticker: string) => post<void>(`/api/etf/watchlist/${ticker}`),
  removeFromWatchlist: (ticker: string) => del(`/api/etf/watchlist/${ticker}`),
};
