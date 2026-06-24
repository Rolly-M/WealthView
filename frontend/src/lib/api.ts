import axios, { type AxiosInstance } from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: `${API_URL}/api/v1`,
    headers: { "Content-Type": "application/json" },
  });

  client.interceptors.request.use((config) => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  client.interceptors.response.use(
    (res) => res,
    async (error) => {
      if (error.response?.status === 401 && typeof window !== "undefined") {
        const refresh = localStorage.getItem("refresh_token");
        if (refresh) {
          try {
            const res = await axios.post(`${API_URL}/api/v1/auth/refresh`, {
              refresh_token: refresh,
            });
            localStorage.setItem("access_token", res.data.access_token);
            localStorage.setItem("refresh_token", res.data.refresh_token);
            error.config.headers.Authorization = `Bearer ${res.data.access_token}`;
            return client.request(error.config);
          } catch {
            localStorage.removeItem("access_token");
            localStorage.removeItem("refresh_token");
            window.location.href = "/login";
          }
        }
      }
      return Promise.reject(error);
    }
  );

  return client;
}

export const api = createApiClient();

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post("/auth/login", { email, password }),
  register: (email: string, password: string, full_name: string) =>
    api.post("/auth/register", { email, password, full_name }),
  demoCredentials: () => axios.get(`${API_URL}/api/v1/demo/credentials`),
};

// Users
export const usersApi = {
  me: () => api.get("/users/me"),
  update: (data: object) => api.patch("/users/me", data),
  changePassword: (data: object) => api.post("/users/me/change-password", data),
};

// Households
export const householdsApi = {
  mine: () => api.get("/households/mine"),
  update: (data: object) => api.patch("/households/mine", data),
  invite: (data: object) => api.post("/households/mine/invite", data),
  previewInvite: (token: string) => api.get(`/households/invite/${token}`),
};

// Accounts
export const accountsApi = {
  list: () => api.get("/accounts"),
  link: (data: object) => api.post("/accounts/link", data),
  update: (id: string, data: object) => api.patch(`/accounts/${id}`, data),
  disconnect: (id: string) => api.delete(`/accounts/${id}`),
  netWorth: () => api.get("/accounts/net-worth"),
};

// Transactions
export const transactionsApi = {
  list: (params?: object) => api.get("/transactions", { params }),
  update: (id: string, data: object) => api.patch(`/transactions/${id}`, data),
  summary: (startDate: string, endDate: string) =>
    api.get("/transactions/summary", { params: { start_date: startDate, end_date: endDate } }),
};

// Budgets
export const budgetsApi = {
  list: () => api.get("/budgets"),
  create: (data: object) => api.post("/budgets", data),
  progress: (id: string) => api.get(`/budgets/${id}/progress`),
  delete: (id: string) => api.delete(`/budgets/${id}`),
};

// Goals
export const goalsApi = {
  list: () => api.get("/goals"),
  create: (data: object) => api.post("/goals", data),
  update: (id: string, data: object) => api.patch(`/goals/${id}`, data),
  contribute: (id: string, data: object) => api.post(`/goals/${id}/contribute`, data),
};

// Insights
export const insightsApi = {
  list: (params?: object) => api.get("/insights", { params }),
  action: (id: string, action: string) => api.post(`/insights/${id}/action`, { action }),
  generate: () => api.post("/insights/generate"),
};

// Chat
export const chatApi = {
  threads: () => api.get("/chat/threads"),
  thread: (id: string) => api.get(`/chat/threads/${id}`),
  sendMessage: (message: string, threadId?: string) =>
    api.post("/chat/message", { message, thread_id: threadId }),
  deleteThread: (id: string) => api.delete(`/chat/threads/${id}`),
};

// ETF
export const etfApi = {
  screen: (params?: object) => api.get("/etf/screen", { params }),
  featured: () => api.get("/etf/featured"),
  detail: (ticker: string) => api.get(`/etf/${ticker}`),
  watchlist: () => api.get("/etf/watchlist/mine"),
  addToWatchlist: (ticker: string) => api.post(`/etf/watchlist/${ticker}`),
  removeFromWatchlist: (ticker: string) => api.delete(`/etf/watchlist/${ticker}`),
};
