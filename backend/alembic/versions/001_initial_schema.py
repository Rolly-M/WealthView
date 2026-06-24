"""Initial schema

Revision ID: 001
Revises:
Create Date: 2026-06-24
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Enums ──────────────────────────────────────────────────────────────
    op.execute("CREATE TYPE member_role AS ENUM ('owner', 'editor', 'viewer')")
    op.execute("CREATE TYPE invitation_role AS ENUM ('owner', 'editor', 'viewer')")
    op.execute("CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'declined', 'expired')")
    op.execute("CREATE TYPE account_type AS ENUM ('checking', 'savings', 'credit', 'investment', 'loan', 'mortgage', 'other')")
    op.execute("CREATE TYPE sync_status AS ENUM ('pending', 'running', 'success', 'failed')")
    op.execute("CREATE TYPE category_source AS ENUM ('rule', 'ml', 'user', 'provider')")
    op.execute("CREATE TYPE rule_match_field AS ENUM ('merchant_name', 'description', 'amount')")
    op.execute("CREATE TYPE rule_operator AS ENUM ('contains', 'equals', 'starts_with', 'ends_with', 'greater_than', 'less_than')")
    op.execute("CREATE TYPE budget_period AS ENUM ('monthly', 'weekly', 'annual')")
    op.execute("CREATE TYPE budget_scope AS ENUM ('household', 'personal')")
    op.execute("CREATE TYPE goal_type AS ENUM ('savings', 'debt_payoff', 'emergency_fund', 'vacation', 'home_purchase', 'wedding', 'education', 'retirement', 'other')")
    op.execute("CREATE TYPE goal_scope AS ENUM ('household', 'personal')")
    op.execute("CREATE TYPE goal_status AS ENUM ('active', 'completed', 'paused', 'cancelled')")
    op.execute("""CREATE TYPE insight_type AS ENUM (
        'spending_spike', 'savings_drop', 'subscription_alert', 'budget_alert',
        'goal_progress', 'anomaly', 'cash_flow', 'category_trend',
        'net_worth_change', 'recurring_detected', 'income_change', 'health_score'
    )""")
    op.execute("CREATE TYPE insight_severity AS ENUM ('info', 'warning', 'positive', 'critical')")
    op.execute("CREATE TYPE chat_scope AS ENUM ('personal', 'household')")
    op.execute("CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system')")

    # ── users ──────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True, index=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("avatar_url", sa.String(512)),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("mfa_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("mfa_secret", sa.String(255)),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("locale", sa.String(10), nullable=False, server_default="en-US"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("last_login_at", sa.DateTime(timezone=True)),
    )

    # ── refresh_tokens ─────────────────────────────────────────────────────
    op.create_table(
        "refresh_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(255), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("user_agent", sa.Text()),
        sa.Column("ip_address", sa.String(45)),
    )

    # ── households ────────────────────────────────────────────────────────
    op.create_table(
        "households",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("country", sa.String(2), nullable=False, server_default="US"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── household_members ────────────────────────────────────────────────
    op.create_table(
        "household_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("household_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("households.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.Enum("owner", "editor", "viewer", name="member_role"), nullable=False, server_default="editor"),
        sa.Column("nickname", sa.String(100)),
        sa.Column("share_all_accounts", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── invitations ───────────────────────────────────────────────────────
    op.create_table(
        "invitations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("household_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("households.id", ondelete="CASCADE"), nullable=False),
        sa.Column("inviter_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("role", sa.Enum("owner", "editor", "viewer", name="invitation_role"), nullable=False, server_default="editor"),
        sa.Column("token", sa.String(512), nullable=False, unique=True),
        sa.Column("status", sa.Enum("pending", "accepted", "declined", "expired", name="invitation_status"), nullable=False, server_default="pending"),
        sa.Column("message", sa.Text()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("accepted_at", sa.DateTime(timezone=True)),
    )

    # ── institutions ──────────────────────────────────────────────────────
    op.create_table(
        "institutions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("provider_id", sa.String(255), nullable=False, unique=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("logo_url", sa.String(512)),
        sa.Column("primary_color", sa.String(7)),
        sa.Column("country", sa.String(2), nullable=False, server_default="US"),
        sa.Column("provider", sa.String(50), nullable=False, server_default="mock"),
    )

    # ── accounts ──────────────────────────────────────────────────────────
    op.create_table(
        "accounts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("household_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("households.id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("institution_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("institutions.id")),
        sa.Column("provider", sa.String(50), nullable=False, server_default="mock"),
        sa.Column("provider_account_id", sa.String(255), nullable=False),
        sa.Column("provider_access_token", sa.Text()),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("official_name", sa.String(255)),
        sa.Column("type", sa.Enum("checking", "savings", "credit", "investment", "loan", "mortgage", "other", name="account_type"), nullable=False),
        sa.Column("subtype", sa.String(100)),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("current_balance", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("available_balance", sa.Numeric(14, 2)),
        sa.Column("credit_limit", sa.Numeric(14, 2)),
        sa.Column("is_shared", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("include_in_net_worth", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("last_synced_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── sync_jobs ─────────────────────────────────────────────────────────
    op.create_table(
        "sync_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.Enum("pending", "running", "success", "failed", name="sync_status"), nullable=False, server_default="pending"),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("transactions_added", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("transactions_updated", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── transactions ──────────────────────────────────────────────────────
    op.create_table(
        "transactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("household_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("households.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider_transaction_id", sa.String(255), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("date", sa.Date(), nullable=False, index=True),
        sa.Column("merchant_name", sa.String(255)),
        sa.Column("merchant_normalized", sa.String(255)),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("category", sa.String(50), nullable=False, server_default="miscellaneous", index=True),
        sa.Column("category_confidence", sa.Float(), nullable=False, server_default="0"),
        sa.Column("category_source", sa.Enum("rule", "ml", "user", "provider", name="category_source"), nullable=False, server_default="ml"),
        sa.Column("category_explanation", sa.Text()),
        sa.Column("is_pending", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_transfer", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_recurring", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_subscription", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_income", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_hidden", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("notes", sa.Text()),
        sa.Column("tags", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("metadata", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── transaction_rules ─────────────────────────────────────────────────
    op.create_table(
        "transaction_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("household_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("households.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("match_field", sa.Enum("merchant_name", "description", "amount", name="rule_match_field"), nullable=False),
        sa.Column("match_operator", sa.Enum("contains", "equals", "starts_with", "ends_with", "greater_than", "less_than", name="rule_operator"), nullable=False),
        sa.Column("match_value", sa.String(255), nullable=False),
        sa.Column("set_category", sa.String(50)),
        sa.Column("set_recurring", sa.Boolean()),
        sa.Column("set_hidden", sa.Boolean()),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── budgets ───────────────────────────────────────────────────────────
    op.create_table(
        "budgets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("household_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("households.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("period", sa.Enum("monthly", "weekly", "annual", name="budget_period"), nullable=False, server_default="monthly"),
        sa.Column("scope", sa.Enum("household", "personal", name="budget_scope"), nullable=False, server_default="household"),
        sa.Column("month", sa.Integer()),
        sa.Column("year", sa.Integer()),
        sa.Column("total_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("rollover", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── budget_categories ────────────────────────────────────────────────
    op.create_table(
        "budget_categories",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("budget_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("budgets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("rollover", sa.Boolean(), nullable=False, server_default="false"),
    )

    # ── goals ─────────────────────────────────────────────────────────────
    op.create_table(
        "goals",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("household_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("households.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("type", sa.Enum("savings", "debt_payoff", "emergency_fund", "vacation", "home_purchase", "wedding", "education", "retirement", "other", name="goal_type"), nullable=False),
        sa.Column("target_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("current_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("monthly_contribution", sa.Numeric(14, 2)),
        sa.Column("target_date", sa.Date()),
        sa.Column("emoji", sa.String(10)),
        sa.Column("color", sa.String(7)),
        sa.Column("scope", sa.Enum("household", "personal", name="goal_scope"), nullable=False, server_default="household"),
        sa.Column("status", sa.Enum("active", "completed", "paused", "cancelled", name="goal_status"), nullable=False, server_default="active"),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── goal_contributions ────────────────────────────────────────────────
    op.create_table(
        "goal_contributions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("goal_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("goals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("transaction_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("transactions.id")),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("contributed_at", sa.Date(), nullable=False),
        sa.Column("note", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── insights ──────────────────────────────────────────────────────────
    op.create_table(
        "insights",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("household_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("households.id", ondelete="CASCADE"), nullable=False),
        sa.Column("type", sa.Enum(
            "spending_spike", "savings_drop", "subscription_alert", "budget_alert",
            "goal_progress", "anomaly", "cash_flow", "category_trend",
            "net_worth_change", "recurring_detected", "income_change", "health_score",
            name="insight_type"
        ), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("severity", sa.Enum("info", "warning", "positive", "critical", name="insight_severity"), nullable=False, server_default="info"),
        sa.Column("category", sa.String(50)),
        sa.Column("period_start", sa.DateTime(timezone=True)),
        sa.Column("period_end", sa.DateTime(timezone=True)),
        sa.Column("amount", sa.Float()),
        sa.Column("amount_change", sa.Float()),
        sa.Column("pct_change", sa.Float()),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_dismissed", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_saved", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("metadata", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
    )

    # ── chat_threads ──────────────────────────────────────────────────────
    op.create_table(
        "chat_threads",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("household_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("households.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(255)),
        sa.Column("scope", sa.Enum("personal", "household", name="chat_scope"), nullable=False, server_default="household"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── chat_messages ─────────────────────────────────────────────────────
    op.create_table(
        "chat_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("thread_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("chat_threads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.Enum("user", "assistant", "system", name="message_role"), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("sources", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("suggested_followups", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("metadata", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── etf_securities ────────────────────────────────────────────────────
    op.create_table(
        "etf_securities",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("ticker", sa.String(20), nullable=False, unique=True, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("exchange", sa.String(50)),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("country", sa.String(2), nullable=False, server_default="US"),
        sa.Column("issuer", sa.String(100)),
        sa.Column("category", sa.String(100)),
        sa.Column("focus", sa.String(100)),
        sa.Column("tags", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("data_source", sa.String(50), nullable=False, server_default="mock"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── etf_metrics_snapshots ─────────────────────────────────────────────
    op.create_table(
        "etf_metrics_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("security_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("etf_securities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("as_of_date", sa.Date(), nullable=False),
        sa.Column("price", sa.Numeric(12, 4)),
        sa.Column("nav", sa.Numeric(12, 4)),
        sa.Column("aum_millions", sa.Numeric(12, 2)),
        sa.Column("expense_ratio", sa.Numeric(6, 4)),
        sa.Column("dividend_yield", sa.Numeric(6, 4)),
        sa.Column("dividend_yield_ttm", sa.Numeric(6, 4)),
        sa.Column("dividend_growth_1y", sa.Numeric(6, 4)),
        sa.Column("dividend_growth_3y", sa.Numeric(6, 4)),
        sa.Column("dividend_growth_5y", sa.Numeric(6, 4)),
        sa.Column("return_1m", sa.Numeric(8, 4)),
        sa.Column("return_3m", sa.Numeric(8, 4)),
        sa.Column("return_ytd", sa.Numeric(8, 4)),
        sa.Column("return_1y", sa.Numeric(8, 4)),
        sa.Column("return_3y_annualized", sa.Numeric(8, 4)),
        sa.Column("return_5y_annualized", sa.Numeric(8, 4)),
        sa.Column("volatility_1y", sa.Numeric(8, 4)),
        sa.Column("sharpe_ratio_1y", sa.Numeric(8, 4)),
        sa.Column("beta", sa.Numeric(8, 4)),
        sa.Column("pe_ratio", sa.Numeric(10, 2)),
        sa.Column("pb_ratio", sa.Numeric(10, 2)),
        sa.Column("holdings_count", sa.Integer()),
        sa.Column("top_holdings", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("sector_allocation", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("geographic_allocation", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("distribution_history", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("why_featured", sa.Text()),
        sa.Column("research_notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── watchlists ────────────────────────────────────────────────────────
    op.create_table(
        "watchlists",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False, server_default="My Watchlist"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── watchlist_items ───────────────────────────────────────────────────
    op.create_table(
        "watchlist_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("watchlist_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("watchlists.id", ondelete="CASCADE"), nullable=False),
        sa.Column("security_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("etf_securities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("notes", sa.Text()),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── audit_logs ────────────────────────────────────────────────────────
    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("household_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("households.id", ondelete="SET NULL")),
        sa.Column("action", sa.String(100), nullable=False, index=True),
        sa.Column("resource_type", sa.String(50)),
        sa.Column("resource_id", sa.String(255)),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("ip_address", sa.String(45)),
        sa.Column("user_agent", sa.Text()),
        sa.Column("metadata", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
    )


def downgrade() -> None:
    # Drop tables in reverse dependency order
    for table in [
        "audit_logs", "watchlist_items", "watchlists", "etf_metrics_snapshots",
        "etf_securities", "chat_messages", "chat_threads", "insights",
        "goal_contributions", "goals", "budget_categories", "budgets",
        "transaction_rules", "transactions", "sync_jobs", "accounts",
        "institutions", "invitations", "household_members", "households",
        "refresh_tokens", "users",
    ]:
        op.drop_table(table)

    # Drop enums
    for enum in [
        "member_role", "invitation_role", "invitation_status", "account_type",
        "sync_status", "category_source", "rule_match_field", "rule_operator",
        "budget_period", "budget_scope", "goal_type", "goal_scope", "goal_status",
        "insight_type", "insight_severity", "chat_scope", "message_role",
    ]:
        op.execute(f"DROP TYPE IF EXISTS {enum}")
