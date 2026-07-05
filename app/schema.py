from pydantic import BaseModel , EmailStr , ConfigDict,Field
from datetime import datetime
from uuid import UUID

class UserCreate(BaseModel):
    email:EmailStr
    password:str = Field(min_length=8)
class UserResponse(BaseModel):
    id:UUID
    email:EmailStr
    created_at:datetime
class TokenResponse(BaseModel):
    access_token: str
    token_type: str




