import pytest 
import pytest_asyncio
from httpx import AsyncClient , ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine , async_sessionmaker , AsyncSession
from app.model import Base 
from app.db import get_async_session
from main import app 
import os 
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://devlog:devlog123@localhost:5432/devlog_test"

)
from app.model import User,Session,WeeklySummary
# runs ONCE for the whole test suite using the scope = "session"
@pytest_asyncio.fixture(scope="session")
async def engine():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    
    # create all tables from your SQLAlchemy models
    # this is NOT alembic — just reads your model definitions
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    yield engine
    
    # after ALL tests finish, drop everything
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    
    await engine.dispose()


# runs before EACH test — gives a fresh session
@pytest_asyncio.fixture
async def db_session(engine):
    # create a session factory using the test engine
    TestSession = async_sessionmaker(engine, expire_on_commit=False)
    
    async with TestSession() as session:
        yield session
        # rollback any uncommitted changes after the test
        await session.rollback()


# runs before EACH test — gives a test HTTP client
@pytest_asyncio.fixture
async def client(db_session):
    # this is the key part — tell FastAPI to use our test session
    # instead of creating a real production session
    async def override_get_async_session():
        yield db_session

    # override the dependency
    app.dependency_overrides[get_async_session] = override_get_async_session

    # create a fake HTTP client that talks to your app in memory
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as ac:
        yield ac

    # clean up the override after the test
    app.dependency_overrides.clear()


# runs before EVERY test automatically — wipes all data
@pytest_asyncio.fixture(autouse=True)
async def clean_tables(engine):
    yield  # test runs here
    # after the test, delete all rows from all tables
    async with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            await conn.execute(table.delete())


# a client that's already logged in — for tests that need auth
@pytest_asyncio.fixture
async def auth_client(client):
    # register a user
    await client.post("/auth/register", json={
        "email": "testuser@example.com",
        "password": "password123456"
    })
    
    # login to get token
    login_resp = await client.post("/auth/login", data={
        "username": "testuser@example.com",
        "password": "password123456"
    })
    
    token = login_resp.json()["access_token"]
    
    # set the token on all future requests from this client
    client.headers.update({"Authorization": f"Bearer {token}"})
    
    return client