from decimal import Decimal

import pytest

from app.services.categorization import classify_transaction, normalize_merchant


def test_income_classification():
    result = classify_transaction("PAYROLL DIRECT DEP", None, Decimal("-4200"))
    assert result.category == "income"
    assert result.confidence >= 0.90


def test_rent_classified_as_housing():
    result = classify_transaction("Rent Payment Transfer", None, Decimal("1850"))
    assert result.category == "housing"


def test_netflix_classified_as_subscription():
    result = classify_transaction("NETFLIX", "NETFLIX", Decimal("15.99"))
    assert result.category == "subscription"
    assert result.confidence >= 0.90


def test_starbucks_classified_as_dining():
    result = classify_transaction("Starbucks #1234", "Starbucks", Decimal("7.50"))
    assert result.category == "dining"


def test_whole_foods_classified_as_groceries():
    result = classify_transaction("WHOLE FOODS MKT", "Whole Foods Market", Decimal("142.30"))
    assert result.category == "groceries"


def test_shell_classified_as_transportation():
    result = classify_transaction("SHELL GAS STATION", "Shell", Decimal("72.00"))
    assert result.category == "transportation"


def test_hydro_classified_as_utilities():
    result = classify_transaction("HYDRO ONE", None, Decimal("134.00"))
    assert result.category == "utilities"


def test_td_insurance_classified_correctly():
    result = classify_transaction("TD Insurance", "TD Insurance", Decimal("180.00"))
    assert result.category == "insurance"


def test_questrade_classified_as_investing():
    result = classify_transaction("Questrade Invest", "Questrade", Decimal("500.00"))
    assert result.category == "investing"


def test_unknown_merchant_falls_to_miscellaneous():
    result = classify_transaction("XYZZY RANDOM MERCHANT", None, Decimal("25.00"))
    assert result.category == "miscellaneous"


def test_large_negative_amount_is_income():
    result = classify_transaction("SOME RANDOM CREDIT", None, Decimal("-3500"))
    assert result.category == "income"


def test_merchant_normalization_removes_store_numbers():
    normalized = normalize_merchant("STARBUCKS #1234")
    assert "#1234" not in normalized


def test_merchant_normalization_titlecase():
    normalized = normalize_merchant("whole foods market")
    assert normalized == "Whole Foods Market"


def test_category_source_is_ml():
    result = classify_transaction("Netflix Premium", "Netflix", Decimal("15.99"))
    assert result.source == "ml"


def test_confidence_range():
    result = classify_transaction("Grocery Store", None, Decimal("85.00"))
    assert 0.0 <= result.confidence <= 1.0
