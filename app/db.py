from collections.abc import AsyncGenerator
import uuid
from app.model import Base,User
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine , async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, relationship
import os 
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()
postgres_url = os.getenv("postgres_url")

engine =create_async_engine(postgres_url, echo=True)

async_session_maker=async_sessionmaker(engine,expire_on_commit=False)


async def get_async_session()-> AsyncGenerator[AsyncSession,None]:
    async with async_session_maker() as session:
        yield session 