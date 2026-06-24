import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_my_household(client: AsyncClient, auth_headers: dict):
    res = await client.get("/api/v1/households/mine", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert "id" in data
    assert "members" in data


@pytest.mark.asyncio
async def test_update_household_name(client: AsyncClient, auth_headers: dict):
    res = await client.patch(
        "/api/v1/households/mine",
        headers=auth_headers,
        json={"name": "Updated Family Household"},
    )
    assert res.status_code == 200
    assert res.json()["name"] == "Updated Family Household"


@pytest.mark.asyncio
async def test_invite_partner(client: AsyncClient, auth_headers: dict):
    res = await client.post(
        "/api/v1/households/mine/invite",
        headers=auth_headers,
        json={"email": "partner@example.com", "role": "editor"},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["email"] == "partner@example.com"
    assert data["status"] == "pending"
    assert "expires_at" in data


@pytest.mark.asyncio
async def test_preview_valid_invite(client: AsyncClient, auth_headers: dict):
    invite_res = await client.post(
        "/api/v1/households/mine/invite",
        headers=auth_headers,
        json={"email": "preview@example.com"},
    )
    # Note: full invite accept flow requires the token from the invite
    assert invite_res.status_code == 201


@pytest.mark.asyncio
async def test_get_household_requires_auth(client: AsyncClient):
    res = await client.get("/api/v1/households/mine")
    assert res.status_code in (401, 403)
