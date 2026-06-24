import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_etf_screener_returns_list(client: AsyncClient):
    res = await client.get("/api/v1/etf/screen")
    assert res.status_code == 200
    assert isinstance(res.json(), list)


@pytest.mark.asyncio
async def test_etf_screener_filter_by_min_yield(client: AsyncClient):
    res = await client.get("/api/v1/etf/screen?min_yield=0.03")
    assert res.status_code == 200
    for etf in res.json():
        metrics = etf.get("latest_metrics")
        if metrics and metrics.get("dividend_yield") is not None:
            assert float(metrics["dividend_yield"]) >= 0.03


@pytest.mark.asyncio
async def test_etf_screener_filter_by_max_expense(client: AsyncClient):
    res = await client.get("/api/v1/etf/screen?max_expense_ratio=0.005")
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_etf_watchlist_requires_auth(client: AsyncClient):
    res = await client.get("/api/v1/etf/watchlist/mine")
    assert res.status_code in (401, 403)


@pytest.mark.asyncio
async def test_etf_watchlist_returns_list(client: AsyncClient, auth_headers: dict):
    res = await client.get("/api/v1/etf/watchlist/mine", headers=auth_headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list)
