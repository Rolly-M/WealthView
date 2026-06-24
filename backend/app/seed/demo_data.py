"""
Demo seed script. Run once at startup in demo mode.
Creates a complete household with two users, linked accounts, 90 days
of transactions, budgets, goals, insights, and ETF research data.
"""

import asyncio
import random
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.account import Account, Institution
from app.models.budget import Budget, BudgetCategory
from app.models.chat import ChatMessage, ChatThread
from app.models.etf import ETFMetricsSnapshot, ETFSecurity, Watchlist, WatchlistItem
from app.models.goal import Goal, GoalContribution
from app.models.household import Household, HouseholdMember
from app.models.insight import Insight
from app.models.transaction import Transaction
from app.models.user import User


DEMO_PASSWORD = "demo1234!"

TRANSACTIONS_SEED = [
    # (merchant, amount, category, is_income, is_recurring, is_subscription, day_offset)
    ("PAYROLL - ACME CORP", -4200, "income", True, True, False, -1),
    ("PAYROLL - ACME CORP", -4200, "income", True, True, False, -31),
    ("PAYROLL - ACME CORP", -4200, "income", True, True, False, -61),
    ("PAYROLL - TECHCO INC", -3800, "income", True, True, False, -1),
    ("PAYROLL - TECHCO INC", -3800, "income", True, True, False, -31),
    ("PAYROLL - TECHCO INC", -3800, "income", True, True, False, -61),
    ("Rent Transfer", 1850, "housing", False, True, False, -2),
    ("Rent Transfer", 1850, "housing", False, True, False, -32),
    ("Rent Transfer", 1850, "housing", False, True, False, -62),
    ("Netflix", 15.99, "subscription", False, True, True, -5),
    ("Netflix", 15.99, "subscription", False, True, True, -35),
    ("Netflix", 15.99, "subscription", False, True, True, -65),
    ("Spotify", 10.99, "subscription", False, True, True, -5),
    ("Spotify", 10.99, "subscription", False, True, True, -35),
    ("Spotify", 10.99, "subscription", False, True, True, -65),
    ("Amazon Prime", 14.99, "subscription", False, True, True, -7),
    ("Amazon Prime", 14.99, "subscription", False, True, True, -37),
    ("Apple One", 28.95, "subscription", False, True, True, -10),
    ("Whole Foods Market", 142.30, "groceries", False, False, False, -3),
    ("Whole Foods Market", 98.10, "groceries", False, False, False, -10),
    ("Loblaws Superstore", 210.00, "groceries", False, False, False, -17),
    ("Whole Foods Market", 135.40, "groceries", False, False, False, -24),
    ("Metro Grocery", 87.60, "groceries", False, False, False, -33),
    ("Whole Foods Market", 165.20, "groceries", False, False, False, -40),
    ("Costco Wholesale", 245.00, "groceries", False, False, False, -47),
    ("Starbucks", 7.50, "dining", False, False, False, -1),
    ("Starbucks", 6.80, "dining", False, False, False, -4),
    ("Chipotle Mexican Grill", 24.60, "dining", False, False, False, -6),
    ("The Keg Steakhouse", 89.40, "dining", False, False, False, -8),
    ("Sushi Moto", 65.00, "dining", False, False, False, -12),
    ("McDonald's", 14.30, "dining", False, False, False, -15),
    ("DoorDash", 42.50, "dining", False, False, False, -18),
    ("Starbucks", 8.20, "dining", False, False, False, -20),
    ("Uber Eats", 35.80, "dining", False, False, False, -25),
    ("La Paloma Cantina", 78.00, "dining", False, False, False, -30),
    ("Shell Gas Station", 72.00, "transportation", False, False, False, -3),
    ("Shell Gas Station", 68.40, "transportation", False, False, False, -18),
    ("Shell Gas Station", 74.20, "transportation", False, False, False, -33),
    ("Uber", 18.50, "transportation", False, False, False, -7),
    ("Uber", 22.30, "transportation", False, False, False, -14),
    ("GO Transit", 8.00, "transportation", False, False, False, -2),
    ("GO Transit", 8.00, "transportation", False, False, False, -9),
    ("Shoppers Drug Mart", 43.20, "health", False, False, False, -4),
    ("Rexall Pharmacy", 28.90, "health", False, False, False, -20),
    ("Yoga Studio", 60.00, "health", False, True, False, -1),
    ("Yoga Studio", 60.00, "health", False, True, False, -31),
    ("Dr. Smith Dental", 220.00, "health", False, False, False, -45),
    ("HYDRO ONE", 134.00, "utilities", False, True, False, -12),
    ("HYDRO ONE", 128.00, "utilities", False, True, False, -42),
    ("Rogers Wireless", 80.00, "utilities", False, True, False, -5),
    ("Rogers Wireless", 80.00, "utilities", False, True, False, -35),
    ("TD Insurance", 180.00, "insurance", False, True, False, -15),
    ("TD Insurance", 180.00, "insurance", False, True, False, -45),
    ("Life Insurance Co", 85.00, "insurance", False, True, False, -10),
    ("Amazon.ca", 67.99, "shopping", False, False, False, -8),
    ("Indigo Books", 32.00, "shopping", False, False, False, -14),
    ("Apple Store", 1299.00, "shopping", False, False, False, -22),
    ("IKEA", 420.00, "shopping", False, False, False, -55),
    ("H&M", 89.00, "shopping", False, False, False, -28),
    ("Cineplex Odeon", 45.00, "entertainment", False, False, False, -6),
    ("Scotiabank Arena Tickets", 180.00, "entertainment", False, False, False, -20),
    ("Airbnb Stay", 320.00, "travel", False, False, False, -40),
    ("WestJet Airlines", 480.00, "travel", False, False, False, -55),
    ("Questrade Invest", 500.00, "investing", False, False, False, -2),
    ("Questrade Invest", 500.00, "investing", False, False, False, -32),
    ("Emergency Fund", 300.00, "savings", False, True, False, -3),
    ("Emergency Fund", 300.00, "savings", False, True, False, -33),
    ("Emergency Fund", 300.00, "savings", False, True, False, -63),
    ("VISA Payment", -1200.00, "transfer", False, True, False, -8),
    ("VISA Payment", -1200.00, "transfer", False, True, False, -38),
    ("Gift - Mom's Birthday", 75.00, "shopping", False, False, False, -19),
    ("Walmart", 98.40, "shopping", False, False, False, -50),
    ("Tim Hortons", 5.20, "dining", False, False, False, -2),
    ("Tim Hortons", 4.80, "dining", False, False, False, -5),
    ("Petro Canada", 65.00, "transportation", False, False, False, -48),
]

