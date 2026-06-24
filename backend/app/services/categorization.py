"""
Rule-based + ML-assisted transaction categorization engine.

Priority order:
1. User-defined rules (highest confidence)
2. Keyword/merchant rules
3. Amount-pattern rules
4. Fallback: miscellaneous
"""

import re
from dataclasses import dataclass
from decimal import Decimal


@dataclass
class CategoryResult:
    category: str
    confidence: float
    source: str  # "rule" | "ml" | "provider"
    explanation: str


MERCHANT_RULES: list[tuple[list[str], str, float]] = [
    # (keywords, category, confidence)
    (["salary", "payroll", "direct dep", "adp", "paycheck", "employer"], "income", 0.97),
    (["rent", "mortgage", "property mgmt", "landlord", "lease"], "housing", 0.95),
    (["hydro", "electric", "gas bill", "water bill", "sewage", "utilities"], "utilities", 0.93),
    (["whole foods", "trader joe", "walmart grocery", "kroger", "safeway", "costco food",
      "aldi", "metro grocery", "loblaws", "sobeys", "no frills", "supermarket"], "groceries", 0.93),
    (["mcdonald", "starbucks", "tim horton", "subway restaurant", "pizza hut", "domino",
      "doordash", "uber eats", "grubhub", "skip the dishes", "restaurant", "cafe",
      "dining", "sushi", "burrito", "burger", "taco"], "dining", 0.90),
    (["netflix", "spotify", "apple music", "hulu", "disney+", "amazon prime",
      "youtube premium", "crave", "hbo max", "paramount+"], "subscription", 0.97),
    (["uber", "lyft", "transit", "ttc", "go train", "gas station", "shell", "esso",
      "petro", "bp fuel", "parking", "car wash", "vehicle"], "transportation", 0.88),
    (["insurance", "manulife", "sunlife", "allstate", "state farm", "td insurance"], "insurance", 0.90),
    (["visa payment", "mastercard payment", "credit card payment", "loan payment",
      "debt payment", "student loan"], "debt_payment", 0.95),
    (["transfer", "etransfer", "zelle", "venmo", "interac"], "transfer", 0.97),
    (["savings", "rrsp", "tfsa", "401k", "ira contribution"], "savings", 0.95),
    (["brokerage", "td direct", "questrade", "wealthsimple trade", "robinhood",
      "fidelity", "schwab", "etrade", "invest"], "investing", 0.90),
    (["netflix", "amazon", "apple", "google play", "steam", "entertainment",
      "movies", "concert", "sports ticket"], "entertainment", 0.85),
    (["pharmacy", "shoppers drug", "cvs", "walgreens", "doctor", "clinic", "hospital",
      "dentist", "vision", "health", "medical"], "health", 0.87),
    (["amazon", "ebay", "walmart", "target", "best buy", "winners", "tj maxx",
      "clothing", "fashion", "shoes", "shopping"], "shopping", 0.80),
    (["hotel", "airbnb", "expedia", "booking.com", "flight", "airline", "trip",
      "vacation", "resort"], "travel", 0.87),
    (["tuition", "school", "university", "college", "course", "udemy", "coursera"], "education", 0.88),
    (["salon", "spa", "haircut", "nail", "barber"], "personal_care", 0.85),
]

AMOUNT_RULES: list[tuple[str, Decimal, Decimal, str, float]] = [
    # (operator, min_amount, max_amount, category, confidence)
]


def classify_transaction(
    description: str,
    merchant_name: str | None,
    amount: Decimal,
    provider_category: str | None = None,
) -> CategoryResult:
    text = f"{description} {merchant_name or ''}".lower()

    # User rules checked upstream before this function is called.

    # Keyword matching
    for keywords, category, confidence in MERCHANT_RULES:
        for kw in keywords:
            if kw in text:
                return CategoryResult(
                    category=category,
                    confidence=confidence,
                    source="ml",
                    explanation=f'Matched keyword "{kw}" in merchant/description',
                )

    # Income detection by negative amount (bank convention: credits are negative)
    if amount < 0 and abs(amount) > 100:
        return CategoryResult(
            category="income",
            confidence=0.75,
            source="ml",
            explanation="Large negative amount likely represents income credit",
        )

    # Use provider category if available
    if provider_category:
        mapped = _map_provider_category(provider_category)
        if mapped:
            return CategoryResult(
                category=mapped,
                confidence=0.70,
                source="provider",
                explanation=f"Mapped from provider category: {provider_category}",
            )

    return CategoryResult(
        category="miscellaneous",
        confidence=0.40,
        source="ml",
        explanation="No matching rules; defaulting to miscellaneous",
    )


def _map_provider_category(provider_cat: str) -> str | None:
    mapping = {
        "food and drink": "dining",
        "shops": "shopping",
        "travel": "travel",
        "transfer": "transfer",
        "payment": "debt_payment",
        "recreation": "entertainment",
        "service": "miscellaneous",
        "healthcare": "health",
        "community": "miscellaneous",
    }
    return mapping.get(provider_cat.lower())


def apply_user_rules(
    description: str,
    merchant_name: str | None,
    amount: Decimal,
    rules: list,
) -> CategoryResult | None:
    """Apply user-defined rules from TransactionRule records."""
    text = f"{description} {merchant_name or ''}".lower()
    for rule in sorted(rules, key=lambda r: r.priority):
        value = rule.match_value.lower()
        field_text = text if rule.match_field in ("description", "merchant_name") else str(amount)

        match = False
        if rule.match_operator == "contains":
            match = value in field_text
        elif rule.match_operator == "equals":
            match = field_text == value
        elif rule.match_operator == "starts_with":
            match = field_text.startswith(value)
        elif rule.match_operator == "ends_with":
            match = field_text.endswith(value)
        elif rule.match_operator == "greater_than":
            match = float(amount) > float(value)
        elif rule.match_operator == "less_than":
            match = float(amount) < float(value)

        if match and rule.set_category:
            return CategoryResult(
                category=rule.set_category,
                confidence=1.0,
                source="rule",
                explanation=f'User rule "{rule.name}" matched',
            )

    return None


def normalize_merchant(merchant_name: str | None) -> str | None:
    if not merchant_name:
        return None
    normalized = re.sub(r"\s+\d{4,}$", "", merchant_name)  # remove trailing digits (location codes)
    normalized = re.sub(r"\s+#\w+", "", normalized)  # remove store numbers
    normalized = normalized.strip().title()
    return normalized
