export interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  currency: string;
  locale: string;
  is_verified: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface Household {
  id: string;
  name: string;
  currency: string;
  country: string;
  created_at: string;
  members: HouseholdMember[];
  pending_invitations: Invitation[];
}

export interface HouseholdMember {
  id: string;
  user: User;
  role: "owner" | "editor" | "viewer";
  nickname?: string;
  share_all_accounts: boolean;
  joined_at: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: string;
  status: "pending" | "accepted" | "declined" | "expired";
  expires_at: string;
  created_at: string;
}

export interface Institution {
  id: string;
  name: string;
  logo_url?: string;
  primary_color?: string;
  country: string;
}

export interface Account {
  id: string;
  name: string;
  official_name?: string;
  type: "checking" | "savings" | "credit" | "investment" | "loan" | "mortgage" | "other";
  subtype?: string;
  currency: string;
  current_balance: number;
  available_balance?: number;
  credit_limit?: number;
  is_shared: boolean;
  is_active: boolean;
  include_in_net_worth: boolean;
  last_synced_at?: string;
  institution?: Institution;
  owner_id: string;
  provider: string;
}

export interface NetWorthSummary {
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  accounts_by_type: Record<string, Account[]>;
}

export interface Transaction {
  id: string;
  account_id: string;
  amount: number;
  currency: string;
  date: string;
  merchant_name?: string;
  merchant_normalized?: string;
  description: string;
  category: string;
  category_confidence: number;
  category_source: "rule" | "ml" | "user" | "provider";
  category_explanation?: string;
  is_pending: boolean;
  is_transfer: boolean;
  is_recurring: boolean;
  is_subscription: boolean;
  is_income: boolean;
  notes?: string;
  tags: string[];
  created_at: string;
}

export interface SpendingByCategory {
  category: string;
  total: number;
  count: number;
  pct_of_total: number;
}

export interface SpendingSummary {
  period_start: string;
  period_end: string;
  total_spent: number;
  total_income: number;
  savings: number;
  savings_rate: number;
  by_category: SpendingByCategory[];
  transaction_count: number;
}

export interface Budget {
  id: string;
  name: string;
  period: string;
  scope: string;
  month?: number;
  year?: number;
  total_amount: number;
  rollover: boolean;
  is_active: boolean;
  categories: BudgetCategory[];
  created_at: string;
}

export interface BudgetCategory {
  id: string;
  category: string;
  amount: number;
  rollover: boolean;
}

export interface BudgetProgress {
  budget: Budget;
  total_spent: number;
  total_budget: number;
  pct_used: number;
  days_remaining: number;
  projected_overspend?: number;
  categories_progress: CategoryProgress[];
}

export interface CategoryProgress {
  category: string;
  budget: number;
  spent: number;
  pct: number;
}

export interface Goal {
  id: string;
  name: string;
  description?: string;
  type: string;
  target_amount: number;
  current_amount: number;
  monthly_contribution?: number;
  target_date?: string;
  emoji?: string;
  color?: string;
  scope: string;
  status: "active" | "completed" | "paused" | "cancelled";
  progress_pct: number;
  completed_at?: string;
  created_at: string;
}

export interface Insight {
  id: string;
  type: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "positive" | "critical";
  category?: string;
  amount?: number;
  amount_change?: number;
  pct_change?: number;
  is_read: boolean;
  is_dismissed: boolean;
  is_saved: boolean;
  metadata_: Record<string, unknown>;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources: unknown[];
  suggested_followups: string[];
  created_at: string;
}

export interface ChatThread {
  id: string;
  title?: string;
  scope: string;
  created_at: string;
  updated_at: string;
  messages: ChatMessage[];
}

export interface ETFMetrics {
  as_of_date: string;
  price?: number;
  aum_millions?: number;
  expense_ratio?: number;
  dividend_yield?: number;
  dividend_yield_ttm?: number;
  dividend_growth_1y?: number;
  dividend_growth_3y?: number;
  dividend_growth_5y?: number;
  return_1m?: number;
  return_3m?: number;
  return_ytd?: number;
  return_1y?: number;
  return_3y_annualized?: number;
  return_5y_annualized?: number;
  volatility_1y?: number;
  sharpe_ratio_1y?: number;
  beta?: number;
  pe_ratio?: number;
  pb_ratio?: number;
  holdings_count?: number;
  top_holdings: Array<{ name: string; weight: number }>;
  sector_allocation: Record<string, number>;
  geographic_allocation: Record<string, number>;
  distribution_history: Array<{ month: string; amount: number }>;
  why_featured?: string;
  research_notes?: string;
}

export interface ETFSecurity {
  id: string;
  ticker: string;
  name: string;
  description?: string;
  exchange?: string;
  currency: string;
  country: string;
  issuer?: string;
  category?: string;
  focus?: string;
  tags: string[];
  latest_metrics?: ETFMetrics;
}
