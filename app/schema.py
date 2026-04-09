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

class SessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id : UUID
    user_id: UUID
    worked_on :str   
    duration : str
    what_learned : str 
    blockers : str
    date : datetime
    updated_at: datetime | None
class SessionCreate(BaseModel):
    worked_on : str   
    duration : str
    what_learned : str 
    blockers : str
class SessionsPage(BaseModel):
    items: list[SessionResponse]
    next_cursor: UUID | None
    has_more: bool