ETF_DATA = [
    {
        "ticker": "VDY",
        "name": "Vanguard FTSE Canadian High Dividend Yield Index ETF",
        "description": "Tracks Canadian equities with above-average dividend yields, weighted by market cap.",
        "exchange": "TSX",
        "currency": "CAD",
        "country": "CA",
        "issuer": "Vanguard",
        "category": "High Dividend",
        "focus": "Canadian Equity Income",
        "tags": ["featured", "high-dividend", "canada"],
        "metrics": {
            "price": Decimal("43.28"),
            "aum_millions": Decimal("3200.00"),
            "expense_ratio": Decimal("0.0022"),
            "dividend_yield": Decimal("0.0458"),
            "dividend_yield_ttm": Decimal("0.0462"),
            "dividend_growth_1y": Decimal("0.068"),
            "dividend_growth_3y": Decimal("0.045"),
            "dividend_growth_5y": Decimal("0.038"),
            "return_1y": Decimal("0.112"),
            "return_3y_annualized": Decimal("0.098"),
            "return_5y_annualized": Decimal("0.082"),
            "volatility_1y": Decimal("0.112"),
            "sharpe_ratio_1y": Decimal("1.21"),
            "beta": Decimal("0.78"),
            "pe_ratio": Decimal("13.4"),
            "pb_ratio": Decimal("1.8"),
            "holdings_count": 42,
            "top_holdings": [
                {"name": "Royal Bank of Canada", "weight": 0.142},
                {"name": "Toronto-Dominion Bank", "weight": 0.128},
                {"name": "Enbridge Inc.", "weight": 0.089},
                {"name": "BCE Inc.", "weight": 0.071},
                {"name": "Canadian Natural Resources", "weight": 0.065},
            ],
            "sector_allocation": {"Financials": 58.2, "Energy": 22.1, "Utilities": 9.8, "Telecom": 7.4, "Other": 2.5},
            "geographic_allocation": {"Canada": 99.8, "Other": 0.2},
            "why_featured": "VDY offers one of the highest yields in the Canadian ETF market with a low expense ratio and strong dividend growth history from Canada's largest financial institutions.",
            "research_notes": "Strong candidate for income-seeking investors. Heavy financials concentration (58%) means correlation with Canadian real estate and interest rate sensitivity.",
            "distribution_history": [
                {"month": "2026-05", "amount": 0.165},
                {"month": "2026-04", "amount": 0.161},
                {"month": "2026-03", "amount": 0.158},
                {"month": "2026-02", "amount": 0.155},
            ],
        },
    },
    {
        "ticker": "SCHD",
        "name": "Schwab US Dividend Equity ETF",
        "description": "Tracks US equities with strong dividend growth records, quality screens, and sustainable payout ratios.",
        "exchange": "NYSE Arca",
        "currency": "USD",
        "country": "US",
        "issuer": "Charles Schwab",
        "category": "Dividend Growth",
        "focus": "US Equity Income + Growth",
        "tags": ["featured", "dividend-growth", "quality", "usa"],
        "metrics": {
            "price": Decimal("26.84"),
            "aum_millions": Decimal("57800.00"),
            "expense_ratio": Decimal("0.0006"),
            "dividend_yield": Decimal("0.0342"),
            "dividend_yield_ttm": Decimal("0.0348"),
            "dividend_growth_1y": Decimal("0.112"),
            "dividend_growth_3y": Decimal("0.098"),
            "dividend_growth_5y": Decimal("0.112"),
            "return_1y": Decimal("0.148"),
            "return_3y_annualized": Decimal("0.108"),
            "return_5y_annualized": Decimal("0.121"),
            "volatility_1y": Decimal("0.128"),
            "sharpe_ratio_1y": Decimal("1.34"),
            "beta": Decimal("0.82"),
            "pe_ratio": Decimal("16.2"),
            "pb_ratio": Decimal("2.4"),
            "holdings_count": 100,
            "top_holdings": [
                {"name": "Home Depot", "weight": 0.042},
                {"name": "Chevron", "weight": 0.041},
                {"name": "AbbVie", "weight": 0.041},
                {"name": "Coca-Cola", "weight": 0.040},
                {"name": "Cisco Systems", "weight": 0.039},
            ],
            "sector_allocation": {"Financials": 18.2, "Healthcare": 15.8, "Industrials": 14.6, "Energy": 13.2, "Consumer Staples": 12.4, "Technology": 11.8, "Other": 14.0},
            "geographic_allocation": {"United States": 99.5, "Other": 0.5},
            "why_featured": "SCHD is widely considered the gold standard dividend growth ETF. Ultra-low 0.06% expense ratio, rigorous quality screens, and 10+ years of consistent dividend growth make it a core holding.",
            "research_notes": "Exceptional 5-year dividend growth of 11.2% CAGR. Quality screen filters out high-payout-ratio traps. One of the best risk-adjusted income ETFs available.",
            "distribution_history": [
                {"month": "2026-05", "amount": 0.2318},
                {"month": "2026-04", "amount": 0.2285},
                {"month": "2026-03", "amount": 0.2246},
                {"month": "2026-02", "amount": 0.2210},
            ],
        },
    },
    {
        "ticker": "DVY",
        "name": "iShares Select Dividend ETF",
        "description": "Tracks US stocks with high dividend yields, screened for payout ratio and dividend growth consistency.",
        "exchange": "NASDAQ",
        "currency": "USD",
        "country": "US",
        "issuer": "BlackRock",
        "category": "High Dividend",
        "focus": "US High Yield",
        "tags": ["featured", "high-dividend", "usa"],
        "metrics": {
            "price": Decimal("118.42"),
            "aum_millions": Decimal("14200.00"),
            "expense_ratio": Decimal("0.0038"),
            "dividend_yield": Decimal("0.0490"),
            "dividend_yield_ttm": Decimal("0.0496"),
            "dividend_growth_1y": Decimal("0.032"),
            "dividend_growth_3y": Decimal("0.028"),
            "dividend_growth_5y": Decimal("0.024"),
            "return_1y": Decimal("0.092"),
            "return_3y_annualized": Decimal("0.074"),
            "return_5y_annualized": Decimal("0.068"),
            "volatility_1y": Decimal("0.148"),
            "sharpe_ratio_1y": Decimal("0.98"),
            "beta": Decimal("0.88"),
            "pe_ratio": Decimal("14.8"),
            "pb_ratio": Decimal("2.1"),
            "holdings_count": 100,
            "top_holdings": [
                {"name": "Altria Group", "weight": 0.034},
                {"name": "AT&T", "weight": 0.032},
                {"name": "Verizon", "weight": 0.031},
                {"name": "LyondellBasell", "weight": 0.028},
            ],
            "sector_allocation": {"Utilities": 25.8, "Financials": 22.4, "Energy": 18.6, "Consumer Staples": 12.2, "Communication": 11.8, "Other": 9.2},
            "geographic_allocation": {"United States": 99.8, "Other": 0.2},
            "why_featured": "DVY provides one of the highest yields in US equity ETFs. Ideal for income-focused investors willing to accept slightly higher volatility for current income.",
            "research_notes": "High utilities/energy weighting means interest-rate sensitivity. Consider pairing with a dividend growth ETF like SCHD for a barbell approach.",
            "distribution_history": [
                {"month": "2026-05", "amount": 1.428},
                {"month": "2026-04", "amount": 1.385},
                {"month": "2026-03", "amount": 1.342},
            ],
        },
    },
    {
        "ticker": "VIG",
        "name": "Vanguard Dividend Appreciation ETF",
        "description": "Tracks US stocks with a minimum 10 consecutive years of dividend increases, emphasizing dividend growth over current yield.",
        "exchange": "NYSE Arca",
        "currency": "USD",
        "country": "US",
        "issuer": "Vanguard",
        "category": "Dividend Growth",
        "focus": "US Dividend Aristocrats",
        "tags": ["featured", "dividend-growth", "quality", "aristocrats"],
        "metrics": {
            "price": Decimal("188.64"),
            "aum_millions": Decimal("79200.00"),
            "expense_ratio": Decimal("0.0006"),
            "dividend_yield": Decimal("0.0178"),
            "dividend_yield_ttm": Decimal("0.0181"),
            "dividend_growth_1y": Decimal("0.092"),
            "dividend_growth_3y": Decimal("0.082"),
            "dividend_growth_5y": Decimal("0.088"),
            "return_1y": Decimal("0.182"),
            "return_3y_annualized": Decimal("0.128"),
            "return_5y_annualized": Decimal("0.142"),
            "volatility_1y": Decimal("0.118"),
            "sharpe_ratio_1y": Decimal("1.68"),
            "beta": Decimal("0.78"),
            "pe_ratio": Decimal("22.8"),
            "pb_ratio": Decimal("4.2"),
            "holdings_count": 315,
            "top_holdings": [
                {"name": "Microsoft", "weight": 0.048},
                {"name": "Apple Inc.", "weight": 0.042},
                {"name": "Broadcom", "weight": 0.035},
                {"name": "JPMorgan Chase", "weight": 0.032},
                {"name": "UnitedHealth Group", "weight": 0.030},
            ],
            "sector_allocation": {"Technology": 22.8, "Healthcare": 18.4, "Financials": 15.6, "Industrials": 14.2, "Consumer Staples": 10.8, "Other": 18.2},
            "geographic_allocation": {"United States": 99.2, "Other": 0.8},
            "why_featured": "VIG prioritizes dividend growth over current yield — ideal for building wealth over time. The 10-year consecutive increase requirement filters for financially strong, durable businesses.",
            "research_notes": "Lower current yield (1.8%) but higher total return potential. Best suited as a long-term core holding. The 10-year dividend streak requirement acts as a quality moat filter.",
            "distribution_history": [
                {"month": "2026-05", "amount": 0.838},
                {"month": "2026-04", "amount": 0.812},
                {"month": "2026-03", "amount": 0.798},
            ],
        },
    },
    {
        "ticker": "XDIV.TO",
        "name": "iShares Core MSCI Canadian Quality Dividend Index ETF",
        "description": "Provides exposure to high-quality Canadian dividend-paying equities with growth characteristics.",
        "exchange": "TSX",
        "currency": "CAD",
        "country": "CA",
        "issuer": "BlackRock",
        "category": "Dividend Growth",
        "focus": "Canadian Equity Quality Dividend",
        "tags": ["featured", "high-dividend", "canada", "quality"],
        "metrics": {
            "price": Decimal("25.14"),
            "aum_millions": Decimal("1840.00"),
            "expense_ratio": Decimal("0.0011"),
            "dividend_yield": Decimal("0.0428"),
            "dividend_yield_ttm": Decimal("0.0432"),
            "dividend_growth_1y": Decimal("0.058"),
            "dividend_growth_3y": Decimal("0.048"),
            "dividend_growth_5y": Decimal("0.044"),
            "return_1y": Decimal("0.122"),
            "return_3y_annualized": Decimal("0.104"),
            "return_5y_annualized": Decimal("0.095"),
            "volatility_1y": Decimal("0.108"),
            "sharpe_ratio_1y": Decimal("1.32"),
            "beta": Decimal("0.74"),
            "pe_ratio": Decimal("14.2"),
            "pb_ratio": Decimal("1.9"),
            "holdings_count": 25,
            "top_holdings": [
                {"name": "Royal Bank of Canada", "weight": 0.088},
                {"name": "Canadian National Railway", "weight": 0.082},
                {"name": "Toronto-Dominion Bank", "weight": 0.078},
                {"name": "Brookfield Asset Management", "weight": 0.072},
                {"name": "Alimentation Couche-Tard", "weight": 0.065},
            ],
            "sector_allocation": {"Financials": 42.8, "Industrials": 18.6, "Energy": 16.4, "Consumer Staples": 12.2, "Other": 10.0},
            "geographic_allocation": {"Canada": 99.5, "Other": 0.5},
            "why_featured": "XDIV.TO applies quality screens (ROE, debt-to-equity) to Canadian high-dividend stocks. Lower expense ratio than peers, monthly distributions, and strong dividend growth history.",
            "research_notes": "Monthly distributions make it attractive for cash flow planning. Quality screen reduces exposure to dividend traps common in pure-yield focused indexes.",
            "distribution_history": [
                {"month": "2026-05", "amount": 0.0895},
                {"month": "2026-04", "amount": 0.0880},
                {"month": "2026-03", "amount": 0.0872},
            ],
        },
    },
]


