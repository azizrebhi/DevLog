import pytest

async def test_register_user(client):
    data = {"email": "test@example.com", "password": "password123"}
    response = await client.post("/auth/register", json=data)
    assert response.status_code == 200
    assert "id" in response.json()
    assert response.json()["email"] == "test@example.com"
async def test_login_user(client):
    # First, register the user
    register_data = {"email": "test@example.com", "password": "password123"}
    await client.post("/auth/register", json=register_data)
    login_data = {"username": "test@example.com", "password": "password123"}
    response = await client.post("/auth/login", data=login_data)
    assert response.status_code == 200
    assert "access_token" in response.json()
    assert response.json()["token_type"] == "bearer"
