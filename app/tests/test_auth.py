import pytest

async def test_register_user(client):
    data = {"email": "test@example.com", "password": "password123"}
    response = await client.post("/auth/register", json=data)
    assert response.status_code == 200
    assert "id" in response.json()
    assert response.json()["email"] == "test@example.com"
async def test_login_user(client):
    register_data = {"email": "test@example.com", "password": "password123"}
    await client.post("/auth/register", json=register_data)
    login_data = {"username": "test@example.com", "password": "password123"}
    response = await client.post("/auth/login", data=login_data)
    assert response.status_code == 200
    assert "access_token" in response.json()
    assert response.json()["token_type"] == "bearer"
async def test_register_duplicate_email(client):
    data = {"email": "test@example.com", "password": "password123"}
    response = await client.post("/auth/register", json=data)
    response1 = await client.post("/auth/register", json=data)
    assert response1.status_code==400
    

async def test_login_wrong_password(client):
    # TODO: Register a user
    data = {"email": "test@example.com", "password": "password123"}
    response = await client.post("/auth/register", json=data)
    login_data = {"username": "test@example.com", "password": "passwoord123"}
    response1= await client.post("auth/login", data=login_data)
    assert response1.status_code==401
    

async def test_login_nonexistent_user(client):
    login_data = {"username": "test@example.com", "password": "password123"}
    response1= await client.post("auth/login", data=login_data)
    assert response1.status_code==401

   

async def test_get_current_user(auth_client):
    response=await auth_client.get("auth/me")
    # TODO: GET /auth/me with auth_client
    assert "email" in response.json()
    assert "id" in response.json()
    