async def seed_demo_data():
    async with AsyncSessionLocal() as db:
        # Check if already seeded
        existing = await db.execute(select(User).where(User.email == "alex@demo.wealthviewduo.com"))
        if existing.scalar_one_or_none():
            print("Demo data already seeded, skipping.")
            return

        print("Seeding demo data...")

        # ── Users ──────────────────────────────────────────────────────────
        alex = User(
            email="alex@demo.wealthviewduo.com",
            hashed_password=hash_password(DEMO_PASSWORD),
            full_name="Alex Johnson",
            is_verified=True,
            currency="USD",
        )
        jordan = User(
            email="jordan@demo.wealthviewduo.com",
            hashed_password=hash_password(DEMO_PASSWORD),
            full_name="Jordan Johnson",
            is_verified=True,
            currency="USD",
        )
        db.add(alex)
        db.add(jordan)
        await db.flush()

        # ── Household ──────────────────────────────────────────────────────
        household = Household(name="Johnson Household", currency="USD", country="US")
        db.add(household)
        await db.flush()

        db.add(HouseholdMember(household_id=household.id, user_id=alex.id, role="owner", nickname="Alex"))
        db.add(HouseholdMember(household_id=household.id, user_id=jordan.id, role="editor", nickname="Jordan"))
        await db.flush()

        # ── Institutions ──────────────────────────────────────────────────
        td = Institution(provider_id="mock_td", name="TD Bank", primary_color="#2ecc71", country="US", provider="mock")
        chase = Institution(provider_id="mock_chase", name="Chase", primary_color="#117ACA", country="US", provider="mock")
        db.add(td)
        db.add(chase)
        await db.flush()

        # ── Accounts ──────────────────────────────────────────────────────
        checking = Account(
            household_id=household.id, owner_id=alex.id, institution_id=td.id,
            provider="mock", provider_account_id="mock_acc_chk_001",
            name="Joint Checking", type="checking", subtype="checking",
            currency="USD", current_balance=Decimal("4850.22"),
            available_balance=Decimal("4830.00"), is_shared=True,
        )
        savings = Account(
            household_id=household.id, owner_id=alex.id, institution_id=td.id,
            provider="mock", provider_account_id="mock_acc_sav_001",
            name="High-Interest Savings", type="savings", subtype="savings",
            currency="USD", current_balance=Decimal("18450.00"),
            available_balance=Decimal("18450.00"), is_shared=True,
        )
        credit = Account(
            household_id=household.id, owner_id=jordan.id, institution_id=chase.id,
            provider="mock", provider_account_id="mock_acc_cc_001",
            name="Cashback Visa", type="credit", subtype="credit card",
            currency="USD", current_balance=Decimal("-1234.56"),
            available_balance=Decimal("8765.44"), credit_limit=Decimal("10000.00"),
            is_shared=True,
        )
        jordan_savings = Account(
            household_id=household.id, owner_id=jordan.id, institution_id=chase.id,
            provider="mock", provider_account_id="mock_acc_jsav_001",
            name="Jordan's Savings (Private)", type="savings", subtype="savings",
            currency="USD", current_balance=Decimal("5200.00"),
            is_shared=False,
        )
        db.add(checking)
        db.add(savings)
        db.add(credit)
        db.add(jordan_savings)
        await db.flush()

        # ── Transactions ───────────────────────────────────────────────────
        today = date.today()
        accounts_cycle = [checking, checking, credit, checking]
        for i, (merchant, amount, category, is_income, is_recurring, is_sub, day_offset) in enumerate(TRANSACTIONS_SEED):
            txn_date = today + timedelta(days=day_offset)
            account = accounts_cycle[i % len(accounts_cycle)]
            txn = Transaction(
                account_id=account.id,
                household_id=household.id,
                provider_transaction_id=f"demo_txn_{uuid.uuid4().hex}",
                amount=Decimal(str(amount)),
                currency="USD",
                date=txn_date,
                merchant_name=merchant,
                merchant_normalized=merchant,
                description=merchant,
                category=category,
                category_confidence=0.92 if not is_income else 0.98,
                category_source="ml",
                category_explanation=f"Auto-classified as {category} based on merchant pattern",
                is_income=is_income,
                is_recurring=is_recurring,
                is_subscription=is_sub,
                is_transfer=category == "transfer",
                is_pending=False,
            )
            db.add(txn)

        await db.flush()

        # ── Budgets ────────────────────────────────────────────────────────
        budget = Budget(
            household_id=household.id,
            created_by_id=alex.id,
            name="Monthly Household Budget",
            period="monthly",
            scope="household",
            month=today.month,
            year=today.year,
            total_amount=Decimal("6000.00"),
        )
        db.add(budget)
        await db.flush()

        budget_cats = [
            ("housing", Decimal("1900.00")),
            ("groceries", Decimal("600.00")),
            ("dining", Decimal("400.00")),
            ("transportation", Decimal("350.00")),
            ("utilities", Decimal("250.00")),
            ("subscription", Decimal("100.00")),
            ("health", Decimal("200.00")),
            ("entertainment", Decimal("150.00")),
            ("shopping", Decimal("500.00")),
            ("insurance", Decimal("300.00")),
            ("investing", Decimal("500.00")),
            ("savings", Decimal("300.00")),
            ("miscellaneous", Decimal("150.00")),
        ]
        for cat, amt in budget_cats:
            db.add(BudgetCategory(budget_id=budget.id, category=cat, amount=amt))

        # ── Goals ─────────────────────────────────────────────────────────
        emergency_goal = Goal(
            household_id=household.id,
            created_by_id=alex.id,
            name="Emergency Fund",
            description="6 months of expenses as safety net",
            type="emergency_fund",
            target_amount=Decimal("25000.00"),
            current_amount=Decimal("15500.00"),
            monthly_contribution=Decimal("600.00"),
            target_date=date(today.year + 1, 6, 1),
            emoji="🛡️",
            color="#10b981",
            scope="household",
        )
        vacation_goal = Goal(
            household_id=household.id,
            created_by_id=jordan.id,
            name="Italy Trip 2027",
            description="Two weeks in Rome and Tuscany",
            type="vacation",
            target_amount=Decimal("8000.00"),
            current_amount=Decimal("2400.00"),
            monthly_contribution=Decimal("400.00"),
            target_date=date(2027, 6, 15),
            emoji="🇮🇹",
            color="#6366f1",
            scope="household",
        )
        home_goal = Goal(
            household_id=household.id,
            created_by_id=alex.id,
            name="Home Down Payment",
            description="Save for 20% down on our first home",
            type="home_purchase",
            target_amount=Decimal("120000.00"),
            current_amount=Decimal("34500.00"),
            monthly_contribution=Decimal("1200.00"),
            target_date=date(today.year + 3, 1, 1),
            emoji="🏡",
            color="#f59e0b",
            scope="household",
        )
        db.add(emergency_goal)
        db.add(vacation_goal)
        db.add(home_goal)
        await db.flush()

        # ── Insights ───────────────────────────────────────────────────────
        insights = [
            Insight(
                household_id=household.id,
                type="spending_spike",
                title="Dining spending up 22% this month",
                body="You've spent $312 on dining so far this month, compared to $256 last month — a 22% increase. The Keg, Uber Eats, and DoorDash account for most of the difference.",
                severity="warning",
                category="dining",
                amount=312.0,
                amount_change=56.0,
                pct_change=21.9,
            ),
            Insight(
                household_id=household.id,
                type="subscription_alert",
                title="4 active subscriptions detected",
                body="We found 4 recurring subscriptions totalling $70.92/month. Netflix ($15.99), Spotify ($10.99), Amazon Prime ($14.99), Apple One ($28.95). Review any you no longer use.",
                severity="info",
                amount=70.92,
            ),
            Insight(
                household_id=household.id,
                type="goal_progress",
                title="Emergency fund at 62% of target",
                body="Your emergency fund has reached $15,500 of your $25,000 goal — 62% complete. At your current rate of $600/month, you'll hit your target in about 15 months.",
                severity="positive",
                amount=15500.0,
                pct_change=62.0,
            ),
            Insight(
                household_id=household.id,
                type="cash_flow",
                title="Savings rate: 19.8% this month",
                body="You've saved approximately $1,586 of your combined $8,000 income this month (19.8%). You're close to the 20% target — great work!",
                severity="info",
                amount=1586.0,
                pct_change=19.8,
            ),
            Insight(
                household_id=household.id,
                type="category_trend",
                title="Groceries down 8% vs last month",
                body="Grocery spending dropped from $451 to $416 this month — a positive trend. Your Costco trip helped drive down per-unit costs.",
                severity="positive",
                category="groceries",
                amount=416.0,
                pct_change=-8.0,
            ),
            Insight(
                household_id=household.id,
                type="anomaly",
                title="Unusual transaction: Apple Store $1,299",
                body="An Apple Store purchase of $1,299 on the 8th appears larger than your typical electronics spending. This has been categorized as Shopping.",
                severity="warning",
                amount=1299.0,
            ),
        ]
        for ins in insights:
            db.add(ins)
        await db.flush()

        # ── Chat thread ────────────────────────────────────────────────────
        thread = ChatThread(
            household_id=household.id,
            user_id=alex.id,
            title="How are we doing this month?",
            scope="household",
        )
        db.add(thread)
        await db.flush()

        db.add(ChatMessage(
            thread_id=thread.id, role="user",
            content="What did we spend the most on this month?",
        ))
        db.add(ChatMessage(
            thread_id=thread.id, role="assistant",
            content=(
                "Here's your spending breakdown for this month:\n\n"
                "- Housing: $1,850.00\n"
                "- Groceries: $416.40\n"
                "- Dining: $312.10\n"
                "- Shopping: $220.99\n"
                "- Transportation: $164.40\n\n"
                "Total spending: $3,824.32\n\n"
                "Housing is your largest expense by far, as expected. Dining is tracking 22% higher than last month — mainly from restaurant visits and food delivery."
            ),
            suggested_followups=[
                "How does dining compare to last month?",
                "How much did we save?",
                "Which subscriptions can we cut?",
            ],
        ))

        # ── ETF Securities ─────────────────────────────────────────────────
        today_date = date.today()
        watchlist = Watchlist(user_id=alex.id, name="My Income ETF Watchlist")
        db.add(watchlist)
        await db.flush()

        for etf in ETF_DATA:
            metrics = etf.pop("metrics")
            security = ETFSecurity(**etf)
            db.add(security)
            await db.flush()

            snapshot = ETFMetricsSnapshot(
                security_id=security.id,
                as_of_date=today_date,
                **metrics,
            )
            db.add(snapshot)

            # First two go to watchlist
            if etf["ticker"] in ("SCHD", "VDY"):
                db.add(WatchlistItem(watchlist_id=watchlist.id, security_id=security.id))

        await db.commit()
        print("✓ Demo data seeded successfully.")
        print(f"  Demo login: alex@demo.wealthviewduo.com / {DEMO_PASSWORD}")
        print(f"  Demo login: jordan@demo.wealthviewduo.com / {DEMO_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(seed_demo_data())
