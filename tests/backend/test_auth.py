import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register_new_user(client: AsyncClient):
    res = await client.post("/api/v1/auth/register", json={
        "email": "newuser@test.com",
        "password": "secure_pass_123",
        "full_name": "New User",
    })
    assert res.status_code == 201
    data = res.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient):
    payload = {"email": "dup@test.com", "password": "pass123", "full_name": "Dup"}
    await client.post("/api/v1/auth/register", json=payload)
    res = await client.post("/api/v1/auth/register", json=payload)
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient):
    await client.post("/api/v1/auth/register", json={
        "email": "login@test.com", "password": "login_pass", "full_name": "Login User"
    })
    res = await client.post("/api/v1/auth/login", json={
        "email": "login@test.com", "password": "login_pass"
    })
    assert res.status_code == 200
    assert "access_token" in res.json()


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient):
    await client.post("/api/v1/auth/register", json={
        "email": "wrong@test.com", "password": "correct", "full_name": "Wrong"
    })
    res = await client.post("/api/v1/auth/login", json={
        "email": "wrong@test.com", "password": "wrong_password"
    })
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_login_nonexistent_user(client: AsyncClient):
    res = await client.post("/api/v1/auth/login", json={
        "email": "nobody@test.com", "password": "anything"
    })
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_get_me_requires_auth(client: AsyncClient):
    res = await client.get("/api/v1/users/me")
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_get_me_with_valid_token(client: AsyncClient, auth_headers: dict):
    res = await client.get("/api/v1/users/me", headers=auth_headers)
    assert res.status_code == 200
    assert "email" in res.json()


@pytest.mark.asyncio
async def test_refresh_token(client: AsyncClient):
    reg = await client.post("/api/v1/auth/register", json={
        "email": "refresh@test.com", "password": "pass", "full_name": "Refresh"
    })
    refresh_token = reg.json()["refresh_token"]
    res = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert res.status_code == 200
    assert "access_token" in res.json()


@pytest.mark.asyncio
async def test_refresh_with_invalid_token(client: AsyncClient):
    res = await client.post("/api/v1/auth/refresh", json={"refresh_token": "garbage.token.here"})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_health_endpoint(client: AsyncClient):
    res = await client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
