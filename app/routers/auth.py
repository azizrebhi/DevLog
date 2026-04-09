from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select 
from fastapi.security import OAuth2PasswordRequestForm
from app.db import get_async_session
from app.model import User
from app.schema import UserCreate, UserResponse ,TokenResponse
from app.utils import hash_password , verify_password , create_access_token, get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/register", response_model=UserResponse)
async def register(user: UserCreate, session: AsyncSession = Depends(get_async_session)):
    result = await session.execute(select(User).where(User.email == user.email))
    existing_user = result.scalar_one_or_none()
    
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    new_user = User(email=user.email, password_hash=hash_password(user.password))
    session.add(new_user)
    await session.commit()
    await session.refresh(new_user)
    return new_user
@router.post("/login",response_model=TokenResponse)
async def login(form_data: OAuth2PasswordRequestForm = Depends(),session:AsyncSession=Depends(get_async_session)):
    result = await session.execute(select(User).where(User.email == form_data.username))
    existing_user = result.scalar_one_or_none()
    if not existing_user:
        raise HTTPException(status_code=401,detail="Invalid credentials")
    password_hash = existing_user.password_hash
    if not verify_password(form_data.password,password_hash) :
        raise HTTPException(status_code=401,detail="Invalid credentials")
    access_token = create_access_token(data={"sub": str(existing_user.id)})
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user_id: str = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session)
):
    result = await session.execute(select(User).where(User.id == current_user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return user
