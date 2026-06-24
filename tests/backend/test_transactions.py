from datetime import date

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_transactions_requires_auth(client: AsyncClient):
    res = await client.get("/api/v1/transactions")
    assert res.status_code in (401, 403)


@pytest.mark.asyncio
async def test_list_transactions_returns_list(client: AsyncClient, auth_headers: dict):
    # Fresh user has no accounts/transactions; should return empty list
    res = await client.get("/api/v1/transactions", headers=auth_headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list)


@pytest.mark.asyncio
async def test_transaction_summary_requires_dates(client: AsyncClient, auth_headers: dict):
    res = await client.get("/api/v1/transactions/summary", headers=auth_headers)
    # Missing required query params
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_transaction_summary_with_dates(client: AsyncClient, auth_headers: dict):
    start = str(date.today().replace(day=1))
    end = str(date.today())
    res = await client.get(
        f"/api/v1/transactions/summary?start_date={start}&end_date={end}",
        headers=auth_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert "total_spent" in data
    assert "total_income" in data
    assert "savings_rate" in data
    assert "by_category" in data


@pytest.mark.asyncio
async def test_transaction_filter_by_category(client: AsyncClient, auth_headers: dict):
    res = await client.get(
        "/api/v1/transactions?category=dining",
        headers=auth_headers,
    )
    assert res.status_code == 200
    for txn in res.json():
        assert txn["category"] == "dining"
